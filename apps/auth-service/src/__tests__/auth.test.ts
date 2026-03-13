import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AuthService } from '../services/auth.service.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal mock Db that returns whatever data you configure. */
function makeMockDb(overrides: Record<string, any> = {}) {
  const chain: any = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(overrides.selectResult ?? []),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(overrides.insertResult ?? []),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
  }
  return chain
}

/** Build a minimal mock Redis. */
function makeMockRedis(overrides: Record<string, any> = {}) {
  return {
    set:    vi.fn().mockResolvedValue('OK'),
    get:    vi.fn().mockResolvedValue(overrides.get ?? null),
    del:    vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(1),
  }
}

/** Build a minimal mock Fastify app with jwt.sign. */
function makeMockApp(token = 'mock.jwt.token') {
  return {
    jwt: {
      sign: vi.fn().mockReturnValue(token),
    },
  } as any
}

// ---------------------------------------------------------------------------
// AuthService.hashPassword / verifyPassword
// ---------------------------------------------------------------------------

describe('AuthService — password helpers', () => {
  const db = makeMockDb()
  const redis = makeMockRedis()
  const svc = new AuthService(db as any, redis as any)

  it('hashes a password and verifies it correctly', async () => {
    const hash = await svc.hashPassword('secret1234')
    expect(hash).not.toBe('secret1234')
    expect(await svc.verifyPassword('secret1234', hash)).toBe(true)
  })

  it('rejects wrong password', async () => {
    const hash = await svc.hashPassword('correct')
    expect(await svc.verifyPassword('wrong', hash)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// AuthService.register
// ---------------------------------------------------------------------------

describe('AuthService.register()', () => {
  function makeRegisteredDb() {
    // Successful insert – every select returns [] (no conflicts), inserts return rows
    const db: any = {
      select:  vi.fn().mockReturnThis(),
      from:    vi.fn().mockReturnThis(),
      where:   vi.fn().mockResolvedValue([]),
      insert:  vi.fn().mockReturnThis(),
      values:  vi.fn().mockReturnThis(),
      returning: vi.fn(),
    }
    // First returning() = org, second = user, third = role, fourth = userRole
    db.returning
      .mockResolvedValueOnce([{ id: 'org-1', name: 'Acme', slug: 'acme', plan: 'starter', settings: {}, createdAt: new Date(), updatedAt: new Date() }])
      .mockResolvedValueOnce([{ id: 'user-1', orgId: 'org-1', email: 'a@b.com', username: 'alice', displayName: 'alice', passwordHash: 'h', status: 'active', createdAt: new Date() }])
      .mockResolvedValueOnce([{ id: 'role-1' }])
      .mockResolvedValueOnce([{ id: 'ur-1' }])
    return db
  }

  it('creates an org and user when no conflicts exist', async () => {
    const db = makeRegisteredDb()
    const redis = makeMockRedis()
    const svc = new AuthService(db as any, redis as any)

    const result = await svc.register({
      orgName: 'Acme', orgSlug: 'acme', email: 'a@b.com', password: 'Password1!', username: 'alice',
    })

    expect(result.org.slug).toBe('acme')
    expect(result.user.email).toBe('a@b.com')
    // passwordHash must not be in returned user
    expect((result.user as any).passwordHash).toBeUndefined()
  })

  it('throws ConflictError when email already exists', async () => {
    const db: any = {
      select: vi.fn().mockReturnThis(),
      from:   vi.fn().mockReturnThis(),
      // First call (email check) returns existing user
      where:  vi.fn().mockResolvedValueOnce([{ id: 'u1', email: 'a@b.com' }]),
    }
    const svc = new AuthService(db as any, makeMockRedis() as any)
    await expect(svc.register({
      orgName: 'X', orgSlug: 'x', email: 'a@b.com', password: 'Password1!', username: 'bob',
    })).rejects.toThrow('Email already in use')
  })

  it('throws ConflictError when org slug already exists', async () => {
    const db: any = {
      select: vi.fn().mockReturnThis(),
      from:   vi.fn().mockReturnThis(),
      where:  vi.fn()
        .mockResolvedValueOnce([])           // email — no conflict
        .mockResolvedValueOnce([{ id: 'o1', slug: 'acme' }]),  // slug — conflict
    }
    const svc = new AuthService(db as any, makeMockRedis() as any)
    await expect(svc.register({
      orgName: 'Acme2', orgSlug: 'acme', email: 'new@b.com', password: 'Password1!', username: 'bob',
    })).rejects.toThrow('Organization slug already taken')
  })
})

// ---------------------------------------------------------------------------
// AuthService.login()
// ---------------------------------------------------------------------------

describe('AuthService.login()', () => {
  const USER = {
    id: 'u1', orgId: 'o1', email: 'a@b.com', username: 'alice',
    status: 'active', createdAt: new Date(),
    // precomputed bcrypt hash for "Password1!"
    passwordHash: '$2a$12$somevalid', // will use svc to generate real hash
  }

  it('returns a JWT and sessionId on valid credentials', async () => {
    const svc = new AuthService(makeMockDb() as any, makeMockRedis() as any) // just for hashPassword
    const hash = await svc.hashPassword('Password1!')
    const user = { ...USER, passwordHash: hash }

    const db: any = {
      select: vi.fn().mockReturnThis(),
      from:   vi.fn().mockReturnThis(),
      where:  vi.fn().mockResolvedValue([user]),
    }
    const redis = makeMockRedis()
    const app = makeMockApp('tok123')

    const result = await new AuthService(db as any, redis as any).login({ email: 'a@b.com', password: 'Password1!' }, app)
    expect(result.token).toBe('tok123')
    expect(result.sessionId).toBeDefined()
    expect(redis.set).toHaveBeenCalled()
  })

  it('throws UnauthorizedError for unknown email', async () => {
    const db: any = {
      select: vi.fn().mockReturnThis(),
      from:   vi.fn().mockReturnThis(),
      where:  vi.fn().mockResolvedValue([]),
    }
    await expect(
      new AuthService(db as any, makeMockRedis() as any).login({ email: 'x@y.com', password: 'pass' }, makeMockApp())
    ).rejects.toThrow('Invalid email or password')
  })

  it('throws UnauthorizedError for wrong password', async () => {
    const svc0 = new AuthService(makeMockDb() as any, makeMockRedis() as any)
    const hash = await svc0.hashPassword('correct')
    const user = { ...USER, passwordHash: hash }

    const db: any = {
      select: vi.fn().mockReturnThis(),
      from:   vi.fn().mockReturnThis(),
      where:  vi.fn().mockResolvedValue([user]),
    }

    await expect(
      new AuthService(db as any, makeMockRedis() as any).login({ email: 'a@b.com', password: 'wrong' }, makeMockApp())
    ).rejects.toThrow('Invalid email or password')
  })
})

// ---------------------------------------------------------------------------
// AuthService.logout()
// ---------------------------------------------------------------------------

describe('AuthService.logout()', () => {
  it('deletes the session key from Redis', async () => {
    const redis = makeMockRedis()
    const svc = new AuthService(makeMockDb() as any, redis as any)
    await svc.logout('sid-abc', redis as any)
    expect(redis.del).toHaveBeenCalledWith('session:sid-abc')
  })
})

// ---------------------------------------------------------------------------
// AuthService.getMe()
// ---------------------------------------------------------------------------

describe('AuthService.getMe()', () => {
  it('returns user profile with roles and permissions', async () => {
    const user = { id: 'u1', orgId: 'o1', email: 'a@b.com', username: 'alice', passwordHash: 'h', status: 'active', createdAt: new Date() }
    const grants = [
      { roleId: 'r1', roleName: 'developer', permissions: ['project:read', 'code:write'] },
    ]

    const db: any = {
      select:   vi.fn().mockReturnThis(),
      from:     vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      where:    vi.fn()
        .mockResolvedValueOnce([user])  // users query
        .mockResolvedValueOnce(grants), // userRoles+roles query
    }

    const result = await new AuthService(db as any, makeMockRedis() as any).getMe('u1', db as any)
    expect(result.email).toBe('a@b.com')
    expect((result as any).passwordHash).toBeUndefined()
    expect(result.roles).toContain('developer')
    expect(result.permissions).toContain('code:write')
  })

  it('throws NotFoundError for unknown userId', async () => {
    const db: any = {
      select: vi.fn().mockReturnThis(),
      from:   vi.fn().mockReturnThis(),
      where:  vi.fn().mockResolvedValue([]),
    }
    await expect(
      new AuthService(db as any, makeMockRedis() as any).getMe('u-missing', db as any)
    ).rejects.toThrow("User 'u-missing' not found")
  })
})

// ---------------------------------------------------------------------------
// AuthService.refresh()
// ---------------------------------------------------------------------------

describe('AuthService.refresh()', () => {
  it('returns a new token when session is valid in Redis', async () => {
    const user = { id: 'u1', orgId: 'o1', email: 'a@b.com', username: 'alice', status: 'active', createdAt: new Date(), passwordHash: null }
    const db: any = {
      select: vi.fn().mockReturnThis(),
      from:   vi.fn().mockReturnThis(),
      where:  vi.fn().mockResolvedValue([user]),
    }
    const redis = makeMockRedis({ get: 'u1' })
    const app = makeMockApp('fresh-tok')

    const result = await new AuthService(db as any, redis as any).refresh('sid-xyz', app as any)
    expect(result.token).toBe('fresh-tok')
    expect(redis.expire).toHaveBeenCalledWith('session:sid-xyz', 60 * 60 * 24)
  })

  it('throws UnauthorizedError when session not in Redis', async () => {
    const redis = makeMockRedis({ get: null }) // session missing
    await expect(
      new AuthService(makeMockDb() as any, redis as any).refresh('invalid-sid', makeMockApp() as any)
    ).rejects.toThrow('Session expired or not found')
  })
})

// ---------------------------------------------------------------------------
// AuthService.forgotPassword()
// ---------------------------------------------------------------------------

describe('AuthService.forgotPassword()', () => {
  it('stores a reset token in Redis and returns it when email found', async () => {
    const user = { id: 'u1', email: 'a@b.com' }
    const db: any = {
      select: vi.fn().mockReturnThis(),
      from:   vi.fn().mockReturnThis(),
      where:  vi.fn().mockResolvedValue([user]),
    }
    const redis = makeMockRedis()
    const { token } = await new AuthService(db as any, redis as any).forgotPassword('a@b.com')

    expect(token).toBeTruthy()
    expect(redis.set).toHaveBeenCalledWith(
      expect.stringMatching(/^reset:/),
      'u1',
      'EX',
      60 * 15
    )
  })

  it('returns empty token when email not found (no user enumeration)', async () => {
    const db: any = {
      select: vi.fn().mockReturnThis(),
      from:   vi.fn().mockReturnThis(),
      where:  vi.fn().mockResolvedValue([]),
    }
    const { token } = await new AuthService(db as any, makeMockRedis() as any).forgotPassword('nope@example.com')
    expect(token).toBe('')
  })
})

// ---------------------------------------------------------------------------
// AuthService.resetPassword()
// ---------------------------------------------------------------------------

describe('AuthService.resetPassword()', () => {
  it('updates the password and deletes the reset token', async () => {
    const db: any = {
      update: vi.fn().mockReturnThis(),
      set:    vi.fn().mockReturnThis(),
      where:  vi.fn().mockResolvedValue(undefined),
    }
    const redis = makeMockRedis({ get: 'u1' })

    await new AuthService(db as any, redis as any).resetPassword('valid-token', 'NewPass1!')
    expect(redis.del).toHaveBeenCalledWith('reset:valid-token')
    expect(db.update).toHaveBeenCalled()
  })

  it('throws UnauthorizedError for invalid/expired token', async () => {
    const redis = makeMockRedis({ get: null })
    await expect(
      new AuthService(makeMockDb() as any, redis as any).resetPassword('bad-token', 'x')
    ).rejects.toThrow('Invalid or expired reset token')
  })
})
