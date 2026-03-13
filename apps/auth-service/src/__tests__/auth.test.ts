import { randomUUID } from 'node:crypto'
import { connect, JSONCodec } from 'nats'
import { eq } from 'drizzle-orm'
import { schema } from '@devora/db'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { Subjects as NatsSubjects } from '@devora/nats'
import {
  buildTestApp,
  flushRedis,
  getAuthHeader,
  getToken,
  seedOrgAndUser,
  seedRole,
  truncateTables,
} from './helpers'

const jc = JSONCodec()

let app: Awaited<ReturnType<typeof buildTestApp>>

describe('Auth Routes Integration', () => {
  beforeAll(async () => {
    app = await buildTestApp()
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(async () => {
    await truncateTables()
    await flushRedis()
  })

  describe('POST /auth/register', () => {
    it('creates org, super-admin user, and returns JWT', async () => {
      const payload = {
        orgName: 'Acme Labs',
        name: 'Alice',
        email: 'alice@example.com',
        password: 'Password123!',
      }

      const response = await app.inject({ method: 'POST', url: '/auth/register', payload })
      expect(response.statusCode).toBe(201)

      const body = response.json<{
        token: string
        user: { id: string; email: string; orgId: string }
        org: { id: string; slug: string }
      }>()

      expect(body.token).toBeTypeOf('string')
      expect(body.token.length).toBeGreaterThan(0)
      expect(body.user.id).toBeTruthy()
      expect(body.user.email).toBe(payload.email)
      expect(body.user.orgId).toBeTruthy()
      expect(body.org.id).toBeTruthy()
      expect(body.org.slug).toBe('acme-labs')

      const orgRows = await app.db.select().from(schema.organizations)
      const userRows = await app.db.select().from(schema.users)
      const roleRows = await app.db.select().from(schema.roles).where(eq(schema.roles.orgId, body.org.id))
      const assignedRows = await app.db.select().from(schema.userRoles).where(eq(schema.userRoles.userId, body.user.id))

      expect(orgRows).toHaveLength(1)
      expect(userRows).toHaveLength(1)
      expect(userRows[0]?.email).toBe(payload.email)
      expect(roleRows.map((r) => r.name)).toEqual(
        expect.arrayContaining(['super_admin', 'org_admin', 'project_manager', 'tech_lead', 'developer', 'viewer']),
      )

      const assignedRoleIds = new Set(assignedRows.map((row) => row.roleId))
      const superAdminRole = roleRows.find((row) => row.name === 'super_admin')
      expect(superAdminRole).toBeTruthy()
      expect(assignedRoleIds.has(superAdminRole!.id)).toBe(true)
    })

    it('slugifies org name correctly', async () => {
      const cases = [
        { orgName: 'My Awesome Company', expected: 'my-awesome-company' },
        { orgName: '  Spaces  ', expected: 'spaces' },
        { orgName: 'Acme & Co.', expected: 'acme-co' },
      ]

      for (const testCase of cases) {
        const response = await app.inject({
          method: 'POST',
          url: '/auth/register',
          payload: {
            orgName: testCase.orgName,
            name: 'User',
            email: `${randomUUID().slice(0, 8)}@example.com`,
            password: 'Password123!',
          },
        })

        expect(response.statusCode).toBe(201)
        expect(response.json<{ org: { slug: string } }>().org.slug).toBe(testCase.expected)
      }
    })

    it('returns 409 if email already registered', async () => {
      const payload = {
        orgName: 'Repeat Org',
        name: 'Alice',
        email: 'dup@example.com',
        password: 'Password123!',
      }

      const first = await app.inject({ method: 'POST', url: '/auth/register', payload })
      expect(first.statusCode).toBe(201)

      const second = await app.inject({ method: 'POST', url: '/auth/register', payload })
      expect(second.statusCode).toBe(409)
      expect(second.json<{ code: string }>().code).toBe('GEN_004')
    })

    it('returns 400 if email is invalid', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          orgName: 'Acme',
          name: 'Alice',
          email: 'notanemail',
          password: 'Password123!',
        },
      })

      expect(response.statusCode).toBe(400)
      expect(response.json<{ code: string }>().code).toBe('GEN_001')
    })

    it('returns 400 if password is too short', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          orgName: 'Acme',
          name: 'Alice',
          email: 'alice@example.com',
          password: 'short',
        },
      })

      expect(response.statusCode).toBe(400)
    })

    it('returns 400 if required fields are missing', async () => {
      const missingOrg = await app.inject({ method: 'POST', url: '/auth/register', payload: { email: 'a@b.com', password: 'Password123!' } })
      const missingEmail = await app.inject({ method: 'POST', url: '/auth/register', payload: { orgName: 'Acme', password: 'Password123!' } })
      const missingPassword = await app.inject({ method: 'POST', url: '/auth/register', payload: { orgName: 'Acme', email: 'a@b.com' } })

      expect(missingOrg.statusCode).toBe(400)
      expect(missingEmail.statusCode).toBe(400)
      expect(missingPassword.statusCode).toBe(400)
    })

    it('publishes AUTH_USER_CREATED event to NATS after registration', async () => {
      const nc = await connect({ servers: process.env.NATS_URL })
      const subscription = nc.subscribe(NatsSubjects.AUTH_USER_CREATED)

      const payload = {
        orgName: 'Nats Org',
        name: 'Nats User',
        email: `${randomUUID().slice(0, 8)}@example.com`,
        password: 'Password123!',
      }

      const messagePromise = (async () => {
        for await (const message of subscription) {
          return jc.decode(message.data) as { userId: string; orgId: string; email: string }
        }
        return null
      })()

      const response = await app.inject({ method: 'POST', url: '/auth/register', payload })
      expect(response.statusCode).toBe(201)

      const message = await Promise.race([
        messagePromise,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000)),
      ])

      expect(message).not.toBeNull()
      expect(message?.userId).toBeTruthy()
      expect(message?.orgId).toBeTruthy()
      expect(message?.email).toBe(payload.email)

      subscription.unsubscribe()
      await nc.drain()
    })
  })

  describe('POST /auth/login', () => {
    beforeEach(async () => {
      await truncateTables()
      await flushRedis()
      const { org, user, plainPassword } = await seedOrgAndUser(app)
      await seedRole(app, org.id, 'developer', user.id, {
        permissions: ['project:read'],
      })
      ;(globalThis as any).__loginFixture = { org, user, plainPassword }
    })

    it('returns 200 with JWT token on valid credentials', async () => {
      const fixture = (globalThis as any).__loginFixture as { user: { email: string; id: string; orgId: string }; plainPassword: string }

      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: fixture.user.email, password: fixture.plainPassword },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json<{ token: string; user: { email: string }; sessionId: string }>()
      expect(body.token).toBeTruthy()
      expect(body.user.email).toBe(fixture.user.email)
      expect(body.sessionId).toBeTruthy()

      const decoded = app.jwt.decode(body.token) as { sub: string; org: string; exp: number }
      expect(decoded.sub).toBe(fixture.user.id)
      expect(decoded.org).toBe(fixture.user.orgId)
      expect(decoded.exp).toBeGreaterThan(Math.floor(Date.now() / 1000))
    })

    it('returns 401 on wrong password', async () => {
      const fixture = (globalThis as any).__loginFixture as { user: { email: string } }
      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: fixture.user.email, password: 'WrongPass123!' },
      })

      expect(response.statusCode).toBe(401)
      expect(response.json<{ code: string }>().code).toBe('AUTH_001')
    })

    it('returns 401 on unknown email', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: 'missing@example.com', password: 'WrongPass123!' },
      })

      expect(response.statusCode).toBe(401)
    })

    it('returns 401 on suspended user', async () => {
      const fixture = (globalThis as any).__loginFixture as { user: { id: string; email: string }; plainPassword: string }

      await app.db
        .update(schema.users)
        .set({ status: 'suspended' })
        .where(eq(schema.users.id, fixture.user.id))

      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: fixture.user.email, password: fixture.plainPassword },
      })

      expect(response.statusCode).toBe(401)
    })

    it('creates a session record in DB', async () => {
      const fixture = (globalThis as any).__loginFixture as { user: { id: string; email: string }; plainPassword: string }

      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: fixture.user.email, password: fixture.plainPassword },
      })

      const body = response.json<{ sessionId: string }>()
      const rows = await app.db.select().from(schema.sessions).where(eq(schema.sessions.tokenHash, body.sessionId))

      expect(rows).toHaveLength(1)
      expect(rows[0]?.userId).toBe(fixture.user.id)
      expect((rows[0]?.expiresAt?.getTime() ?? 0) > Date.now()).toBe(true)
    })

    it('stores session in Redis with correct TTL', async () => {
      const fixture = (globalThis as any).__loginFixture as { user: { id: string; email: string }; plainPassword: string }

      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: fixture.user.email, password: fixture.plainPassword },
      })

      const body = response.json<{ sessionId: string }>()
      const value = await app.redis.get(`session:${body.sessionId}`)
      const ttl = await app.redis.ttl(`session:${body.sessionId}`)

      expect(value).toBe(fixture.user.id)
      expect(ttl).toBeGreaterThan(0)
    })
  })

  describe('POST /auth/logout', () => {
    it('invalidates session and rejects subsequent /auth/me', async () => {
      const { user, plainPassword } = await seedOrgAndUser(app)
      const token = await getToken(app, user.email, plainPassword)

      const meBefore = await app.inject({ method: 'GET', url: '/auth/me', headers: getAuthHeader(token) })
      expect(meBefore.statusCode).toBe(200)

      const logout = await app.inject({ method: 'POST', url: '/auth/logout', headers: getAuthHeader(token) })
      expect([200, 204]).toContain(logout.statusCode)

      const meAfter = await app.inject({ method: 'GET', url: '/auth/me', headers: getAuthHeader(token) })
      expect(meAfter.statusCode).toBe(401)
    })

    it('removes session from Redis', async () => {
      const { user, plainPassword } = await seedOrgAndUser(app)
      const login = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: user.email, password: plainPassword } })
      const { token, sessionId } = login.json<{ token: string; sessionId: string }>()

      const logout = await app.inject({ method: 'POST', url: '/auth/logout', headers: getAuthHeader(token) })
      expect([200, 204]).toContain(logout.statusCode)

      const session = await app.redis.get(`session:${sessionId}`)
      expect(session).toBeNull()
    })

    it('returns 401 if no token provided', async () => {
      const response = await app.inject({ method: 'POST', url: '/auth/logout' })
      expect(response.statusCode).toBe(401)
    })
  })

  describe('GET /auth/me', () => {
    it('returns user profile with permissions array', async () => {
      const { org, user, plainPassword } = await seedOrgAndUser(app)
      await seedRole(app, org.id, 'developer', user.id, {
        scope: 'project',
        permissions: ['issue:read', 'code:read'],
      })

      const token = await getToken(app, user.email, plainPassword)
      const response = await app.inject({ method: 'GET', url: '/auth/me', headers: getAuthHeader(token) })

      expect(response.statusCode).toBe(200)
      const body = response.json<{
        user: { id: string; email: string; username: string }
        org: { id: string; name: string; slug: string }
        permissions: string[]
      }>()

      expect(body.user.id).toBe(user.id)
      expect(body.user.email).toBe(user.email)
      expect(body.user.username).toBe(user.username)
      expect(body.org.id).toBe(org.id)
      expect(body.org.name).toBe(org.name)
      expect(body.org.slug).toBe(org.slug)
      expect(Array.isArray(body.permissions)).toBe(true)
      expect(body.permissions.some((permission) => typeof permission === 'string')).toBe(true)
    })

    it('returns 401 without Authorization header', async () => {
      const response = await app.inject({ method: 'GET', url: '/auth/me' })
      expect(response.statusCode).toBe(401)
    })

    it('returns 401 with malformed token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/auth/me',
        headers: { Authorization: 'Bearer notavalidjwt' },
      })

      expect(response.statusCode).toBe(401)
    })

    it('returns 401 with expired token', async () => {
      const { user } = await seedOrgAndUser(app)
      const token = app.jwt.sign({ sub: user.id, org: user.orgId, roles: [], sessionId: randomUUID() }, { expiresIn: '1ms' })
      await new Promise((resolve) => setTimeout(resolve, 20))

      const response = await app.inject({
        method: 'GET',
        url: '/auth/me',
        headers: getAuthHeader(token),
      })

      expect(response.statusCode).toBe(401)
      expect(response.json<{ code: string }>().code).toBe('AUTH_001')
    })

    it('returns 401 after logout', async () => {
      const { user, plainPassword } = await seedOrgAndUser(app)
      const token = await getToken(app, user.email, plainPassword)

      await app.inject({ method: 'POST', url: '/auth/logout', headers: getAuthHeader(token) })
      const me = await app.inject({ method: 'GET', url: '/auth/me', headers: getAuthHeader(token) })
      expect(me.statusCode).toBe(401)
    })

    it('includes all permissions for super_admin including wildcard', async () => {
      const register = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          orgName: 'Super Org',
          name: 'Boss',
          email: 'boss@example.com',
          password: 'Password123!',
        },
      })

      const { token } = register.json<{ token: string }>()
      const me = await app.inject({ method: 'GET', url: '/auth/me', headers: getAuthHeader(token) })
      expect(me.statusCode).toBe(200)
      expect(me.json<{ permissions: string[] }>().permissions).toContain('*')
    })
  })

  describe('POST /auth/refresh', () => {
    it('returns new token with fresh expiry', async () => {
      const { user, plainPassword } = await seedOrgAndUser(app)
      const login = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: user.email, password: plainPassword },
      })

      const { token, sessionId } = login.json<{ token: string; sessionId: string }>()
      const oldExp = (app.jwt.decode(token) as { exp: number }).exp

      await new Promise((resolve) => setTimeout(resolve, 1200))

      const refresh = await app.inject({ method: 'POST', url: '/auth/refresh', payload: { sessionId } })
      expect(refresh.statusCode).toBe(200)

      const newToken = refresh.json<{ token: string }>().token
      const newExp = (app.jwt.decode(newToken) as { exp: number }).exp
      expect(newExp).toBeGreaterThan(oldExp)
    })

    it('returns 401 with invalid token/session', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        payload: { sessionId: randomUUID() },
      })

      expect(response.statusCode).toBe(401)
    })
  })
})
