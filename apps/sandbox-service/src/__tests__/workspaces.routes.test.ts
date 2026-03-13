import type { FastifyInstance } from 'fastify'
import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { ValidationError } from '@devora/errors'
import { WorkspaceNotFoundError, WorkspaceOwnershipError } from '../errors.js'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const ORG_ID = '22222222-2222-4222-8222-222222222222'
const WORKSPACE_ID = '33333333-3333-4333-8333-333333333333'
const PROJECT_ID = '44444444-4444-4444-8444-444444444444'

const mockSession = {
  workspaceId: WORKSPACE_ID,
  status: 'starting' as const,
  proxyPath: `/api/sandbox/workspaces/${WORKSPACE_ID}/connect`,
  podName: `ws-${WORKSPACE_ID}`,
}

type WorkspaceServiceMock = {
  getOrCreate: ReturnType<typeof vi.fn>
  list: ReturnType<typeof vi.fn>
  getStatus: ReturnType<typeof vi.fn>
  stop: ReturnType<typeof vi.fn>
  heartbeat: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
  getLogs: ReturnType<typeof vi.fn>
  stopIdle: ReturnType<typeof vi.fn>
}

type PodServiceMock = {
  get: ReturnType<typeof vi.fn>
}

let buildApp: (typeof import('../app.js'))['buildApp']
let app: FastifyInstance
let workspaceService: WorkspaceServiceMock
let podService: PodServiceMock

beforeAll(async () => {
  process.env.NODE_ENV ??= 'test'
  process.env.PORT ??= '4005'
  process.env.DATABASE_URL ??= 'postgresql://devora:devora_dev@localhost:5432/devora_sandbox'
  process.env.NATS_URL ??= 'nats://localhost:4222'
  process.env.JWT_SECRET ??= 'x'.repeat(32)

  ;({ buildApp } = await import('../app.js'))
})

beforeEach(async () => {
  workspaceService = {
    getOrCreate: vi.fn(),
    list: vi.fn(),
    getStatus: vi.fn(),
    stop: vi.fn(),
    heartbeat: vi.fn(),
    delete: vi.fn(),
    getLogs: vi.fn(),
    stopIdle: vi.fn().mockResolvedValue(0),
  }

  podService = {
    get: vi.fn(),
  }

  app = await buildApp({
    skipInfrastructurePlugins: true,
    registerRoutesOptions: {
      workspaceService: workspaceService as any,
      podService: podService as any,
    },
  })
  await app.ready()
  vi.clearAllMocks()
})

afterEach(async () => {
  if (app) {
    await app.close()
  }
})

function signTestJwt(payload: { sub: string; org: string; roles: string[] }) {
  return app.jwt.sign(payload as any)
}

describe('POST /workspaces', () => {
  it('returns 200 with WorkspaceSession on success', async () => {
    workspaceService.getOrCreate.mockResolvedValue(mockSession)
    const validToken = signTestJwt({ sub: USER_ID, org: ORG_ID, roles: ['developer'] })

    const response = await app.inject({
      method: 'POST',
      url: '/workspaces',
      headers: { Authorization: `Bearer ${validToken}` },
      payload: {},
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.workspaceId).toBe(mockSession.workspaceId)
    expect(body.proxyPath).toContain(mockSession.workspaceId)
  })

  it('accepts optional projectId in body', async () => {
    workspaceService.getOrCreate.mockResolvedValue(mockSession)
    const validToken = signTestJwt({ sub: USER_ID, org: ORG_ID, roles: ['developer'] })

    const response = await app.inject({
      method: 'POST',
      url: '/workspaces',
      headers: { Authorization: `Bearer ${validToken}` },
      payload: { projectId: PROJECT_ID },
    })

    expect(response.statusCode).toBe(200)
    expect(workspaceService.getOrCreate).toHaveBeenCalledWith(USER_ID, ORG_ID, PROJECT_ID)
  })

  it('returns 400 if projectId is not a valid UUID', async () => {
    const validToken = signTestJwt({ sub: USER_ID, org: ORG_ID, roles: ['developer'] })

    const response = await app.inject({
      method: 'POST',
      url: '/workspaces',
      headers: { Authorization: `Bearer ${validToken}` },
      payload: { projectId: 'not-a-uuid' },
    })

    expect(response.statusCode).toBe(400)
  })

  it('returns 401 without Authorization header', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/workspaces',
      payload: {},
    })

    expect(response.statusCode).toBe(401)
  })

  it('returns 401 with invalid token', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/workspaces',
      headers: { Authorization: 'Bearer invalidtoken' },
      payload: {},
    })

    expect(response.statusCode).toBe(401)
  })
})

