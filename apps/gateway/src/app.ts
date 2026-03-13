import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import { createLogger } from '@devora/logger'
import { config } from './config.js'
import { registerRoutes } from './routes/index.js'

export async function buildApp() {
  const logger = createLogger('gateway')
  const app = Fastify({ logger: logger as any })

  // Plugins
  await app.register(cors, {
    origin: true, // In dev, allow all. In prod, this should be specific.
    credentials: true,
  })

  await app.register(jwt, {
    secret: config.JWT_SECRET,
  })

  // Routes
  await registerRoutes(app)

  // Error Handler
  app.setErrorHandler((error: any, _request, reply) => {
    if ('statusCode' in error || error.statusCode) {
      return reply.status(error.statusCode || 400).send({
        code: error.code || 'GEN_001',
        message: error.message,
        details: error.details,
      })
    }

    logger.error(error)
    return reply.status(500).send({
      code: 'GEN_002',
      message: 'Internal server error',
    })
  })

  return app
}
