import { CustomObjectsApi, type CoreV1Api } from '@kubernetes/client-node'
import { publish, Subjects, type SandboxResourceSpikeEvent } from '@devora/nats'
import type { Logger } from '@devora/logger'
import type { NatsConnection } from 'nats'
import type { PodService } from '../services/pod.service.js'
import type { WorkspaceService, Workspace } from '../services/workspace.service.js'

interface PodMetricsResponse {
  containers?: Array<{
    usage?: {
      cpu?: string
      memory?: string
    }
  }>
}

function parseCpuToMillicores(value: string): number {
  if (!value) {
    return 0
  }

  if (value.endsWith('n')) {
    return Number.parseFloat(value.slice(0, -1)) / 1_000_000
  }

  if (value.endsWith('u')) {
    return Number.parseFloat(value.slice(0, -1)) / 1_000
  }

  if (value.endsWith('m')) {
    return Number.parseFloat(value.slice(0, -1))
  }

  return Number.parseFloat(value) * 1000
}

function parseMemoryToBytes(value: string): number {
  if (!value) {
    return 0
  }

  const match = value.trim().match(/^([0-9]*\.?[0-9]+)([KMGTE]i|[kMGTPE]?|m)?$/)
  if (!match) {
    return Number.parseFloat(value)
  }

  const amount = Number.parseFloat(match[1])
  const unit = match[2] ?? ''
  const multipliers: Record<string, number> = {
    '': 1,
    m: 0.001,
    k: 1000,
    M: 1000 ** 2,
    G: 1000 ** 3,
    T: 1000 ** 4,
    P: 1000 ** 5,
    Ki: 1024,
    Mi: 1024 ** 2,
    Gi: 1024 ** 3,
    Ti: 1024 ** 4,
    Pi: 1024 ** 5,
    Ei: 1024 ** 6,
  }

  return amount * (multipliers[unit] ?? 1)
}

function bytesToMegabytes(bytes: number): number {
  return bytes / 1024 / 1024
}

function createCustomObjectsApi(k8sCoreApi: CoreV1Api): CustomObjectsApi {
  const coreApi = k8sCoreApi as unknown as {
    basePath?: string
    authentications?: { default?: unknown }
  }

  const customObjectsApi = new CustomObjectsApi(coreApi.basePath)
  if (coreApi.authentications?.default) {
    customObjectsApi.setDefaultAuthentication(coreApi.authentications.default as any)
  }

  return customObjectsApi
}

async function readPodMetrics(
  customObjectsApi: CustomObjectsApi,
  namespace: string,
  podName: string,
): Promise<PodMetricsResponse | null> {
  const response = await customObjectsApi.getNamespacedCustomObject(
    'metrics.k8s.io',
    'v1beta1',
    namespace,
    'pods',
    podName,
  )

  return response.body as PodMetricsResponse
}

function buildResourceSpikeEvent(workspace: Workspace, cpu: number, memory: number): SandboxResourceSpikeEvent {
  return {
    workspaceId: workspace.id,
    userId: workspace.userId,
    orgId: workspace.orgId,
    cpu,
    memory,
    detectedAt: new Date().toISOString(),
  }
}

export function startResourceMonitor(
  workspaceService: WorkspaceService,
  podService: PodService,
  nats: NatsConnection,
  k8sCoreApi: CoreV1Api,
  namespace: string,
  logger: Logger,
) {
  const customObjectsApi = createCustomObjectsApi(k8sCoreApi)
  let metricsUnavailable = false
  let running = false

  const poll = async () => {
    if (running || metricsUnavailable) {
      return
    }

    running = true

    try {
      const workspaces = await workspaceService.listRunning()
      for (const workspace of workspaces) {
        try {
          const pod = await podService.get(workspace.id)
          const podIdentifier = pod?.metadata?.name ?? workspace.podName
          if (!podIdentifier) {
            continue
          }

          const metrics = await readPodMetrics(customObjectsApi, namespace, podIdentifier)
          if (!metrics?.containers?.length) {
            continue
          }

          const usage = metrics.containers.reduce(
            (totals, container) => ({
              cpuMillicores: totals.cpuMillicores + parseCpuToMillicores(container.usage?.cpu ?? '0'),
              memoryBytes: totals.memoryBytes + parseMemoryToBytes(container.usage?.memory ?? '0'),
            }),
            { cpuMillicores: 0, memoryBytes: 0 },
          )

          const cpuLimitMillicores = parseCpuToMillicores(workspace.cpuLimit)
          const memoryLimitBytes = parseMemoryToBytes(workspace.memoryLimit)
          const cpuPercent = cpuLimitMillicores > 0
            ? (usage.cpuMillicores / cpuLimitMillicores) * 100
            : 0
          const memoryMegabytes = bytesToMegabytes(usage.memoryBytes)
          const memoryPercent = memoryLimitBytes > 0
            ? (usage.memoryBytes / memoryLimitBytes) * 100
            : 0

          if (cpuPercent > 90 || memoryPercent > 90) {
            const event = buildResourceSpikeEvent(workspace, cpuPercent, memoryMegabytes)
            publish<SandboxResourceSpikeEvent>(nats, Subjects.SANDBOX_RESOURCE_SPIKE, event)
            logger.warn({ workspaceId: workspace.id, cpu: cpuPercent, memory: memoryMegabytes }, 'Resource spike detected')
          }
        } catch (error: any) {
          const statusCode = error?.response?.statusCode ?? error?.statusCode
          if (statusCode === 404 || statusCode === 503) {
            metricsUnavailable = true
            return
          }

          logger.debug({ error, workspaceId: workspace.id }, 'Failed to check workspace resource usage')
        }
      }
    } finally {
      running = false
    }
  }

  const intervalId = setInterval(() => {
    void poll()
  }, 60_000)

  void poll()

  return () => clearInterval(intervalId)
}
