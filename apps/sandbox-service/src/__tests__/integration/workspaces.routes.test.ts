/**
 * Integration tests for /workspaces routes.
 * Uses buildApp({ skipInfrastructurePlugins: true }) with mocked WorkspaceService.
 */
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../app.js'
import {
  makeSignJwt,
  getAuthHeader,
  TEST_USER_ID,
  TEST_ORG_ID,
} from '../helpers.js'
import type { WorkspaceService } from '../../services/workspace.service.js'
import {
  WorkspaceNotFoundError,
  WorkspaceOwnershipError,
} from '../../errors.js'
import type { PodService } from '../../services/pod.service.js'

const NOW = new Date('2024-06-01T00:00:00Z')

function fakeWorkspace(overrides: Record<string, unknown> = {}) {
  return {
    id: randomUUID(),
    userId: TEST_USER_ID,
    orgId: TEST_ORG_ID,
    projectId: null,
    name: 'workspace-test',
    status: 'stopped' as const,
    podName: null,
    volumeName: null,
    cpuLimit: '2',
    memoryLimit: '2Gi',
    lastActiveAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

function fakeSession(wsId = randomUUID()) {
  return {
    workspace: fakeWorkspace({ id: wsId }),
    token: 'ws-token-abc',
  }
}

function fakeStatus(wsId = randomUUID()) {
  return {
    workspace: fakeWorkspace({ id: wsId, status: 'running' }),
    podPhase: 'Running',
    podIp: '10.0.0.1',
  }
}

type WsMock = { [K in keyof WorkspaceService]: ReturnType<typeof vi.fn> }

let app: FastifyInstance
let wsMock: WsMock
let podMock: { get: ReturnType<typeof vi.fn> } & Partial<Record<keyof PodService, ReturnType<typeof vi.fn>>>
let signJwt: (overrides?: Record<string, unknown>) => string

beforeAll(async () => {
  wsMock = {
    getOrCreate: vi.fn(async () => fakeSession()),
    list: vi.fn(async () => [fakeWorkspace()]),
    getStatus: vi.fn(async () => fakeStatus()),
    stop: vi.fn(async () => undefined),
    heartbeat: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
    getLogs: vi.fn(async () => 'log line 1\nlog line 2\n'),
    stopIdle: vi.fn(async () => 0),
    listRunning: vi.fn(async () => []),
  }

  podMock = {
    get: vi.fn(async () => null),
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
  vi.clearAllMocks()
  // Restore defaults after each test
  wsMock.getOrCreate.mockResolvedValue(fakeSession())
  wsMock.list.mockResolvedValue([fakeWorkspace()])
  wsMock.getStatus.mockResolvedValue(fakeStatus())
  wsMock.stop.mockResolvedValue(undefined)
  wsMock.heartbeat.mockResolvedValue(undefined)
  wsMock.delete.mockResolvedValue(undefined)
  wsMock.getLogs.mockResolvedValue('log line 1\nlog line 2\n')
})

// ── POST /workspaces ──────────────────────────────────────────────────────────

describe('POST /workspaces', () => {
  it('returns 200 with session on success', async () => {
    const token = signJwt()
    const res = await app.inject({
      method: 'POST',
      url: '/workspaces',
      headers: getAuthHeader(token),
      body: {},
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body).toHaveProperty('workspace')
    expect(body).toHaveProperty('token')
    expect(wsMock.getOrCreate).toHaveBeenCalledWith(TEST_USER_ID, TEST_ORG_ID, undefined)
  })

  it('passes optional projectId to workspaceService', async () => {
    const token = signJwt()
    const projectId = randomUUID()
    await app.inject({
      method: 'POST',
      url: '/workspaces',
      headers: getAuthHeader(token),
      body: { projectId },
    })
    expect(wsMock.getOrCreate).toHaveBeenCalledWith(TEST_USER_ID, TEST_ORG_ID, projectId)
  })

  it('returns 400 when projectId is an invalid UUID', async () => {
    const token = signJwt()
    const res = await app.inject({
      method: 'POST',
      url: '/workspaces',
      headers: getAuthHeader(token),
      body: { projectId: 'not-a-uuid' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('returns 401 without a token', async () => {
    const res = await app.inject({ method: 'POST', url: '/workspaces', body: {} })
    expect(res.statusCode).toBe(401)
  })
})

// ── GET /workspaces ───────────────────────────────────────────────────────────

describe('GET /workspaces', () => {
  it('returns 200 with list of workspaces', async () => {
    const token = signJwt()
    const res = await app.inject({
      method: 'GET',
      url: '/workspaces',
      headers: getAuthHeader(token),
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body).toHaveProperty('workspaces')
    expect(Array.isArray(body.workspaces)).toBe(true)
    expect(wsMock.list).toHaveBeenCalledWith(TEST_USER_ID)
  })

  it('returns 401 without a token', async () => {
    const res = await app.inject({ method: 'GET', url: '/workspaces' })
    expect(res.statusCode).toBe(401)
  })
})

// ── GET /workspaces/:workspaceId ──────────────────────────────────────────────

describe('GET /workspaces/:workspaceId', () => {
  it('returns 200 with workspace status', async () => {
    const wsId = randomUUID()
    wsMock.getStatus.mockResolvedValue(fakeStatus(wsId))
    const token = signJwt()
    const res = await app.inject({
      method: 'GET',
      url: `/workspaces/${wsId}`,
      headers: getAuthHeader(token),
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body).toHaveProperty('workspace')
    expect(wsMock.getStatus).toHaveBeenCalledWith(wsId, TEST_USER_ID)
  })

  it('returns 400 when workspace ID is not a UUID', async () => {
    const token = signJwt()
    const res = await app.inject({
      method: 'GET',
      url: '/workspaces/not-a-uuid',
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
      url: `/workspaces/${wsId}`,
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
      url: `/workspaces/${wsId}`,
      headers: getAuthHeader(token),
    })
    expect(res.statusCode).toBe(403)
  })

  it('returns 401 without a token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/workspaces/${randomUUID()}`,
    })
    expect(res.statusCode).toBe(401)
  })
})

// ── POST /workspaces/:workspaceId/stop ────────────────────────────────────────

describe('POST /workspaces/:workspaceId/stop', () => {
  it('returns 200 when stop succeeds', async () => {
    const wsId = randomUUID()
    const token = signJwt()
    const res = await app.inject({
      method: 'POST',
      url: `/workspaces/${wsId}/stop`,
      headers: getAuthHeader(token),
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toHaveProperty('message')
    expect(wsMock.stop).toHaveBeenCalledWith(wsId, TEST_USER_ID)
  })

  it('returns 404 when workspace not found', async () => {
    const wsId = randomUUID()
    wsMock.stop.mockRejectedValue(new WorkspaceNotFoundError(wsId))
    const token = signJwt()
    const res = await app.inject({
      method: 'POST',
      url: `/workspaces/${wsId}/stop`,
      headers: getAuthHeader(token),
    })
    expect(res.statusCode).toBe(404)
  })

  it('returns 403 when workspace belongs to a different user', async () => {
    const wsId = randomUUID()
    wsMock.stop.mockRejectedValue(new WorkspaceOwnershipError())
    const token = signJwt()
    const res = await app.inject({
      method: 'POST',
      url: `/workspaces/${wsId}/stop`,
      headers: getAuthHeader(token),
    })
    expect(res.statusCode).toBe(403)
  })

  it('returns 400 when workspace ID is invalid', async () => {
    const token = signJwt()
    const res = await app.inject({
      method: 'POST',
      url: '/workspaces/bad-id/stop',
      headers: getAuthHeader(token),
    })
    expect(res.statusCode).toBe(400)
  })

  it('returns 401 without a token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/workspaces/${randomUUID()}/stop`,
    })
    expect(res.statusCode).toBe(401)
  })
})

// ── POST /workspaces/:workspaceId/heartbeat ───────────────────────────────────

describe('POST /workspaces/:workspaceId/heartbeat', () => {
  it('returns 200 with ok:true', async () => {
    const wsId = randomUUID()
    const token = signJwt()
    const res = await app.inject({
      method: 'POST',
      url: `/workspaces/${wsId}/heartbeat`,
      headers: getAuthHeader(token),
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ ok: true })
    expect(wsMock.heartbeat).toHaveBeenCalledWith(wsId, TEST_USER_ID)
  })

  it('returns 404 when workspace not found', async () => {
    const wsId = randomUUID()
    wsMock.heartbeat.mockRejectedValue(new WorkspaceNotFoundError(wsId))
    const token = signJwt()
    const res = await app.inject({
      method: 'POST',
      url: `/workspaces/${wsId}/heartbeat`,
      headers: getAuthHeader(token),
    })
    expect(res.statusCode).toBe(404)
  })

  it('returns 403 for ownership violation', async () => {
    const wsId = randomUUID()
    wsMock.heartbeat.mockRejectedValue(new WorkspaceOwnershipError())
    const token = signJwt()
    const res = await app.inject({
      method: 'POST',
      url: `/workspaces/${wsId}/heartbeat`,
      headers: getAuthHeader(token),
    })
    expect(res.statusCode).toBe(403)
  })

  it('returns 401 without a token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/workspaces/${randomUUID()}/heartbeat`,
    })
    expect(res.statusCode).toBe(401)
  })
})

// ── DELETE /workspaces/:workspaceId ───────────────────────────────────────────

describe('DELETE /workspaces/:workspaceId', () => {
  it('returns 200 when delete succeeds', async () => {
    const wsId = randomUUID()
    const token = signJwt()
    const res = await app.inject({
      method: 'DELETE',
      url: `/workspaces/${wsId}`,
      headers: getAuthHeader(token),
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toHaveProperty('message')
    expect(wsMock.delete).toHaveBeenCalledWith(wsId, TEST_USER_ID)
  })

  it('returns 404 when workspace not found', async () => {
    const wsId = randomUUID()
    wsMock.delete.mockRejectedValue(new WorkspaceNotFoundError(wsId))
    const token = signJwt()
    const res = await app.inject({
      method: 'DELETE',
      url: `/workspaces/${wsId}`,
      headers: getAuthHeader(token),
    })
    expect(res.statusCode).toBe(404)
  })

  it('returns 403 for ownership violation', async () => {
    const wsId = randomUUID()
    wsMock.delete.mockRejectedValue(new WorkspaceOwnershipError())
    const token = signJwt()
    const res = await app.inject({
      method: 'DELETE',
      url: `/workspaces/${wsId}`,
      headers: getAuthHeader(token),
    })
    expect(res.statusCode).toBe(403)
  })

  it('returns 401 without a token', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/workspaces/${randomUUID()}`,
    })
    expect(res.statusCode).toBe(401)
  })
})

// ── GET /workspaces/:workspaceId/logs ─────────────────────────────────────────

describe('GET /workspaces/:workspaceId/logs', () => {
  it('returns 200 with log text', async () => {
    const wsId = randomUUID()
    const token = signJwt()
    const res = await app.inject({
      method: 'GET',
      url: `/workspaces/${wsId}/logs`,
      headers: getAuthHeader(token),
    })
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('log line')
    expect(wsMock.getLogs).toHaveBeenCalledWith(wsId, TEST_USER_ID, 100)
  })

  it('passes tailLines query param (clamped to 1-1000)', async () => {
    const wsId = randomUUID()
    const token = signJwt()
    const res = await app.inject({
      method: 'GET',
      url: `/workspaces/${wsId}/logs?tailLines=500`,
      headers: getAuthHeader(token),
    })
    expect(res.statusCode).toBe(200)
    expect(wsMock.getLogs).toHaveBeenCalledWith(wsId, TEST_USER_ID, 500)
  })

  it('clamps tailLines to 1000 when value exceeds maximum', async () => {
    const wsId = randomUUID()
    const token = signJwt()
    await app.inject({
      method: 'GET',
      url: `/workspaces/${wsId}/logs?tailLines=9999`,
      headers: getAuthHeader(token),
    })
    expect(wsMock.getLogs).toHaveBeenCalledWith(wsId, TEST_USER_ID, 1000)
  })

  it('clamps tailLines to 1 when value is below minimum', async () => {
    const wsId = randomUUID()
    const token = signJwt()
    await app.inject({
      method: 'GET',
      url: `/workspaces/${wsId}/logs?tailLines=0`,
      headers: getAuthHeader(token),
    })
    expect(wsMock.getLogs).toHaveBeenCalledWith(wsId, TEST_USER_ID, 1)
  })

  it('returns 404 when workspace not found', async () => {
    const wsId = randomUUID()
    wsMock.getLogs.mockRejectedValue(new WorkspaceNotFoundError(wsId))
    const token = signJwt()
    const res = await app.inject({
      method: 'GET',
      url: `/workspaces/${wsId}/logs`,
      headers: getAuthHeader(token),
    })
    expect(res.statusCode).toBe(404)
  })

  it('returns 401 without a token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/workspaces/${randomUUID()}/logs`,
    })
    expect(res.statusCode).toBe(401)
  })
})
