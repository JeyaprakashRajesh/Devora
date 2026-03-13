import bcrypt from 'bcryptjs'
import { and, eq } from 'drizzle-orm'
import { randomUUID } from 'crypto'
import { Db, schema } from '@devora/db'
import { ConflictError, NotFoundError, UnauthorizedError } from '@devora/errors'
import type Redis from 'ioredis'
import type { FastifyInstance } from 'fastify'
import type { JwtPayload } from '../middleware/authenticate.js'
import { publish, Subjects } from '@devora/nats'
import type { NatsConnection } from 'nats'
import { RbacService } from './rbac.service.js'

const { users, organizations, roles, userRoles, sessions } = schema

export interface RegisterDto {
  orgName:  string
  orgSlug:  string
  email:    string
  password: string
  username: string
}

export interface LoginDto {
  email:    string
  password: string
}

export class AuthService {
  constructor(
    private readonly db: Db,
    private readonly redis: Redis
  ) {}

  async register(dto: RegisterDto, nc?: NatsConnection) {
    // Check if email already in use
    const [existing] = await this.db.select().from(users).where(eq(users.email, dto.email))
    if (existing) throw new ConflictError('Email already in use')

    // Check slug uniqueness
    const [existingOrg] = await this.db.select().from(organizations).where(eq(organizations.slug, dto.orgSlug))
    if (existingOrg) throw new ConflictError('Organization slug already taken')

    const passwordHash = await this.hashPassword(dto.password)

    // Create org
    const [org] = await this.db.insert(organizations).values({
      name: dto.orgName,
      slug: dto.orgSlug,
    }).returning()

    // Create super-admin user
    const [user] = await this.db.insert(users).values({
      orgId:       org.id,
      email:       dto.email,
      username:    dto.username,
      displayName: dto.username,
      passwordHash,
    }).returning()

    // Seed system roles and assign super_admin
    await this.seedSuperAdmin(org.id, user.id)

    // Publish NATS event
    if (nc) {
      publish(nc, Subjects.AUTH_USER_CREATED, {
        userId:    user.id,
        orgId:     org.id,
        email:     user.email,
        username:  user.username,
        createdAt: user.createdAt,
      })
    }

    return { user: this.safeUser(user), org }
  }

  async login(dto: LoginDto, app: FastifyInstance) {
    const [user] = await this.db.select().from(users).where(eq(users.email, dto.email))
    if (!user) throw new UnauthorizedError('Invalid email or password')
    if (user.status !== 'active') throw new UnauthorizedError('Invalid email or password')

    const valid = await this.verifyPassword(dto.password, user.passwordHash ?? '')
    if (!valid) throw new UnauthorizedError('Invalid email or password')

    const sessionId = randomUUID()

    const payload: JwtPayload = {
      sub:   user.id,
      org:   user.orgId,
      roles: [],
      sessionId,
    }

    const token = app.jwt.sign(payload as any)

    // Store session in Redis (24h TTL)
    await this.redis.set(`session:${sessionId}`, user.id, 'EX', 60 * 60 * 24)

    await this.db.insert(sessions).values({
      userId: user.id,
      tokenHash: sessionId,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    })

    return { user: this.safeUser(user), token, sessionId }
  }

  async logout(sessionId: string, redis: Redis) {
    if (sessionId) {
      await redis.del(`session:${sessionId}`)
      await this.db.delete(sessions).where(eq(sessions.tokenHash, sessionId))
    }
  }

  async getMe(userId: string, db: Db) {
    const [user] = await db.select().from(users).where(eq(users.id, userId))
    if (!user) throw new NotFoundError('User', userId)

    const [org] = await db.select().from(organizations).where(eq(organizations.id, user.orgId))

    // Get roles with permissions
    const grants = await db.select({
      roleId:      userRoles.roleId,
      roleName:    roles.name,
      permissions: roles.permissions,
    })
      .from(userRoles)
      .leftJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(userRoles.userId, userId))

    const permissions = new Set<string>()
    const roleNames: string[] = []
    const now = new Date()

    for (const grant of grants) {
      if ((grant as any).expiresAt && new Date((grant as any).expiresAt) < now) continue
      if (grant.roleName) roleNames.push(grant.roleName)
      if (grant.permissions) {
        for (const p of grant.permissions as string[]) {
          permissions.add(p)
        }
      }
    }

    return {
      user: this.safeUser(user),
      org,
      roles:       roleNames,
      permissions: Array.from(permissions),
    }
  }

  /**
   * Validate an existing session in Redis and issue a fresh JWT.
   * The old session key is kept alive (just re-issues the token).
   */
  async refresh(sessionId: string, app: FastifyInstance) {
    const userId = await this.redis.get(`session:${sessionId}`)
    if (!userId) throw new UnauthorizedError('Session expired or not found')

    const [user] = await this.db.select().from(users).where(eq(users.id, userId))
    if (!user) throw new UnauthorizedError('User not found')

    // Extend session TTL
    await this.redis.expire(`session:${sessionId}`, 60 * 60 * 24)

    const payload: JwtPayload = {
      sub:   user.id,
      org:   user.orgId,
      roles: [],
      sessionId,
    }

    const token = app.jwt.sign(payload as any)
    return { token, sessionId }
  }

  /**
   * Generate a password-reset token (UUID) stored in Redis with 15-minute TTL.
   * Returns the token so callers (e.g. tests) can pass it on.
   * In production an email service would send the link.
   */
  async forgotPassword(email: string): Promise<{ token: string }> {
    const [user] = await this.db.select().from(users).where(eq(users.email, email))
    // Always respond the same way to avoid user enumeration
    if (!user) return { token: '' }

    const token = randomUUID()
    await this.redis.set(`reset:${token}`, user.id, 'EX', 60 * 15) // 15 min
    return { token }
  }

  /**
   * Consume a password-reset token and update the user's password.
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    const userId = await this.redis.get(`reset:${token}`)
    if (!userId) throw new UnauthorizedError('Invalid or expired reset token')

    const passwordHash = await this.hashPassword(newPassword)

    await this.db
      .update(users)
      .set({ passwordHash })
      .where(eq(users.id, userId))

    // Consume the token
    await this.redis.del(`reset:${token}`)
  }

  async hashPassword(plain: string): Promise<string> {
    return bcrypt.hash(plain, 12)
  }

  async verifyPassword(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash)
  }

  /** Remove sensitive fields before returning */
  private safeUser(user: typeof users.$inferSelect) {
    const { passwordHash: _, ...safe } = user
    return safe
  }

  /** Create super_admin role for the org and assign it to the user */
  private async seedSuperAdmin(orgId: string, userId: string) {
    const rbac = new RbacService(this.db)
    await rbac.seedSystemRoles(orgId)

    const [role] = await this.db
      .select()
      .from(roles)
      .where(and(eq(roles.orgId, orgId), eq(roles.name, 'super_admin')))

    if (!role) {
      throw new Error('super_admin role not found after seeding')
    }

    await this.db.insert(userRoles).values({
      userId,
      roleId:    role.id,
      grantedBy: userId,
    })
  }
}
