import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { config as loadDotEnv } from 'dotenv'
import bcrypt from 'bcryptjs'
import Redis from 'ioredis'
import { Pool } from 'pg'
import { and, eq } from 'drizzle-orm'
import { schema } from '@devora/db'

loadDotEnv({ path: path.resolve(process.cwd(), '.env.test') })

const databaseUrl = process.env.DATABASE_URL
const redisUrl = process.env.REDIS_URL

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required for tests')
}

if (!redisUrl) {
  throw new Error('REDIS_URL is required for tests')
}

const pool = new Pool({ connectionString: databaseUrl })
const redis = new Redis(redisUrl)

export async function buildTestApp() {
  const { buildApp } = await import('../app.js')
  const app = await buildApp()
  await app.ready()
  return app
}

export async function seedOrg(app: Awaited<ReturnType<typeof buildTestApp>>) {
  const [org] = await app.db
    .insert(schema.organizations)
    .values({
      name: `Test Org ${randomUUID().slice(0, 8)}`,
      slug: `test-org-${randomUUID().slice(0, 8)}`,
    })
    .returning()

  return { org }
}

export async function seedUser(
  app: Awaited<ReturnType<typeof buildTestApp>>,
  orgId: string,
  overrides?: Partial<typeof schema.users.$inferInsert>,
) {
  const plainPassword = 'Password123!'
  const passwordHash = await bcrypt.hash(plainPassword, 12)

  const [user] = await app.db
    .insert(schema.users)
    .values({
      orgId,
      email: overrides?.email ?? `${randomUUID().slice(0, 8)}@example.com`,
      username: overrides?.username ?? `user-${randomUUID().slice(0, 6)}`,
      displayName: overrides?.displayName ?? 'Test User',
      status: overrides?.status ?? 'active',
      passwordHash,
      avatarUrl: overrides?.avatarUrl,
      lastSeenAt: overrides?.lastSeenAt,
    })
    .returning()

  return { user, plainPassword }
}

export async function seedRole(
  app: Awaited<ReturnType<typeof buildTestApp>>,
  orgId: string,
  roleName: string,
  userId?: string,
  options?: {
    permissions?: string[]
    scope?: string
    resourceType?: string
    resourceId?: string
    expiresAt?: Date
    isSystem?: boolean
  },
) {
  const [role] = await app.db
    .insert(schema.roles)
    .values({
      orgId,
      name: roleName,
      scope: options?.scope ?? 'org',
      permissions: options?.permissions ?? ['project:read'],
      isSystem: options?.isSystem ?? false,
    })
    .returning()

  if (userId) {
    await app.db.insert(schema.userRoles).values({
      userId,
      roleId: role.id,
      grantedBy: userId,
      resourceType: options?.resourceType,
      resourceId: options?.resourceId,
      expiresAt: options?.expiresAt,
    })
  }

  return { role }
}

export async function getToken(
  app: Awaited<ReturnType<typeof buildTestApp>>,
  email: string,
  password: string,
) {
  const response = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email, password },
  })

  if (response.statusCode !== 200) {
    throw new Error(`Unable to get token: ${response.statusCode} ${response.body}`)
  }

  return response.json<{ token: string }>().token
}

export function getAuthHeader(token: string) {
  return { Authorization: `Bearer ${token}` }
}

export async function flushRedis() {
  await redis.flushdb()
}

export async function truncateTables() {
  const result = await pool.query<{ tablename: string }>(`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
  `)

  if (result.rows.length === 0) {
    return
  }

  const tableList = result.rows.map((row) => `"public"."${row.tablename}"`).join(', ')
  await pool.query(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`)
}

export async function seedOrgAndUser(app: Awaited<ReturnType<typeof buildTestApp>>) {
  const { org } = await seedOrg(app)
  const { user, plainPassword } = await seedUser(app, org.id)
  return { org, user, plainPassword }
}

export async function seedUserWithRole(
  app: Awaited<ReturnType<typeof buildTestApp>>,
  orgId: string,
  roleName: string,
  scope: string,
  permissions: string[],
  options?: { resourceType?: string; resourceId?: string; expiresAt?: Date; status?: string },
) {
  const { user, plainPassword } = await seedUser(app, orgId, { status: options?.status ?? 'active' })
  const { role } = await seedRole(app, orgId, roleName, user.id, {
    scope,
    permissions,
    resourceType: options?.resourceType,
    resourceId: options?.resourceId,
    expiresAt: options?.expiresAt,
  })

  const [assignment] = await app.db
    .select()
    .from(schema.userRoles)
    .where(and(eq(schema.userRoles.userId, user.id), eq(schema.userRoles.roleId, role.id)))

  return { user, plainPassword, role, assignment }
}
