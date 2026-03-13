import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RbacService, SYSTEM_ROLES, AssignRoleDto } from '../services/rbac.service.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a mock Db that returns `grants` from the chained role query.
 * grants = [{ permissions: string[], expiresAt?: Date | null, roleOrgId?: string | null }]
 */
function makeDbWithGrants(grants: Array<{
  permissions: string[]
  expiresAt?: Date | null
  resourceType?: string | null
  resourceId?: string | null
  roleOrgId?: string | null
}>) {
  return {
    select:   vi.fn().mockReturnThis(),
    from:     vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where:    vi.fn().mockResolvedValue(grants),
    insert:   vi.fn().mockReturnThis(),
    values:   vi.fn().mockReturnThis(),
    onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
    delete:   vi.fn().mockReturnThis(),
  } as any
}

// ---------------------------------------------------------------------------
// SYSTEM_ROLES constants
// ---------------------------------------------------------------------------

describe('SYSTEM_ROLES constants', () => {
  it('SUPER_ADMIN has wildcard permission', () => {
    expect(SYSTEM_ROLES.SUPER_ADMIN.permissions).toContain('*')
  })

  it('DEVELOPER can deploy to staging', () => {
    expect(SYSTEM_ROLES.DEVELOPER.permissions).toContain('deploy:staging')
  })

  it('DEVELOPER cannot deploy to production', () => {
    expect(SYSTEM_ROLES.DEVELOPER.permissions).not.toContain('deploy:production')
  })

  it('VIEWER cannot push code', () => {
    expect(SYSTEM_ROLES.VIEWER.permissions).not.toContain('code:write')
  })

  it('TECH_LEAD can approve PRs', () => {
    expect(SYSTEM_ROLES.TECH_LEAD.permissions).toContain('pr:approve')
  })

  it('ORG_ADMIN can manage users', () => {
    expect(SYSTEM_ROLES.ORG_ADMIN.permissions).toContain('user:invite')
    expect(SYSTEM_ROLES.ORG_ADMIN.permissions).toContain('user:remove')
  })

  it('PROJECT_MANAGER can manage sprints and milestones', () => {
    expect(SYSTEM_ROLES.PROJECT_MANAGER.permissions).toContain('sprint:manage')
    expect(SYSTEM_ROLES.PROJECT_MANAGER.permissions).toContain('milestone:manage')
  })
})

// ---------------------------------------------------------------------------
// RbacService.getPermissions()
// ---------------------------------------------------------------------------

describe('RbacService.getPermissions()', () => {
  it('returns all permissions from active grants', async () => {
    const db = makeDbWithGrants([
      { permissions: ['project:read', 'code:write'], expiresAt: null },
      { permissions: ['deploy:staging'], expiresAt: null },
    ])
    const svc = new RbacService(db)
    const perms = await svc.getPermissions('u1', 'o1')
    expect(perms).toContain('project:read')
    expect(perms).toContain('code:write')
    expect(perms).toContain('deploy:staging')
  })

  it('excludes permissions from expired grants', async () => {
    const pastDate = new Date(Date.now() - 1000 * 60 * 60) // 1 hour ago
    const db = makeDbWithGrants([
      { permissions: ['project:read'], expiresAt: null },
      { permissions: ['deploy:production'], expiresAt: pastDate },
    ])
    const svc = new RbacService(db)
    const perms = await svc.getPermissions('u1', 'o1')
    expect(perms).toContain('project:read')
    expect(perms).not.toContain('deploy:production')
  })

  it('returns empty array when user has no roles', async () => {
    const db = makeDbWithGrants([])
    const perms = await new RbacService(db).getPermissions('u-nobody', 'o1')
    expect(perms).toEqual([])
  })

  it('deduplicates permissions across multiple grants', async () => {
    const db = makeDbWithGrants([
      { permissions: ['project:read'], expiresAt: null },
      { permissions: ['project:read', 'code:write'], expiresAt: null },
    ])
    const perms = await new RbacService(db).getPermissions('u1', 'o1')
    const count = perms.filter(p => p === 'project:read').length
    expect(count).toBe(1) // no duplicates
  })

  it('filters out permissions from a different org role', async () => {
    const db = makeDbWithGrants([
      { permissions: ['project:read'], roleOrgId: 'o1' },
      { permissions: ['deploy:production'], roleOrgId: 'o2' },
      { permissions: ['org:read'], roleOrgId: null },
    ])
    const perms = await new RbacService(db).getPermissions('u1', 'o1')
    expect(perms).toContain('project:read')
    expect(perms).toContain('org:read')
    expect(perms).not.toContain('deploy:production')
  })
})

// ---------------------------------------------------------------------------
// RbacService.can()
// ---------------------------------------------------------------------------

