import { FastifyInstance } from 'fastify'
import { eq, and } from 'drizzle-orm'
import { schema } from '@devora/db'
import { authenticate } from '../middleware/authenticate.js'

const { users } = schema

export async function usersRoutes(app: FastifyInstance) {
  // GET /orgs/:orgId/users
  app.get('/:orgId/users', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { orgId } = request.params as { orgId: string }
    const orgUsers = await app.db
      .select()
      .from(users)
      .where(eq(users.orgId, orgId))
    return reply.send(orgUsers.map(({ passwordHash: _, ...safe }) => safe))
  })

  // POST /orgs/:orgId/users/invite
  app.post('/:orgId/users/invite', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { orgId } = request.params as { orgId: string }
    const { email } = request.body as { email: string }
    // TODO: implement invitation logic (Task 1-05)
    return reply.code(202).send({ message: 'Invitation queued', email, orgId })
  })

  // GET /orgs/:orgId/users/:userId
  app.get('/:orgId/users/:userId', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { orgId, userId } = request.params as { orgId: string; userId: string }
    const [user] = await app.db
      .select()
      .from(users)
      .where(and(eq(users.id, userId), eq(users.orgId, orgId)))
    if (!user) return reply.code(404).send({ code: 'GEN_003', message: 'User not found' })
    const { passwordHash: _, ...safe } = user
    return reply.send(safe)
  })

  // PATCH /orgs/:orgId/users/:userId
  app.patch('/:orgId/users/:userId', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { userId } = request.params as { orgId: string; userId: string }
    const { displayName, avatarUrl } = request.body as { displayName?: string; avatarUrl?: string }
    // TODO: implement update (Task 1-05)
    return reply.send({ id: userId, displayName, avatarUrl })
  })

  // DELETE /orgs/:orgId/users/:userId
  app.delete('/:orgId/users/:userId', {
    preHandler: [authenticate],
  }, async (_request, reply) => {
    // TODO: implement remove from org (Task 1-05)
    return reply.code(204).send()
  })
}