describe('GET /workspaces', () => {
  it('returns list of workspaces for current user', async () => {
    workspaceService.list.mockResolvedValue([
      { id: WORKSPACE_ID },
      { id: PROJECT_ID },
    ])
    const validToken = signTestJwt({ sub: USER_ID, org: ORG_ID, roles: ['developer'] })

    const response = await app.inject({
      method: 'GET',
      url: '/workspaces',
      headers: { Authorization: `Bearer ${validToken}` },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.workspaces).toHaveLength(2)
  })

  it('returns empty array when user has no workspaces', async () => {
    workspaceService.list.mockResolvedValue([])
    const validToken = signTestJwt({ sub: USER_ID, org: ORG_ID, roles: ['developer'] })

    const response = await app.inject({
      method: 'GET',
      url: '/workspaces',
      headers: { Authorization: `Bearer ${validToken}` },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().workspaces).toEqual([])
  })

  it('returns 401 without token', async () => {
    const response = await app.inject({ method: 'GET', url: '/workspaces' })
    expect(response.statusCode).toBe(401)
  })
})

describe('GET /workspaces/:workspaceId', () => {
  it('returns workspace status', async () => {
    workspaceService.getStatus.mockResolvedValue({
      workspaceId: WORKSPACE_ID,
      status: 'running',
      podPhase: 'Running',
      containersReady: true,
      cpu: null,
      memory: null,
    })
    const validToken = signTestJwt({ sub: USER_ID, org: ORG_ID, roles: ['developer'] })

    const response = await app.inject({
      method: 'GET',
      url: `/workspaces/${WORKSPACE_ID}`,
      headers: { Authorization: `Bearer ${validToken}` },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.workspaceId).toBe(WORKSPACE_ID)
    expect(['provisioning', 'starting', 'running', 'stopped', 'deleted']).toContain(body.status)
  })

  it('returns 400 for invalid UUID param', async () => {
    const validToken = signTestJwt({ sub: USER_ID, org: ORG_ID, roles: ['developer'] })

    const response = await app.inject({
      method: 'GET',
      url: '/workspaces/not-a-uuid',
      headers: { Authorization: `Bearer ${validToken}` },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().message).toBe('Invalid workspace ID')
  })

  it('returns 404 when workspace not found', async () => {
    workspaceService.getStatus.mockRejectedValue(new WorkspaceNotFoundError(WORKSPACE_ID))
    const validToken = signTestJwt({ sub: USER_ID, org: ORG_ID, roles: ['developer'] })

    const response = await app.inject({
      method: 'GET',
      url: `/workspaces/${WORKSPACE_ID}`,
      headers: { Authorization: `Bearer ${validToken}` },
    })

    expect(response.statusCode).toBe(404)
  })

  it('returns 403 when workspace belongs to different user', async () => {
    workspaceService.getStatus.mockRejectedValue(new WorkspaceOwnershipError())
    const validToken = signTestJwt({ sub: USER_ID, org: ORG_ID, roles: ['developer'] })

    const response = await app.inject({
      method: 'GET',
      url: `/workspaces/${WORKSPACE_ID}`,
      headers: { Authorization: `Bearer ${validToken}` },
    })

    expect(response.statusCode).toBe(403)
  })
})

describe('POST /workspaces/:workspaceId/stop', () => {
  it('returns 200 on success', async () => {
    workspaceService.stop.mockResolvedValue(undefined)
    const validToken = signTestJwt({ sub: USER_ID, org: ORG_ID, roles: ['developer'] })

    const response = await app.inject({
      method: 'POST',
      url: `/workspaces/${WORKSPACE_ID}/stop`,
      headers: { Authorization: `Bearer ${validToken}` },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().message).toBe('Workspace stopped')
  })

  it('returns 404 when workspace not found', async () => {
    workspaceService.stop.mockRejectedValue(new WorkspaceNotFoundError(WORKSPACE_ID))
    const validToken = signTestJwt({ sub: USER_ID, org: ORG_ID, roles: ['developer'] })

    const response = await app.inject({
      method: 'POST',
      url: `/workspaces/${WORKSPACE_ID}/stop`,
      headers: { Authorization: `Bearer ${validToken}` },
    })

    expect(response.statusCode).toBe(404)
  })

  it('returns 403 for wrong user', async () => {
    workspaceService.stop.mockRejectedValue(new WorkspaceOwnershipError())
    const validToken = signTestJwt({ sub: USER_ID, org: ORG_ID, roles: ['developer'] })

    const response = await app.inject({
      method: 'POST',
      url: `/workspaces/${WORKSPACE_ID}/stop`,
      headers: { Authorization: `Bearer ${validToken}` },
    })

    expect(response.statusCode).toBe(403)
  })

  it('returns 401 without token', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/workspaces/${WORKSPACE_ID}/stop`,
    })

    expect(response.statusCode).toBe(401)
  })
})

describe('POST /workspaces/:workspaceId/heartbeat', () => {
  it('returns 200 with ok: true', async () => {
    workspaceService.heartbeat.mockResolvedValue(undefined)
    const validToken = signTestJwt({ sub: USER_ID, org: ORG_ID, roles: ['developer'] })

    const response = await app.inject({
      method: 'POST',
      url: `/workspaces/${WORKSPACE_ID}/heartbeat`,
      headers: { Authorization: `Bearer ${validToken}` },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().ok).toBe(true)
  })

  it('updates last active timestamp', async () => {
    workspaceService.heartbeat.mockResolvedValue(undefined)
    const validToken = signTestJwt({ sub: USER_ID, org: ORG_ID, roles: ['developer'] })

    await app.inject({
      method: 'POST',
      url: `/workspaces/${WORKSPACE_ID}/heartbeat`,
      headers: { Authorization: `Bearer ${validToken}` },
    })

    expect(workspaceService.heartbeat).toHaveBeenCalledWith(WORKSPACE_ID, USER_ID)
  })

  it('returns 401 without token', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/workspaces/${WORKSPACE_ID}/heartbeat`,
    })

    expect(response.statusCode).toBe(401)
  })
})

describe('DELETE /workspaces/:workspaceId', () => {
  it('returns 200 on successful deletion', async () => {
    workspaceService.delete.mockResolvedValue(undefined)
    const validToken = signTestJwt({ sub: USER_ID, org: ORG_ID, roles: ['developer'] })

    const response = await app.inject({
      method: 'DELETE',
      url: `/workspaces/${WORKSPACE_ID}`,
      headers: { Authorization: `Bearer ${validToken}` },
    })

    expect(response.statusCode).toBe(200)
  })

  it('returns 404 when not found', async () => {
    workspaceService.delete.mockRejectedValue(new WorkspaceNotFoundError(WORKSPACE_ID))
    const validToken = signTestJwt({ sub: USER_ID, org: ORG_ID, roles: ['developer'] })

    const response = await app.inject({
      method: 'DELETE',
      url: `/workspaces/${WORKSPACE_ID}`,
      headers: { Authorization: `Bearer ${validToken}` },
    })

    expect(response.statusCode).toBe(404)
  })

  it('returns 403 for wrong user', async () => {
    workspaceService.delete.mockRejectedValue(new WorkspaceOwnershipError())
    const validToken = signTestJwt({ sub: USER_ID, org: ORG_ID, roles: ['developer'] })

    const response = await app.inject({
      method: 'DELETE',
      url: `/workspaces/${WORKSPACE_ID}`,
      headers: { Authorization: `Bearer ${validToken}` },
    })

    expect(response.statusCode).toBe(403)
  })
})

describe('GET /workspaces/:workspaceId/logs', () => {
  it('returns plain text logs', async () => {
    workspaceService.getLogs.mockResolvedValue('line1\nline2\nline3')
    const validToken = signTestJwt({ sub: USER_ID, org: ORG_ID, roles: ['developer'] })

    const response = await app.inject({
      method: 'GET',
      url: `/workspaces/${WORKSPACE_ID}/logs`,
      headers: { Authorization: `Bearer ${validToken}` },
    })

    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toContain('text/plain')
    expect(response.body).toBe('line1\nline2\nline3')
  })

  it('passes tailLines query param to service', async () => {
    workspaceService.getLogs.mockResolvedValue('ok')
    const validToken = signTestJwt({ sub: USER_ID, org: ORG_ID, roles: ['developer'] })

    await app.inject({
      method: 'GET',
      url: `/workspaces/${WORKSPACE_ID}/logs?tailLines=50`,
      headers: { Authorization: `Bearer ${validToken}` },
    })

    expect(workspaceService.getLogs).toHaveBeenCalledWith(WORKSPACE_ID, USER_ID, 50)
  })

  it('clamps tailLines to max 1000', async () => {
    workspaceService.getLogs.mockResolvedValue('ok')
    const validToken = signTestJwt({ sub: USER_ID, org: ORG_ID, roles: ['developer'] })

    await app.inject({
      method: 'GET',
      url: `/workspaces/${WORKSPACE_ID}/logs?tailLines=9999`,
      headers: { Authorization: `Bearer ${validToken}` },
    })

    expect(workspaceService.getLogs).toHaveBeenCalledWith(WORKSPACE_ID, USER_ID, 1000)
  })

  it('defaults tailLines to 100 when not provided', async () => {
    workspaceService.getLogs.mockResolvedValue('ok')
    const validToken = signTestJwt({ sub: USER_ID, org: ORG_ID, roles: ['developer'] })

    await app.inject({
      method: 'GET',
      url: `/workspaces/${WORKSPACE_ID}/logs`,
      headers: { Authorization: `Bearer ${validToken}` },
    })

    expect(workspaceService.getLogs).toHaveBeenCalledWith(WORKSPACE_ID, USER_ID, 100)
  })

  it('returns 400 if workspace is not running', async () => {
    workspaceService.getLogs.mockRejectedValue(new ValidationError('Workspace is not running'))
    const validToken = signTestJwt({ sub: USER_ID, org: ORG_ID, roles: ['developer'] })

    const response = await app.inject({
      method: 'GET',
      url: `/workspaces/${WORKSPACE_ID}/logs`,
      headers: { Authorization: `Bearer ${validToken}` },
    })

    expect(response.statusCode).toBe(400)
  })
})

describe('GET /workspaces/:workspaceId/connect', () => {
  it('returns 401 without token', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/workspaces/${WORKSPACE_ID}/connect`,
    })

    expect(response.statusCode).toBe(401)
  })

  it('returns 400 for invalid UUID', async () => {
    const validToken = signTestJwt({ sub: USER_ID, org: ORG_ID, roles: ['developer'] })

    const response = await app.inject({
      method: 'GET',
      url: '/workspaces/not-a-uuid/connect',
      headers: { Authorization: `Bearer ${validToken}` },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().message).toBe('Invalid workspace ID')
  })

  it('returns 409 when workspace is not running', async () => {
    workspaceService.getStatus.mockResolvedValue({
      workspaceId: WORKSPACE_ID,
      status: 'starting',
      podPhase: 'Pending',
      containersReady: false,
      cpu: null,
      memory: null,
    })
    const validToken = signTestJwt({ sub: USER_ID, org: ORG_ID, roles: ['developer'] })

    const response = await app.inject({
      method: 'GET',
      url: `/workspaces/${WORKSPACE_ID}/connect`,
      headers: { Authorization: `Bearer ${validToken}` },
    })

    expect(response.statusCode).toBe(409)
    expect(response.json()).toEqual({
      code: 'SANDBOX_NOT_READY',
      message: 'Workspace is not running',
    })
  })

  it('returns 503 when running workspace pod has no IP', async () => {
    workspaceService.getStatus.mockResolvedValue({
      workspaceId: WORKSPACE_ID,
      status: 'running',
      podPhase: 'Running',
      containersReady: true,
      cpu: null,
      memory: null,
    })
    podService.get.mockResolvedValue({ status: {} })
    const validToken = signTestJwt({ sub: USER_ID, org: ORG_ID, roles: ['developer'] })

    const response = await app.inject({
      method: 'GET',
      url: `/workspaces/${WORKSPACE_ID}/connect`,
      headers: { Authorization: `Bearer ${validToken}` },
    })

    expect(response.statusCode).toBe(503)
    expect(response.json()).toEqual({
      code: 'SANDBOX_NO_IP',
      message: 'Workspace pod has no IP yet',
    })
  })
})
