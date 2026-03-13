import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CoreV1Api } from '@kubernetes/client-node'
import { PodService } from '../../services/pod.service.js'
import { WorkspaceTimeoutError, WorkspaceFailedError } from '../../errors.js'
import { podName } from '../../k8s/workspace-pod.template.js'
import type { Logger } from '@devora/logger'
import type { WorkspacePodOptions } from '../../k8s/workspace-pod.template.js'

const TEST_NAMESPACE = 'devora-sandboxes'
const TEST_WS_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

function makePodResponse(workspaceId: string, phase = 'Running', ready = true) {
  return {
    body: {
      metadata: { name: podName(workspaceId) },
      status: {
        phase,
        podIP: '10.0.0.1',
        containerStatuses: [{ name: 'workspace', ready, restartCount: 0, image: '', imageID: '', started: ready }],
      },
    },
  }
}

function makeK8sError(statusCode: number) {
  return { response: { statusCode }, statusCode }
}

function makeLogger(): Logger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn(),
  } as unknown as Logger
}

let coreV1Api: Partial<CoreV1Api>
let podService: PodService

const baseCreateOpts: WorkspacePodOptions = {
  podName: podName(TEST_WS_ID),
  workspaceId: TEST_WS_ID,
  userId: 'user-test',
  orgId: 'org-test',
  volumeName: `pvc-${TEST_WS_ID}`,
  cpuLimit: '2',
  cpuRequest: '100m',
  memoryLimit: '2Gi',
  memoryRequest: '256Mi',
  image: 'devora/workspace:latest',
  namespace: TEST_NAMESPACE,
  ollamaUrl: 'http://ollama:11434',
  platformApiUrl: 'http://gateway:4000',
  storageClass: 'standard',
}

beforeEach(() => {
  coreV1Api = {
    createNamespacedPod: vi.fn(async () => makePodResponse(TEST_WS_ID)),
    readNamespacedPod: vi.fn(async () => makePodResponse(TEST_WS_ID)),
    deleteNamespacedPod: vi.fn(async () => ({ body: {} })),
    listNamespacedPod: vi.fn(async () => ({ body: { items: [] } })),
    readNamespacedPodLog: vi.fn(async () => ({ body: 'log output' })),
  }
  podService = new PodService(coreV1Api as CoreV1Api, TEST_NAMESPACE, makeLogger())
})

// ── create() ─────────────────────────────────────────────────────────────────

describe('PodService.create()', () => {
  it('calls coreV1Api.createNamespacedPod with correct namespace', async () => {
    await podService.create(baseCreateOpts)
    expect(coreV1Api.createNamespacedPod).toHaveBeenCalledWith(
      TEST_NAMESPACE,
      expect.any(Object),
    )
  })

  it('returns the created pod object from K8s response', async () => {
    const result = await podService.create(baseCreateOpts)
    expect(result.metadata?.name).toBe(podName(TEST_WS_ID))
  })

  it('throws if K8s returns 409 (pod already exists)', async () => {
    (coreV1Api.createNamespacedPod as ReturnType<typeof vi.fn>).mockRejectedValue(
      makeK8sError(409),
    )
    await expect(podService.create(baseCreateOpts)).rejects.toMatchObject(
      expect.objectContaining({ response: { statusCode: 409 } }),
    )
  })
})

// ── get() ─────────────────────────────────────────────────────────────────────

describe('PodService.get()', () => {
  it('returns pod when found', async () => {
    const result = await podService.get(TEST_WS_ID)
    expect(result).not.toBeNull()
    expect(result?.metadata?.name).toBe(podName(TEST_WS_ID))
  })

  it('returns null when K8s returns 404', async () => {
    (coreV1Api.readNamespacedPod as ReturnType<typeof vi.fn>).mockRejectedValue(
      makeK8sError(404),
    )
    const result = await podService.get(TEST_WS_ID)
    expect(result).toBeNull()
  })

  it('rethrows on non-404 K8s errors', async () => {
    (coreV1Api.readNamespacedPod as ReturnType<typeof vi.fn>).mockRejectedValue(
      makeK8sError(500),
    )
    await expect(podService.get(TEST_WS_ID)).rejects.toMatchObject(
      expect.objectContaining({ statusCode: 500 }),
    )
  })
})

// ── delete() ─────────────────────────────────────────────────────────────────

