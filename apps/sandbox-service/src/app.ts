import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import websocket from '@fastify/websocket'
import { ZodError } from 'zod'
import { DevoraError } from '@devora/errors'
import { createLogger } from '@devora/logger'
import { config } from './config.js'
import { dbPlugin } from './plugins/db.js'
import { natsPlugin } from './plugins/nats.js'
import { k8sPlugin } from './plugins/k8s.js'
import { registerRoutes, type RegisterRoutesOptions } from './routes/index.js'

interface BuildAppOptions {
  registerRoutesOptions?: RegisterRoutesOptions
  skipInfrastructurePlugins?: boolean
}

export async function buildApp(options: BuildAppOptions = {}) {
  const logger = createLogger('sandbox-service')
  const app = Fastify({ logger: logger as any })

  await app.register(cors, {
    origin: config.NODE_ENV === 'development' ? '*' : false,
  })

  await app.register(jwt, {
    secret: config.JWT_SECRET,
  })
  await app.register(websocket)

  if (!options.skipInfrastructurePlugins) {
    await app.register(dbPlugin)
    await app.register(natsPlugin)
    await app.register(k8sPlugin)
  }
  await app.register(registerRoutes, options.registerRoutesOptions)

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof DevoraError) {
      return reply.status(error.statusCode).send({
        code: error.code,
        message: error.message,
        details: error.details,
      })
    }

    const maybeZod = error as { name?: string; issues?: unknown }
    if (error instanceof ZodError || maybeZod.name === 'ZodError' || Array.isArray(maybeZod.issues)) {
      return reply.status(400).send({
        code: 'GEN_001',
        message: 'Validation failed',
        details: maybeZod.issues,
      })
    }

    logger.error(error)
    return reply.status(500).send({
      code: 'GEN_002',
      message: 'Internal server error',
    })
  })

  const healthHandler = async () => {
    return {
      status: 'ok',
      service: 'sandbox-service',
      timestamp: new Date().toISOString(),
    }
  }

  app.get('/health', healthHandler)
  app.get('/sandbox/health', healthHandler)

  return app
}
