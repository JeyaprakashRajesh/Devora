/**
 * Integration tests for startResourceMonitor().
 * Uses mocked WorkspaceService, PodService, NATS and K8s CustomObjectsApi.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CoreV1Api, CustomObjectsApi } from '@kubernetes/client-node'
import { JSONCodec } from 'nats'
import { Subjects } from '@devora/nats'
import { startResourceMonitor } from '../../subscribers/index.js'
import type { WorkspaceService } from '../../services/workspace.service.js'
import type { PodService } from '../../services/pod.service.js'

const getNamespacedCustomObjectMock = vi.fn()

vi.mock('@kubernetes/client-node', async (importOriginal) => {
  const original = await importOriginal<typeof import('@kubernetes/client-node')>()
  return {
    ...original,
    CustomObjectsApi: vi.fn().mockImplementation(() => ({
      getNamespacedCustomObject: getNamespacedCustomObjectMock,
      setDefaultAuthentication: vi.fn(),
    })),
  }
})

const jc = JSONCodec()

function makeLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  } as any
}

function fakeWorkspace(id = '11111111-1111-4111-8111-111111111111') {
  return {
    id,
    userId: '22222222-2222-2222-2222-222222222222',
    orgId: '33333333-3333-3333-3333-333333333333',
    name: 'ws-test',
    status: 'running' as const,
    podName: `ws-${id}`,
    volumeName: `pvc-${id}`,
    cpuLimit: '2',
    memoryLimit: '2Gi',
    projectId: null,
    lastActiveAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

let wsMock: { [K in keyof WorkspaceService]: ReturnType<typeof vi.fn> }
let podMock: { [K in keyof PodService]: ReturnType<typeof vi.fn> }
let publishMock: ReturnType<typeof vi.fn>
let fakeCoreV1Api: CoreV1Api
let stopMonitor: () => void

beforeEach(() => {
  wsMock = {
    getOrCreate: vi.fn(),
    list: vi.fn(),
    getStatus: vi.fn(),
    stop: vi.fn(),
    heartbeat: vi.fn(),
    delete: vi.fn(),
    getLogs: vi.fn(),
    stopIdle: vi.fn(),
    listRunning: vi.fn(async () => []),
  }

  podMock = {
    create: vi.fn(),
    get: vi.fn(async (wsId) => ({
      metadata: { name: `ws-${wsId}` },
      status: { phase: 'Running', podIP: '10.0.0.1' },
    })),
    delete: vi.fn(),
    getPhase: vi.fn(),
    waitUntilReady: vi.fn(),
    listByOrg: vi.fn(),
    getLogs: vi.fn(),
  }

  publishMock = vi.fn()
  getNamespacedCustomObjectMock.mockReset()

  fakeCoreV1Api = {
    basePath: 'http://localhost:8001',
    authentications: { default: {} },
  } as unknown as CoreV1Api
})

afterEach(() => {
  if (stopMonitor) {
    stopMonitor()
  }
})

// ── startResourceMonitor() ────────────────────────────────────────────────────

describe('startResourceMonitor()', () => {
  it('returns a cleanup function', () => {
    stopMonitor = startResourceMonitor(
      wsMock as unknown as WorkspaceService,
      podMock as unknown as PodService,
      { publish: publishMock } as any,
      fakeCoreV1Api,
      'devora-sandboxes',
      makeLogger(),
    )
    expect(typeof stopMonitor).toBe('function')
  })

  it('does not publish events when no running workspaces exist', async () => {
    wsMock.listRunning.mockResolvedValue([])

    stopMonitor = startResourceMonitor(
      wsMock as unknown as WorkspaceService,
      podMock as unknown as PodService,
      { publish: publishMock } as any,
      fakeCoreV1Api,
      'devora-sandboxes',
      makeLogger(),
    )

    // Wait for the initial poll to complete
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(publishMock).not.toHaveBeenCalled()
  })

  it('does not publish when metrics are below spike threshold', async () => {
    const workspace = fakeWorkspace()
    wsMock.listRunning.mockResolvedValue([workspace])

    // CPU and memory well below 90% limit
    getNamespacedCustomObjectMock.mockResolvedValue({
      body: {
        containers: [
          { usage: { cpu: '100m', memory: '512Mi' } }, // 5% of 2 cores = 100m, 512Mi/2Gi = 25%
        ],
      },
    })

    stopMonitor = startResourceMonitor(
      wsMock as unknown as WorkspaceService,
      podMock as unknown as PodService,
      { publish: publishMock } as any,
      fakeCoreV1Api,
      'devora-sandboxes',
      makeLogger(),
    )

    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(publishMock).not.toHaveBeenCalled()
  })

  it('publishes SANDBOX_RESOURCE_SPIKE when CPU exceeds 90%', async () => {
    const workspace = fakeWorkspace()
    wsMock.listRunning.mockResolvedValue([workspace])

    getNamespacedCustomObjectMock.mockResolvedValue({
      body: {
        containers: [
          { usage: { cpu: '1900m', memory: '512Mi' } }, // 95% of 2000m limit
        ],
      },
    })

    stopMonitor = startResourceMonitor(
      wsMock as unknown as WorkspaceService,
      podMock as unknown as PodService,
      { publish: publishMock } as any,
      fakeCoreV1Api,
      'devora-sandboxes',
      makeLogger(),
    )

    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(publishMock).toHaveBeenCalled()
    const [subject] = publishMock.mock.calls[0]
    expect(subject).toBe(Subjects.SANDBOX_RESOURCE_SPIKE)
  })

  it('publishes SANDBOX_RESOURCE_SPIKE when memory exceeds 90%', async () => {
    const workspace = fakeWorkspace()
    wsMock.listRunning.mockResolvedValue([workspace])

    // 1.9Gi of 2Gi = 95% memory
    getNamespacedCustomObjectMock.mockResolvedValue({
      body: {
        containers: [
          { usage: { cpu: '10m', memory: '1945Mi' } },
        ],
      },
    })

    stopMonitor = startResourceMonitor(
      wsMock as unknown as WorkspaceService,
      podMock as unknown as PodService,
      { publish: publishMock } as any,
      fakeCoreV1Api,
      'devora-sandboxes',
      makeLogger(),
    )

    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(publishMock).toHaveBeenCalled()
  })

  it('disables metrics polling when 503 is returned (metrics server unavailable)', async () => {
    const workspace = fakeWorkspace()
    wsMock.listRunning.mockResolvedValue([workspace])

    getNamespacedCustomObjectMock.mockRejectedValue({
      statusCode: 503,
      response: { statusCode: 503 },
    })

    const logger = makeLogger()
    stopMonitor = startResourceMonitor(
      wsMock as unknown as WorkspaceService,
      podMock as unknown as PodService,
      { publish: publishMock } as any,
      fakeCoreV1Api,
      'devora-sandboxes',
      logger,
    )

    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(publishMock).not.toHaveBeenCalled()
  })
})
