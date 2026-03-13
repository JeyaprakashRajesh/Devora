import Fastify from 'fastify'
import { createLogger } from '@devora/logger'
import { ZodError } from 'zod'
import { dbPlugin } from './plugins/db.js'
import { redisPlugin } from './plugins/redis.js'
import { natsPlugin } from './plugins/nats.js'
import { jwtPlugin } from './plugins/jwt.js'
import { registerRoutes } from './routes/index.js'
import { registerSandboxSubscribers } from './subscribers/sandbox.subscriber.js'

export async function buildApp() {
  const logger = createLogger('auth-service')
  const app = Fastify({ logger: logger as any })

  await app.register(dbPlugin)
  await app.register(redisPlugin)
  await app.register(natsPlugin)
  await app.register(jwtPlugin)
  registerSandboxSubscribers(app.nc, app.db, app.log as any)
  await registerRoutes(app)

  app.setErrorHandler((error, _request, reply) => {
    const maybeZod = error as { name?: string; issues?: unknown }
    if (error instanceof ZodError || maybeZod.name === 'ZodError' || Array.isArray(maybeZod.issues)) {
      return reply.status(400).send({
        code: 'GEN_001',
        message: 'Validation failed',
        details: maybeZod.issues,
      })
    }

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
