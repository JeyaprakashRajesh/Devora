import { eq } from 'drizzle-orm'
import { Db, schema } from '@devora/db'
import { NotFoundError } from '@devora/errors'

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
}
