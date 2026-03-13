import { randomUUID } from 'node:crypto'
import { and, desc, eq, isNull, lt, ne, or } from 'drizzle-orm'
import {
  publish,
  Subjects,
  type SandboxCreatedEvent,
  type SandboxStartedEvent,
  type SandboxStoppedEvent,
} from '@devora/nats'
import { ValidationError } from '@devora/errors'
import type { Logger } from '@devora/logger'
import { Db, schema } from '@devora/db'
import type { NatsConnection } from 'nats'
import type { V1Pod } from '@kubernetes/client-node'
import type { Config } from '../config.js'
import {
  podName,
  pvcName,
  type WorkspacePodOptions,
} from '../k8s/workspace-pod.template.js'
import type { WorkspacePVCOptions } from '../k8s/workspace-pvc.template.js'
import {
  WorkspaceNotFoundError,
  WorkspaceOwnershipError,
} from '../errors.js'
import { PodService, type PodPhase, getK8sErrorStatusCode } from './pod.service.js'
import { VolumeService } from './volume.service.js'

const { workspaces } = schema

const DEFAULT_CPU_REQUEST = '100m'
const DEFAULT_MEMORY_REQUEST = '256Mi'

export type Workspace = typeof workspaces.$inferSelect
export type WorkspaceLifecycleStatus =
  | 'provisioning'
  | 'starting'
  | 'running'
  | 'stopped'
  | 'deleted'

export interface WorkspaceSession {
  workspaceId: string
  podName: string
  status: 'starting' | 'running'
  proxyPath: string
}

export interface WorkspaceStatus {
  workspaceId: string
  status: WorkspaceLifecycleStatus
  podPhase: PodPhase | null
  containersReady: boolean
  cpu: string | null
  memory: string | null
}

function isConflictError(error: unknown): boolean {
  return getK8sErrorStatusCode(error) === 409
}

function isContainersReady(pod: V1Pod | null): boolean {
  return Boolean(pod?.status?.containerStatuses?.[0]?.ready)
}

export class WorkspaceService {
  constructor(
    private readonly db: Db,
    private readonly podService: PodService,
    private readonly volumeService: VolumeService,
    private readonly nats: NatsConnection,
    private readonly config: Config,
    private readonly logger: Logger,
  ) {}

  async getOrCreate(
    userId: string,
    orgId: string,
    projectId?: string,
  ): Promise<WorkspaceSession> {
    let workspace = await this.findLatestWorkspace(userId, projectId)
    let created = false

    if (!workspace) {
      const workspaceId = randomUUID()
      const volumeName = pvcName(workspaceId)

      ;[workspace] = await this.db
        .insert(workspaces)
        .values({
          id: workspaceId,
          userId,
          orgId,
          projectId: projectId ?? null,
          name: `workspace-${workspaceId}`,
          status: 'provisioning',
          podName: null,
          volumeName,
          cpuLimit: this.config.WORKSPACE_DEFAULT_CPU,
          memoryLimit: this.config.WORKSPACE_DEFAULT_MEMORY,
          lastActiveAt: new Date(),
        })
        .returning()

      created = true
    }

    workspace = await this.ensureVolume(workspace)

    const currentPod = await this.podService.get(workspace.id)
    const currentPhase = (currentPod?.status?.phase ?? null) as PodPhase | null
    const ready = isContainersReady(currentPod)

    if (currentPhase === 'Running' && ready) {
      const updated = await this.updateWorkspace(workspace.id, {
        status: 'running',
        podName: currentPod?.metadata?.name ?? podName(workspace.id),
        lastActiveAt: new Date(),
      })

      return this.toSession(updated, 'running')
    }

    if (currentPhase === 'Pending' || (currentPhase === 'Running' && !ready)) {
      const updated = await this.updateWorkspace(workspace.id, {
        status: 'starting',
        podName: currentPod?.metadata?.name ?? podName(workspace.id),
        lastActiveAt: new Date(),
      })

      return this.toSession(updated, 'starting')
    }

    if (
      currentPhase === 'Failed'
      || currentPhase === 'Succeeded'
      || currentPhase === 'Unknown'
    ) {
      await this.podService.delete(workspace.id)
    }

    const desiredPodName = podName(workspace.id)
    workspace = await this.updateWorkspace(workspace.id, {
      status: 'starting',
      podName: desiredPodName,
      lastActiveAt: new Date(),
    })

    const options = this.buildPodOptions(workspace)
    try {
      await this.podService.create(options)
    } catch (error) {
      if (!isConflictError(error)) {
        throw error
      }
      this.logger.info({ workspaceId: workspace.id }, 'Workspace pod already exists; treating create as idempotent')
    }

    const emittedPodName = podName(workspace.id)
    if (created) {
      publish<SandboxCreatedEvent>(this.nats, Subjects.SANDBOX_CREATED, {
        workspaceId: workspace.id,
        userId: workspace.userId,
        orgId: workspace.orgId,
        projectId: workspace.projectId ?? undefined,
        podName: emittedPodName,
        createdAt: new Date().toISOString(),
      })
    } else {
      publish<SandboxStartedEvent>(this.nats, Subjects.SANDBOX_STARTED, {
        workspaceId: workspace.id,
        userId: workspace.userId,
        orgId: workspace.orgId,
        podName: emittedPodName,
        startedAt: new Date().toISOString(),
      })
    }

    return this.toSession(workspace, 'starting')
  }

