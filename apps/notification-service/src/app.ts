import Fastify from 'fastify'
import { ZodError } from 'zod'
import { createLogger } from '@devora/logger'
import { dbPlugin } from './plugins/db.js'
import { natsPlugin } from './plugins/nats.js'
import { registerSandboxSubscribers } from './subscribers/sandbox.subscriber.js'

export async function buildApp() {
  const logger = createLogger('notification-service')
  const app = Fastify({ logger: logger as any })

  await app.register(dbPlugin)
  await app.register(natsPlugin)

  registerSandboxSubscribers(app.nats, app.db, app.log as any)

  app.setErrorHandler((error, _request, reply) => {
    const maybeZod = error as { name?: string; issues?: unknown }
    if (error instanceof ZodError || maybeZod.name === 'ZodError' || Array.isArray(maybeZod.issues)) {
      return reply.status(400).send({
        code: 'GEN_001',
        message: 'Validation failed',
        details: maybeZod.issues,
      })
    }

    app.log.error(error)
    return reply.status(500).send({
      code: 'GEN_002',
      message: 'Internal server error',
    })
  })

  app.get('/health', async () => ({
    status: 'ok',
    service: 'notification-service',
    timestamp: new Date().toISOString(),
  }))

  return app
}