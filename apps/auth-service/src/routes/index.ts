import { FastifyInstance } from 'fastify'
import { authRoutes } from './auth.js'
import { usersRoutes } from './users.js'
import { orgsRoutes } from './orgs.js'
import { rolesRoutes } from './roles.js'

export async function registerRoutes(app: FastifyInstance) {
  await app.register(authRoutes, { prefix: '/auth' })
  await app.register(usersRoutes, { prefix: '/orgs' })
  await app.register(orgsRoutes, { prefix: '/orgs' })
  await app.register(rolesRoutes, { prefix: '/orgs' })

  // Health check
  app.get('/health', async () => ({ status: 'ok', service: 'auth-service' }))
}