describe('RbacService.can()', () => {
  it('super admin can do everything (wildcard *)', async () => {
    const db = makeDbWithGrants([{ permissions: ['*'], expiresAt: null }])
    const can = await new RbacService(db).can('u1', 'deploy:production')
    expect(can).toBe(true)
  })

  it('super admin wildcard also covers arbitrary permissions', async () => {
    const db = makeDbWithGrants([{ permissions: ['*'], expiresAt: null }])
    const can = await new RbacService(db).can('u1', 'anything:you:can:imagine')
    expect(can).toBe(true)
  })

  it('developer can deploy to staging', async () => {
    const db = makeDbWithGrants([
      { permissions: SYSTEM_ROLES.DEVELOPER.permissions as string[], expiresAt: null },
    ])
    expect(await new RbacService(db).can('u1', 'deploy:staging')).toBe(true)
  })

  it('developer cannot deploy to production', async () => {
    const db = makeDbWithGrants([
      { permissions: SYSTEM_ROLES.DEVELOPER.permissions as string[], expiresAt: null },
    ])
    expect(await new RbacService(db).can('u1', 'deploy:production')).toBe(false)
  })

  it('viewer cannot push code', async () => {
    const db = makeDbWithGrants([
      { permissions: SYSTEM_ROLES.VIEWER.permissions as string[], expiresAt: null },
    ])
    expect(await new RbacService(db).can('u1', 'code:write')).toBe(false)
  })

  it('returns false when user has no grants at all', async () => {
    const db = makeDbWithGrants([])
    expect(await new RbacService(db).can('u-nobody', 'project:read')).toBe(false)
  })

  it('expired role grant is not honoured', async () => {
    const pastDate = new Date(Date.now() - 1)
    const db = makeDbWithGrants([
      { permissions: ['deploy:production'], expiresAt: pastDate },
    ])
    expect(await new RbacService(db).can('u1', 'deploy:production')).toBe(false)
  })

  it('valid non-expired grant is honoured', async () => {
    const futureDate = new Date(Date.now() + 1000 * 60 * 60)
    const db = makeDbWithGrants([
      { permissions: ['deploy:production'], expiresAt: futureDate },
    ])
    expect(await new RbacService(db).can('u1', 'deploy:production')).toBe(true)
  })

  it('scoped grant only applies to matching resource id', async () => {
    const db = makeDbWithGrants([
      {
        permissions: ['deploy:production'],
        resourceType: 'project',
        resourceId: 'p-1',
      },
    ])
    expect(await new RbacService(db).can('u1', 'deploy:production', 'project', 'p-1')).toBe(true)
    expect(await new RbacService(db).can('u1', 'deploy:production', 'project', 'p-2')).toBe(false)
  })

  it('global grant can satisfy scoped checks', async () => {
    const db = makeDbWithGrants([
      { permissions: ['project:read'], resourceType: null, resourceId: null },
    ])
    expect(await new RbacService(db).can('u1', 'project:read', 'project', 'p-9')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// RbacService.assignRole()
// ---------------------------------------------------------------------------

describe('RbacService.assignRole()', () => {
  it('inserts a userRole row', async () => {
    const db: any = {
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockResolvedValue(undefined),
    }
    const svc = new RbacService(db)
    const dto: AssignRoleDto = {
      userId: 'u1', roleId: 'r1', grantedBy: 'admin',
    }
    await svc.assignRole(dto)
    expect(db.insert).toHaveBeenCalled()
    expect(db.values).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1', roleId: 'r1' }))
  })
})

// ---------------------------------------------------------------------------
// RbacService.revokeRole()
// ---------------------------------------------------------------------------

describe('RbacService.revokeRole()', () => {
  it('deletes the matching userRole row', async () => {
    const db: any = {
      delete: vi.fn().mockReturnThis(),
      where:  vi.fn().mockResolvedValue(undefined),
    }
    await new RbacService(db).revokeRole('u1', 'r1')
    expect(db.delete).toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// RbacService.seedSystemRoles()
// ---------------------------------------------------------------------------

describe('RbacService.seedSystemRoles()', () => {
  it('inserts all system roles for an org', async () => {
    const db: any = {
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
    }
    await new RbacService(db).seedSystemRoles('org-1')
    // One insert per SYSTEM_ROLE
    expect(db.insert).toHaveBeenCalledTimes(Object.keys(SYSTEM_ROLES).length)
  })

  it('inserts SUPER_ADMIN role with wildcard', async () => {
    const insertedValues: any[] = []
    const db: any = {
      insert: vi.fn().mockReturnThis(),
      values: vi.fn((v) => { insertedValues.push(v); return db }),
      onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
    }
    await new RbacService(db).seedSystemRoles('org-1')
    const superAdminInsert = insertedValues.find(v => v.name === 'super_admin')
    expect(superAdminInsert).toBeDefined()
    expect(superAdminInsert.permissions).toContain('*')
    expect(superAdminInsert.isSystem).toBe(true)
  })
})
