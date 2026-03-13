import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import websocket from '@fastify/websocket'
import { createLogger } from '@devora/logger'
import { config } from './config.js'
import { registerRoutes } from './routes/index.js'

type ErrorWithFields = {
  code?: unknown
  statusCode?: unknown
  message?: unknown
  details?: unknown
}

const UPSTREAM_NETWORK_ERROR_CODES = new Set([
  'UND_ERR_SOCKET',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'ECONNREFUSED',
  'ECONNRESET',
  'EPIPE',
  'ENOTFOUND',
  'ETIMEDOUT',
])

export function isUpstreamNetworkError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false
  }

  const maybeError = error as ErrorWithFields
  return typeof maybeError.code === 'string' && UPSTREAM_NETWORK_ERROR_CODES.has(maybeError.code)
}

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

  // Must be registered before @fastify/http-proxy routes with websocket: true.
  await app.register(websocket)

  // Routes
  await registerRoutes(app)

  // Error Handler
  app.setErrorHandler((error: unknown, _request, reply) => {
    const maybeError = error as ErrorWithFields

    if (isUpstreamNetworkError(error)) {
      return reply.status(503).send({
        code: 'GEN_003',
        message: 'Upstream service is unavailable. Verify sandbox and dependent services are running.',
      })
    }

    if (typeof maybeError.statusCode === 'number') {
      return reply.status(maybeError.statusCode).send({
        code: typeof maybeError.code === 'string' ? maybeError.code : 'GEN_001',
        message: typeof maybeError.message === 'string' ? maybeError.message : 'Request failed',
        details: maybeError.details,
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
