import { eq } from 'drizzle-orm'
import { Db, schema } from '@devora/db'
import { NotFoundError } from '@devora/errors'

const { organizations } = schema

export class OrgService {
  constructor(private readonly db: Db) {}

  async findById(id: string) {
    const org = await this.db.query.organizations.findFirst({
      where: eq(organizations.id, id),
    })
    if (!org) throw new NotFoundError('Organization', id)
    return org
  }

  async findBySlug(slug: string) {
    return this.db.query.organizations.findFirst({
      where: eq(organizations.slug, slug),
    })
  }

  async update(id: string, data: { name?: string; settings?: Record<string, unknown> }) {
    const [updated] = await this.db
      .update(organizations)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(organizations.id, id))
      .returning()
    if (!updated) throw new NotFoundError('Organization', id)
    return updated
  }
}