  async getStatus(workspaceId: string, userId: string): Promise<WorkspaceStatus> {
    let workspace = await this.loadOwnedWorkspace(workspaceId, userId)
    const pod = await this.podService.get(workspaceId)
    const podPhase = (pod?.status?.phase ?? null) as PodPhase | null
    const containersReady = isContainersReady(pod)

    if (podPhase === 'Running' && containersReady && workspace.status !== 'running') {
      workspace = await this.updateWorkspace(workspaceId, {
        status: 'running',
        podName: pod?.metadata?.name ?? workspace.podName,
      })
    }

    return {
      workspaceId,
      status: workspace.status as WorkspaceLifecycleStatus,
      podPhase,
      containersReady,
      cpu: null,
      memory: null,
    }
  }

  async stop(workspaceId: string, userId: string): Promise<void> {
    const workspace = await this.loadOwnedWorkspace(workspaceId, userId)
    await this.stopWorkspace(workspace, 'manual')
  }

  async delete(workspaceId: string, userId: string): Promise<void> {
    const workspace = await this.loadOwnedWorkspace(workspaceId, userId)

    await this.podService.delete(workspaceId)
    await this.volumeService.delete(workspaceId)
    await this.updateWorkspace(workspaceId, {
      status: 'deleted',
      podName: null,
      volumeName: null,
    })

    this.logger.warn(`Workspace ${workspaceId} permanently deleted by ${userId}`)
  }

  async heartbeat(workspaceId: string, userId: string): Promise<void> {
    await this.loadOwnedWorkspace(workspaceId, userId)
    await this.updateWorkspace(workspaceId, {
      lastActiveAt: new Date(),
    })
  }

  async stopIdle(idleThresholdMinutes?: number): Promise<number> {
    const threshold = idleThresholdMinutes ?? this.config.IDLE_TIMEOUT_MINUTES
    const cutoff = new Date(Date.now() - threshold * 60_000)

    const idleWorkspaces = await this.db
      .select()
      .from(workspaces)
      .where(and(eq(workspaces.status, 'running'), lt(workspaces.lastActiveAt, cutoff)))
      .orderBy(desc(workspaces.createdAt))

    for (const workspace of idleWorkspaces) {
      await this.stopWorkspace(workspace, 'idle')
      this.logger.info(`Auto-stopped idle workspace ${workspace.id}`)
    }

    return idleWorkspaces.length
  }

  async list(userId: string): Promise<Workspace[]> {
    return this.db
      .select()
      .from(workspaces)
      .where(and(eq(workspaces.userId, userId), ne(workspaces.status, 'deleted')))
      .orderBy(desc(workspaces.createdAt))
  }

  async listRunning(): Promise<Workspace[]> {
    return this.db
      .select()
      .from(workspaces)
      .where(eq(workspaces.status, 'running'))
      .orderBy(desc(workspaces.createdAt))
  }

  async getLogs(
    workspaceId: string,
    userId: string,
    tailLines?: number,
  ): Promise<string> {
    const workspace = await this.loadOwnedWorkspace(workspaceId, userId)
    if (workspace.status !== 'running') {
      throw new ValidationError('Workspace is not running')
    }

    return this.podService.getLogs(workspaceId, tailLines)
  }

