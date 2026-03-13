import { FastifyInstance } from 'fastify'
import { authenticate } from '../middleware/authenticate.js'
import { UserService } from '../services/user.service.js'

export async function usersRoutes(app: FastifyInstance) {
  const userService = new UserService(app.db)

  // GET /orgs/:orgId/users
  app.get('/:orgId/users', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { orgId } = request.params as { orgId: string }
    const users = await userService.listByOrg(orgId)
    return reply.send(users)
  })

  // POST /orgs/:orgId/users/invite
  app.post('/:orgId/users/invite', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { orgId } = request.params as { orgId: string }
    const { email } = request.body as { email: string }
    const user = await userService.inviteUser(orgId, email, app.nc)
    return reply.code(201).send(user)
  })

  // GET /orgs/:orgId/users/:userId
  app.get('/:orgId/users/:userId', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { userId } = request.params as { orgId: string; userId: string }
    const user = await userService.findById(userId)
    return reply.send(user)
  })

  // PATCH /orgs/:orgId/users/:userId
  app.patch('/:orgId/users/:userId', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { userId } = request.params as { orgId: string; userId: string }
    const { displayName, avatarUrl } = request.body as { displayName?: string; avatarUrl?: string }
    const user = await userService.update(userId, { displayName, avatarUrl })
    return reply.send(user)
  })

  // DELETE /orgs/:orgId/users/:userId
  app.delete('/:orgId/users/:userId', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { orgId, userId } = request.params as { orgId: string; userId: string }
    await userService.delete(userId, orgId)
    return reply.code(204).send()
  })
}
