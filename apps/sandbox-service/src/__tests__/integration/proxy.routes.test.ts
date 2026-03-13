/**
 * Integration tests for proxy routes (GET /workspaces/:id/connect).
 * Tests HTTP-level responses only (no WebSocket upgrade testing).
 */
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../app.js'
import { makeSignJwt, getAuthHeader, TEST_USER_ID, TEST_ORG_ID } from '../helpers.js'
import type { WorkspaceService } from '../../services/workspace.service.js'
import type { PodService } from '../../services/pod.service.js'
import { WorkspaceNotFoundError, WorkspaceOwnershipError } from '../../errors.js'
import { fakePod } from '../helpers.js'

const NOW = new Date('2024-06-01T00:00:00Z')

function fakeWorkspace(wsId: string, status = 'running') {
  return {
    id: wsId,
    userId: TEST_USER_ID,
    orgId: TEST_ORG_ID,
    projectId: null,
    name: 'workspace-test',
    status,
    podName: null,
    volumeName: null,
    cpuLimit: '2',
    memoryLimit: '2Gi',
    lastActiveAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
  }
}

function fakeStatus(wsId: string, status = 'running') {
  return {
    workspaceId: wsId,
    status,
    podPhase: status === 'running' ? 'Running' : 'Pending',
    containersReady: status === 'running',
    cpu: null,
    memory: null,
  }
}

type WsMock = { [K in keyof WorkspaceService]: ReturnType<typeof vi.fn> }
type PodMock = { [K in keyof PodService]: ReturnType<typeof vi.fn> }

let app: FastifyInstance
let wsMock: WsMock
let podMock: PodMock
let signJwt: (overrides?: Record<string, unknown>) => string

beforeAll(async () => {
  wsMock = {
    getOrCreate: vi.fn(),
    list: vi.fn(),
    getStatus: vi.fn(),
    stop: vi.fn(),
    heartbeat: vi.fn(),
    delete: vi.fn(),
    getLogs: vi.fn(),
    stopIdle: vi.fn(async () => 0),
    listRunning: vi.fn(async () => []),
  }

  podMock = {
    create: vi.fn(),
    get: vi.fn(async (wsId: string) => fakePod(wsId)),
    delete: vi.fn(),
    getPhase: vi.fn(),
    waitUntilReady: vi.fn(),
    listByOrg: vi.fn(async () => []),
    getLogs: vi.fn(),
  }

  app = await buildApp({
    skipInfrastructurePlugins: true,
    registerRoutesOptions: {
      workspaceService: wsMock as unknown as WorkspaceService,
      podService: podMock as unknown as PodService,
    },
  })
  await app.ready()
  signJwt = makeSignJwt(app) as any
})

afterAll(async () => {
  await app.close()
})

beforeEach(() => {
  vi.resetAllMocks()
  wsMock.getStatus.mockImplementation(async (wsId: string) => fakeStatus(wsId, 'running'))
  podMock.get.mockImplementation(async (wsId: string) => fakePod(wsId))
  podMock.stopIdle = vi.fn(async () => 0)
})

// ── GET /workspaces/:workspaceId/connect ──────────────────────────────────────

describe('GET /workspaces/:workspaceId/connect', () => {
  it('returns 401 when no auth token is provided', async () => {
    const wsId = randomUUID()
    const res = await app.inject({
      method: 'GET',
      url: `/workspaces/${wsId}/connect`,
    })
    expect(res.statusCode).toBe(401)
  })

  it('returns 400 when workspace ID is not a valid UUID', async () => {
    const token = signJwt()
    const res = await app.inject({
      method: 'GET',
      url: '/workspaces/not-a-uuid/connect',
      headers: getAuthHeader(token),
    })
    expect(res.statusCode).toBe(400)
  })

  it('returns 404 when workspace does not exist', async () => {
    const wsId = randomUUID()
    wsMock.getStatus.mockRejectedValue(new WorkspaceNotFoundError(wsId))
    const token = signJwt()
    const res = await app.inject({
      method: 'GET',
      url: `/workspaces/${wsId}/connect`,
      headers: getAuthHeader(token),
    })
    expect(res.statusCode).toBe(404)
  })

  it('returns 403 when workspace belongs to a different user', async () => {
    const wsId = randomUUID()
    wsMock.getStatus.mockRejectedValue(new WorkspaceOwnershipError())
    const token = signJwt()
    const res = await app.inject({
      method: 'GET',
      url: `/workspaces/${wsId}/connect`,
      headers: getAuthHeader(token),
    })
    expect(res.statusCode).toBe(403)
  })

  it('returns 409 when workspace is not in running state', async () => {
    const wsId = randomUUID()
    wsMock.getStatus.mockResolvedValue(fakeStatus(wsId, 'stopped'))
    const token = signJwt()
    const res = await app.inject({
      method: 'GET',
      url: `/workspaces/${wsId}/connect`,
      headers: getAuthHeader(token),
    })
    expect(res.statusCode).toBe(409)
    expect(res.json()).toHaveProperty('code', 'SANDBOX_NOT_READY')
  })

  it('returns 503 when pod has no IP', async () => {
    const wsId = randomUUID()
    wsMock.getStatus.mockResolvedValue(fakeStatus(wsId, 'running'))
    podMock.get.mockResolvedValue({
      metadata: { name: `ws-${wsId}` },
      status: { phase: 'Running', containerStatuses: [{ ready: true }] },
      // No podIP
    })
    const token = signJwt()
    const res = await app.inject({
      method: 'GET',
      url: `/workspaces/${wsId}/connect`,
      headers: getAuthHeader(token),
    })
    expect(res.statusCode).toBe(503)
    expect(res.json()).toHaveProperty('code', 'SANDBOX_NO_IP')
  })

  it('returns 503 when pod is not found', async () => {
    const wsId = randomUUID()
    wsMock.getStatus.mockResolvedValue(fakeStatus(wsId, 'running'))
    podMock.get.mockResolvedValue(null)
    const token = signJwt()
    const res = await app.inject({
      method: 'GET',
      url: `/workspaces/${wsId}/connect`,
      headers: getAuthHeader(token),
    })
    expect(res.statusCode).toBe(503)
  })
})