describe('PodService.delete()', () => {
  it('calls coreV1Api.deleteNamespacedPod with correct pod name', async () => {
    await podService.delete(TEST_WS_ID)
    expect(coreV1Api.deleteNamespacedPod).toHaveBeenCalledWith(
      podName(TEST_WS_ID),
      TEST_NAMESPACE,
    )
  })

  it('does not throw when K8s returns 404', async () => {
    (coreV1Api.deleteNamespacedPod as ReturnType<typeof vi.fn>).mockRejectedValue(
      makeK8sError(404),
    )
    await expect(podService.delete(TEST_WS_ID)).resolves.not.toThrow()
  })

  it('throws on non-404 K8s errors', async () => {
    (coreV1Api.deleteNamespacedPod as ReturnType<typeof vi.fn>).mockRejectedValue(
      makeK8sError(403),
    )
    await expect(podService.delete(TEST_WS_ID)).rejects.toMatchObject(
      expect.objectContaining({ statusCode: 403 }),
    )
  })
})

// ── getPhase() ────────────────────────────────────────────────────────────────

describe('PodService.getPhase()', () => {
  it('returns Pending when pod is pending', async () => {
    (coreV1Api.readNamespacedPod as ReturnType<typeof vi.fn>).mockResolvedValue(
      makePodResponse(TEST_WS_ID, 'Pending', false),
    )
    expect(await podService.getPhase(TEST_WS_ID)).toBe('Pending')
  })

  it('returns Running when pod is running', async () => {
    (coreV1Api.readNamespacedPod as ReturnType<typeof vi.fn>).mockResolvedValue(
      makePodResponse(TEST_WS_ID, 'Running', true),
    )
    expect(await podService.getPhase(TEST_WS_ID)).toBe('Running')
  })

  it('returns null when pod does not exist', async () => {
    (coreV1Api.readNamespacedPod as ReturnType<typeof vi.fn>).mockRejectedValue(
      makeK8sError(404),
    )
    expect(await podService.getPhase(TEST_WS_ID)).toBeNull()
  })

  it('returns Failed when pod has failed', async () => {
    (coreV1Api.readNamespacedPod as ReturnType<typeof vi.fn>).mockResolvedValue(
      makePodResponse(TEST_WS_ID, 'Failed', false),
    )
    expect(await podService.getPhase(TEST_WS_ID)).toBe('Failed')
  })
})

// ── waitUntilReady() ──────────────────────────────────────────────────────────

describe('PodService.waitUntilReady()', () => {
  it('resolves when pod becomes Running with containers ready', async () => {
    let callCount = 0
    ;(coreV1Api.readNamespacedPod as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      callCount++
      if (callCount < 3) return makePodResponse(TEST_WS_ID, 'Pending', false)
      return makePodResponse(TEST_WS_ID, 'Running', true)
    })
    await expect(podService.waitUntilReady(TEST_WS_ID, 10000)).resolves.not.toThrow()
  }, 15000)

  it('rejects with WorkspaceFailedError when phase becomes Failed', async () => {
    (coreV1Api.readNamespacedPod as ReturnType<typeof vi.fn>).mockResolvedValue(
      makePodResponse(TEST_WS_ID, 'Failed', false),
    )
    await expect(podService.waitUntilReady(TEST_WS_ID, 10000)).rejects.toBeInstanceOf(
      WorkspaceFailedError,
    )
  })

  it('rejects with WorkspaceTimeoutError after timeout', async () => {
    (coreV1Api.readNamespacedPod as ReturnType<typeof vi.fn>).mockResolvedValue(
      makePodResponse(TEST_WS_ID, 'Pending', false),
    )
    await expect(podService.waitUntilReady(TEST_WS_ID, 100)).rejects.toBeInstanceOf(
      WorkspaceTimeoutError,
    )
  }, 5000)
})

// ── getLogs() ─────────────────────────────────────────────────────────────────

describe('PodService.getLogs()', () => {
  it('returns log string', async () => {
    (coreV1Api.readNamespacedPodLog as ReturnType<typeof vi.fn>).mockResolvedValue({ body: 'log line 1\nlog line 2\n' })
    const logs = await podService.getLogs(TEST_WS_ID)
    expect(logs).toBe('log line 1\nlog line 2\n')
  })

  it('passes tailLines parameter', async () => {
    await podService.getLogs(TEST_WS_ID, 50)
    expect(coreV1Api.readNamespacedPodLog).toHaveBeenCalledWith(
      podName(TEST_WS_ID),
      TEST_NAMESPACE,
      'workspace',
      false,
      undefined,
      undefined,
      undefined,
      false,
      undefined,
      50,
      false,
    )
  })
})
