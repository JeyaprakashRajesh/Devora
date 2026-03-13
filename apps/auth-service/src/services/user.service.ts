import { eq, and } from 'drizzle-orm'
import { Db, schema } from '@devora/db'
import { NotFoundError } from '@devora/errors'
import { publish, Subjects } from '@devora/nats'
import type { NatsConnection } from 'nats'

const { users } = schema

export class UserService {
  constructor(private readonly db: Db) {}

  async findById(id: string) {
    const [user] = await this.db.select().from(users).where(eq(users.id, id))
    if (!user) throw new NotFoundError('User', id)
    const { passwordHash: _, ...safe } = user
    return safe
  }

  async findByEmail(email: string) {
    const [user] = await this.db.select().from(users).where(eq(users.email, email))
    return user ?? null
  }

  async listByOrg(orgId: string) {
    const orgUsers = await this.db.select().from(users).where(eq(users.orgId, orgId))
    return orgUsers.map(({ passwordHash: _, ...safe }) => safe)
  }

  async update(id: string, data: { displayName?: string; avatarUrl?: string }) {
    const [updated] = await this.db
      .update(users)
      .set({ ...data })
      .where(eq(users.id, id))
      .returning()
    if (!updated) throw new NotFoundError('User', id)
    const { passwordHash: _, ...safe } = updated
    return safe
  }

  async delete(id: string, orgId: string) {
    const [deleted] = await this.db
      .delete(users)
      .where(and(eq(users.id, id), eq(users.orgId, orgId)))
      .returning()
    if (!deleted) throw new NotFoundError('User', id)
    return deleted
  }

  async inviteUser(orgId: string, email: string, nc?: NatsConnection) {
    // Check if user already exists
    const existing = await this.findByEmail(email)
    if (existing) {
      if (existing.orgId === orgId) {
        return existing
      }
      // If user exists but in different org, we might handle this differently (e.g., cross-org invitation)
      // For now, let's assume one org per user email for simplicity or throw conflict if needed.
    }

    const [invited] = await this.db
      .insert(users)
      .values({
        orgId,
        email,
        username: email.split('@')[0], // Default username
        status: 'invited',
      })
      .returning()

    // Publish NATS event
    if (nc) {
      publish(nc, Subjects.AUTH_USER_INVITED, {
        email,
        orgId,
        invitedBy: 'system',
        expiresAt: null,
      })
    }

    const { passwordHash: _, ...safe } = invited
    return safe
  }
}
