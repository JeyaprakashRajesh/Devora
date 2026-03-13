import { describe, it, expect, vi, afterEach } from 'vitest'
import { ForbiddenError, UnauthorizedError } from '@devora/errors'
import {
  authenticate,
  createRequirePermission,
  requirePermission,
  type JwtPayload,
} from '../middleware/authenticate.js'
import { RbacService } from '../services/rbac.service.js'

function makeRequest(overrides: Record<string, unknown> = {}) {
  const payload: JwtPayload = {
    sub: 'user-1',
    org: 'org-1',
    roles: ['role-1'],
    sessionId: 'session-1',
  }

  return {
    jwtVerify: vi.fn().mockResolvedValue(undefined),
    user: payload,
    params: {},
    server: { db: {} },
    ...overrides,
  } as any
}

describe('authenticate middleware', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('accepts a valid JWT', async () => {
    const request = makeRequest()
    await expect(authenticate(request, {} as any)).resolves.toBeUndefined()
    expect(request.jwtVerify).toHaveBeenCalledOnce()
  })

  it('throws UnauthorizedError when JWT verification fails', async () => {
    const request = makeRequest({
      jwtVerify: vi.fn().mockRejectedValue(new Error('bad token')),
    })
    await expect(authenticate(request, {} as any)).rejects.toBeInstanceOf(UnauthorizedError)
  })

  it('throws ForbiddenError for cross-org access', async () => {
    const request = makeRequest({ params: { orgId: 'org-2' } })
    await expect(authenticate(request, {} as any)).rejects.toBeInstanceOf(ForbiddenError)
  })
})

describe('createRequirePermission()', () => {
  it('allows request when RBAC allows', async () => {
    const rbac = {
      can: vi.fn().mockResolvedValue(true),
    }
    const guard = createRequirePermission(rbac)
    const request = makeRequest({ params: { projectId: 'proj-1' } })

    await expect(guard('project:read', 'projectId')(request, {} as any)).resolves.toBeUndefined()
    expect(rbac.can).toHaveBeenCalledWith('user-1', 'project:read', 'project', 'proj-1')
  })

  it('throws ForbiddenError when RBAC denies', async () => {
    const rbac = {
      can: vi.fn().mockResolvedValue(false),
    }
    const guard = createRequirePermission(rbac)
    const request = makeRequest()

    await expect(guard('project:delete')(request, {} as any)).rejects.toBeInstanceOf(ForbiddenError)
  })
})

describe('requirePermission()', () => {
  it('uses app DB-backed RbacService and allows when can() returns true', async () => {
    const canSpy = vi.spyOn(RbacService.prototype, 'can').mockResolvedValue(true)
    const request = makeRequest({ params: { projectId: 'proj-1' }, server: { db: {} } })

    await expect(requirePermission('project:read', 'projectId')(request, {} as any)).resolves.toBeUndefined()
    expect(canSpy).toHaveBeenCalledWith('user-1', 'project:read', 'project', 'proj-1')
  })
})
