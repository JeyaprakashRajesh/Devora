import { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import { schema } from '@devora/db'
import { authenticate } from '../middleware/authenticate.js'

const { organizations } = schema

export async function orgsRoutes(app: FastifyInstance) {
  // GET /orgs/:orgId
  app.get('/:orgId', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { orgId } = request.params as { orgId: string }
    const [org] = await app.db
      .select()
      .from(organizations)
      .where(eq(organizations.id, orgId))
    if (!org) return reply.code(404).send({ code: 'GEN_003', message: 'Organization not found' })
    return reply.send(org)
  })
}
