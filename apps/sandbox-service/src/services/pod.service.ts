import type { CoreV1Api, V1Pod } from '@kubernetes/client-node'
import type { Logger } from '@devora/logger'
import {
  buildWorkspacePod,
  podName,
  type WorkspacePodOptions,
} from '../k8s/workspace-pod.template.js'
import {
  SandboxInfrastructureUnavailableError,
  WorkspaceFailedError,
  WorkspaceTimeoutError,
} from '../errors.js'

export type PodPhase = 'Pending' | 'Running' | 'Succeeded' | 'Failed' | 'Unknown'

function getStatusCode(error: unknown): number | undefined {
  const value = error as {
    response?: { statusCode?: number }
    statusCode?: number
    body?: { code?: number }
  }
  return value.response?.statusCode ?? value.statusCode ?? value.body?.code
}

function getFailureReason(pod: V1Pod | null): string | undefined {
  return pod?.status?.message ?? pod?.status?.reason ?? pod?.status?.containerStatuses?.[0]?.state?.terminated?.message
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isConnectionRefused(error: unknown): boolean {
  const value = error as {
    code?: string
    cause?: { code?: string }
    originalError?: { code?: string }
  }

  return (
    value?.code === 'ECONNREFUSED'
    || value?.cause?.code === 'ECONNREFUSED'
    || value?.originalError?.code === 'ECONNREFUSED'
  )
}

function wrapK8sUnavailable(error: unknown): never {
  if (isConnectionRefused(error)) {
    throw new SandboxInfrastructureUnavailableError(
      'Sandbox infrastructure is unavailable. Kubernetes API is not reachable.',
    )
  }

  throw error
}

export class PodService {
  constructor(
    private readonly coreV1Api: CoreV1Api,
    private readonly namespace: string,
    private readonly logger: Logger,
  ) {}

  async create(opts: WorkspacePodOptions): Promise<V1Pod> {
    try {
      const response = await this.coreV1Api.createNamespacedPod(
        this.namespace,
        buildWorkspacePod(opts),
      )
      return response.body
    } catch (error) {
      wrapK8sUnavailable(error)
    }
  }

  async get(workspaceId: string): Promise<V1Pod | null> {
    try {
      const response = await this.coreV1Api.readNamespacedPod(
        podName(workspaceId),
        this.namespace,
      )
      return response.body
    } catch (error) {
      if (getStatusCode(error) === 404) {
        return null
      }
      wrapK8sUnavailable(error)
    }
  }

  async delete(workspaceId: string): Promise<void> {
    try {
      await this.coreV1Api.deleteNamespacedPod(
        podName(workspaceId),
        this.namespace,
      )
    } catch (error) {
      if (getStatusCode(error) === 404) {
        return
      }
      wrapK8sUnavailable(error)
    }
  }

  async getPhase(workspaceId: string): Promise<PodPhase | null> {
    const pod = await this.get(workspaceId)
    const phase = pod?.status?.phase
    if (!phase) {
      return null
    }
    return phase as PodPhase
  }

  async waitUntilReady(workspaceId: string, timeoutMs: number = 30000): Promise<void> {
    const startedAt = Date.now()

    while (Date.now() - startedAt <= timeoutMs) {
      const phase = await this.getPhase(workspaceId)
      const pod = await this.get(workspaceId)
      const containersReady = Boolean(pod?.status?.containerStatuses?.[0]?.ready)

      this.logger.debug({ workspaceId, phase, containersReady, elapsedMs: Date.now() - startedAt }, 'Polling workspace pod readiness')

      if (phase === 'Running' && containersReady) {
        return
      }

      if (phase === 'Failed') {
        throw new WorkspaceFailedError(workspaceId, getFailureReason(pod))
      }

      await sleep(2000)
    }

    throw new WorkspaceTimeoutError(workspaceId)
  }

  async listByOrg(orgId: string): Promise<V1Pod[]> {
    try {
      const response = await this.coreV1Api.listNamespacedPod(
        this.namespace,
        undefined,
        undefined,
        undefined,
        undefined,
        `devora.io/org-id=${orgId}`,
      )
      return response.body.items
    } catch (error) {
      wrapK8sUnavailable(error)
    }
  }

  async getLogs(workspaceId: string, tailLines: number = 100): Promise<string> {
    try {
      const response = await this.coreV1Api.readNamespacedPodLog(
        podName(workspaceId),
        this.namespace,
        'workspace',
        false,
        undefined,
        undefined,
        undefined,
        false,
        undefined,
        tailLines,
        false,
      )

      return response.body
    } catch (error) {
      wrapK8sUnavailable(error)
    }
  }
}

export { getStatusCode as getK8sErrorStatusCode }