  private async findLatestWorkspace(
    userId: string,
    projectId?: string,
  ): Promise<Workspace | undefined> {
    const projectPredicate = projectId
      ? or(eq(workspaces.projectId, projectId), isNull(workspaces.projectId))
      : isNull(workspaces.projectId)

    const [workspace] = await this.db
      .select()
      .from(workspaces)
      .where(and(eq(workspaces.userId, userId), ne(workspaces.status, 'deleted'), projectPredicate))
      .orderBy(desc(workspaces.createdAt))
      .limit(1)

    return workspace
  }

  private async loadOwnedWorkspace(
    workspaceId: string,
    userId: string,
  ): Promise<Workspace> {
    const [workspace] = await this.db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1)

    if (!workspace) {
      throw new WorkspaceNotFoundError(workspaceId)
    }

    if (workspace.userId !== userId) {
      throw new WorkspaceOwnershipError()
    }

    return workspace
  }

  private async ensureVolume(workspace: Workspace): Promise<Workspace> {
    const desiredVolumeName = workspace.volumeName ?? pvcName(workspace.id)
    const exists = await this.volumeService.exists(workspace.id)

    if (!exists) {
      const options: WorkspacePVCOptions = {
        pvcName: desiredVolumeName,
        workspaceId: workspace.id,
        userId: workspace.userId,
        orgId: workspace.orgId,
        namespace: this.config.K8S_NAMESPACE,
        storageSize: this.config.WORKSPACE_DEFAULT_STORAGE,
        storageClass: this.config.WORKSPACE_STORAGE_CLASS,
      }

      try {
        await this.volumeService.create(options)
      } catch (error) {
        if (!isConflictError(error)) {
          throw error
        }
        this.logger.info({ workspaceId: workspace.id }, 'Workspace PVC already exists; treating create as idempotent')
      }
    }

    if (workspace.volumeName !== desiredVolumeName) {
      return this.updateWorkspace(workspace.id, { volumeName: desiredVolumeName })
    }

    return workspace
  }

  private buildPodOptions(workspace: Workspace): WorkspacePodOptions {
    return {
      podName: podName(workspace.id),
      workspaceId: workspace.id,
      userId: workspace.userId,
      orgId: workspace.orgId,
      volumeName: workspace.volumeName ?? pvcName(workspace.id),
      cpuLimit: workspace.cpuLimit,
      cpuRequest: DEFAULT_CPU_REQUEST,
      memoryLimit: workspace.memoryLimit,
      memoryRequest: DEFAULT_MEMORY_REQUEST,
      image: this.config.WORKSPACE_IMAGE,
      namespace: this.config.K8S_NAMESPACE,
      ollamaUrl: this.config.OLLAMA_URL,
      platformApiUrl: this.config.PLATFORM_API_URL,
      storageClass: this.config.WORKSPACE_STORAGE_CLASS,
    }
  }

  private async updateWorkspace(
    workspaceId: string,
    data: Partial<typeof workspaces.$inferInsert>,
  ): Promise<Workspace> {
    const [updated] = await this.db
      .update(workspaces)
      .set(data)
      .where(eq(workspaces.id, workspaceId))
      .returning()

    if (!updated) {
      throw new WorkspaceNotFoundError(workspaceId)
    }

    return updated
  }

  private toSession(
    workspace: Workspace,
    status: 'starting' | 'running',
  ): WorkspaceSession {
    return {
      workspaceId: workspace.id,
      podName: workspace.podName ?? podName(workspace.id),
      status,
      proxyPath: `/api/sandbox/workspaces/${workspace.id}/connect`,
    }
  }

  private async stopWorkspace(
    workspace: Workspace,
    reason: 'manual' | 'idle',
  ): Promise<void> {
    await this.podService.delete(workspace.id)
    await this.updateWorkspace(workspace.id, {
      status: 'stopped',
      podName: null,
    })

    publish<SandboxStoppedEvent>(this.nats, Subjects.SANDBOX_STOPPED, {
      workspaceId: workspace.id,
      userId: workspace.userId,
      orgId: workspace.orgId,
      reason,
      stoppedAt: new Date().toISOString(),
    })
  }
}