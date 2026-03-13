import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AuthService } from '../services/auth.service.js'
import { UserService } from '../services/user.service.js'
import { RbacService, AssignRoleDto } from '../services/rbac.service.js'

// ---------------------------------------------------------------------------
// Mock @devora/nats so we can spy on publish without a real NATS server
// ---------------------------------------------------------------------------

vi.mock('@devora/nats', () => ({
  publish: vi.fn(),
  Subjects: {
    AUTH_USER_CREATED: 'auth.user.created',
    AUTH_USER_INVITED: 'auth.user.invited',
    AUTH_ROLE_ASSIGNED: 'auth.role.assigned',
  },
}))

import { publish, Subjects } from '@devora/nats'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockNc() {
  return { publish: vi.fn() } as any
}

function makeMockRedis() {
  return {
    set:    vi.fn().mockResolvedValue('OK'),
    get:    vi.fn().mockResolvedValue(null),
    del:    vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(1),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// AuthService.register() — publishes AUTH_USER_CREATED
// ---------------------------------------------------------------------------

describe('AuthService.register() — NATS events', () => {
  function makeRegisterDb() {
    const db: any = {
      select:  vi.fn().mockReturnThis(),
      from:    vi.fn().mockReturnThis(),
      where:   vi.fn().mockResolvedValue([]),   // no conflicts
      insert:  vi.fn().mockReturnThis(),
      values:  vi.fn().mockReturnThis(),
      returning: vi.fn(),
    }
    db.returning
      .mockResolvedValueOnce([{
        id: 'org-1', name: 'Acme', slug: 'acme', plan: 'starter',
        settings: {}, createdAt: new Date(), updatedAt: new Date(),
      }])
      .mockResolvedValueOnce([{
        id: 'user-1', orgId: 'org-1', email: 'alice@example.com',
        username: 'alice', displayName: 'alice', passwordHash: 'h',
        status: 'active', createdAt: new Date(),
      }])
      .mockResolvedValueOnce([{ id: 'role-1' }])
      .mockResolvedValueOnce([{ id: 'ur-1' }])
    return db
  }

  it('publishes auth.user.created with correct fields when nc is provided', async () => {
    const db = makeRegisterDb()
    const nc = makeMockNc()
    const svc = new AuthService(db, makeMockRedis() as any)

    await svc.register({
      orgName: 'Acme', orgSlug: 'acme',
      email: 'alice@example.com', password: 'Password1!', username: 'alice',
    }, nc)

    expect(publish).toHaveBeenCalledTimes(1)
    expect(publish).toHaveBeenCalledWith(
      nc,
      Subjects.AUTH_USER_CREATED,
      expect.objectContaining({
        userId:   'user-1',
        orgId:    'org-1',
        email:    'alice@example.com',
        username: 'alice',
      })
    )
  })

  it('does NOT publish when nc is undefined', async () => {
    const db = makeRegisterDb()
    const svc = new AuthService(db, makeMockRedis() as any)

    await svc.register({
      orgName: 'Acme', orgSlug: 'acme',
      email: 'alice@example.com', password: 'Password1!', username: 'alice',
    })

    expect(publish).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// UserService.inviteUser() — publishes AUTH_USER_INVITED
// ---------------------------------------------------------------------------

describe('UserService.inviteUser() — NATS events', () => {
  it('publishes auth.user.invited with correct fields when nc is provided', async () => {
    const inserted = {
      id: 'u-new', orgId: 'o1', email: 'bob@example.com',
      username: 'bob', status: 'invited', passwordHash: null,
      createdAt: new Date(), displayName: null, avatarUrl: null, lastSeenAt: null,
    }
    const db: any = {
      select:  vi.fn().mockReturnThis(),
      from:    vi.fn().mockReturnThis(),
      where:   vi.fn().mockResolvedValue([]),   // no existing user
      insert:  vi.fn().mockReturnThis(),
      values:  vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([inserted]),
    }
    const nc = makeMockNc()
    const svc = new UserService(db)

    await svc.inviteUser('o1', 'bob@example.com', nc)

    expect(publish).toHaveBeenCalledTimes(1)
    expect(publish).toHaveBeenCalledWith(
      nc,
      Subjects.AUTH_USER_INVITED,
      expect.objectContaining({
        email:  'bob@example.com',
        orgId:  'o1',
        invitedBy: 'system',
      })
    )
  })

  it('does NOT publish when nc is undefined', async () => {
    const inserted = {
      id: 'u-new', orgId: 'o1', email: 'bob@example.com',
      username: 'bob', status: 'invited', passwordHash: null,
      createdAt: new Date(), displayName: null, avatarUrl: null, lastSeenAt: null,
    }
    const db: any = {
      select:  vi.fn().mockReturnThis(),
      from:    vi.fn().mockReturnThis(),
      where:   vi.fn().mockResolvedValue([]),
      insert:  vi.fn().mockReturnThis(),
      values:  vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([inserted]),
    }
    const svc = new UserService(db)

    await svc.inviteUser('o1', 'bob@example.com')

    expect(publish).not.toHaveBeenCalled()
  })

  it('does NOT publish when user already exists in same org (early return)', async () => {
    const existingUser = { id: 'u-existing', orgId: 'o1', email: 'bob@example.com', passwordHash: null }
    const db: any = {
      select:  vi.fn().mockReturnThis(),
      from:    vi.fn().mockReturnThis(),
      where:   vi.fn().mockResolvedValue([existingUser]),
    }
    const nc = makeMockNc()
    const svc = new UserService(db)

    await svc.inviteUser('o1', 'bob@example.com', nc)

    // No new user inserted → no event published
    expect(publish).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// RbacService.assignRole() — publishes AUTH_ROLE_ASSIGNED
// ---------------------------------------------------------------------------

describe('RbacService.assignRole() — NATS events', () => {
  function makeInsertDb() {
    return {
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockResolvedValue(undefined),
    } as any
  }

  const dto: AssignRoleDto = {
    userId:       'u1',
    roleId:       'role-1',
    roleName:     'developer',
    grantedBy:    'admin-u',
    resourceType: 'project',
    resourceId:   'p-1',
  }

  it('publishes auth.role.assigned with correct fields when nc is provided', async () => {
    const db = makeInsertDb()
    const nc = makeMockNc()
    const svc = new RbacService(db)

    await svc.assignRole(dto, nc)

    expect(publish).toHaveBeenCalledTimes(1)
    expect(publish).toHaveBeenCalledWith(
      nc,
      Subjects.AUTH_ROLE_ASSIGNED,
      expect.objectContaining({
        userId:       'u1',
        roleId:       'role-1',
        roleName:     'developer',
        resourceType: 'project',
        resourceId:   'p-1',
        grantedBy:    'admin-u',
      })
    )
  })

  it('falls back to roleId as roleName when roleName not provided', async () => {
    const db = makeInsertDb()
    const nc = makeMockNc()
    const svc = new RbacService(db)
    const dtoWithoutName: AssignRoleDto = { userId: 'u1', roleId: 'role-xyz', grantedBy: 'admin' }

    await svc.assignRole(dtoWithoutName, nc)

    expect(publish).toHaveBeenCalledWith(
      nc,
      Subjects.AUTH_ROLE_ASSIGNED,
      expect.objectContaining({
        roleName: 'role-xyz', // fallback to roleId
      })
    )
  })

  it('does NOT publish when nc is undefined', async () => {
    const db = makeInsertDb()
    const svc = new RbacService(db)

    await svc.assignRole(dto)

    expect(publish).not.toHaveBeenCalled()
  })
})
