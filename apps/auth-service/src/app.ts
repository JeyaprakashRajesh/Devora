import Fastify from 'fastify'
import { createLogger } from '@devora/logger'
import { dbPlugin } from './plugins/db.js'
import { redisPlugin } from './plugins/redis.js'
import { natsPlugin } from './plugins/nats.js'
import { jwtPlugin } from './plugins/jwt.js'
import { registerRoutes } from './routes/index.js'

export async function buildApp() {
  const logger = createLogger('auth-service')
  const app = Fastify({ logger: logger as any })

  await app.register(dbPlugin)
  await app.register(redisPlugin)
  await app.register(natsPlugin)
  await app.register(jwtPlugin)
  await registerRoutes(app)

  app.setErrorHandler((error, _request, reply) => {
    if ('statusCode' in error) {
      return reply.status(error.statusCode as number).send({
        code: (error as any).code,
        message: error.message,
        details: (error as any).details,
      })
    }
    logger.error(error)
    return reply.status(500).send({ code: 'GEN_002', message: 'Internal server error' })
  })

  return app
}
