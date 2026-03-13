import fp from 'fastify-plugin'
import { FastifyInstance, FastifyRequest } from 'fastify'
import proxy from '@fastify/http-proxy'
import { config } from '../config.js'
import { UnauthorizedError } from '@devora/errors'

export const proxyPlugin = fp(async (app: FastifyInstance) => {
  // Routes to proxy
  const routes = [
    { prefix: '/api/auth', upstream: config.AUTH_SERVICE_URL },
    { prefix: '/api/projects', upstream: config.PROJECT_SERVICE_URL },
    { prefix: '/api/chat', upstream: config.CHAT_SERVICE_URL },
    { prefix: '/api/deploy', upstream: config.DEPLOY_SERVICE_URL },
    { prefix: '/api/monitor', upstream: config.MONITOR_SERVICE_URL },
    { prefix: '/api/sandbox', upstream: config.SANDBOX_SERVICE_URL },
    { prefix: '/api/notify', upstream: config.NOTIFY_SERVICE_URL },
  ]

  for (const route of routes) {
    app.register(proxy, {
      upstream: route.upstream,
      prefix: route.prefix,
      rewritePrefix: route.prefix.replace('/api', ''), // Services expect paths without /api
      preHandler: async (request: FastifyRequest) => {
        // Skip auth for login and register
        if (
          request.url.startsWith('/api/auth/login') ||
          request.url.startsWith('/api/auth/register') ||
          request.url.startsWith('/api/auth/forgot-password') ||
          request.url.startsWith('/api/auth/reset-password')
        ) {
          return
        }

        try {
          await request.jwtVerify()
          const payload = request.user as any
          
          // Add identity headers for downstream services
          request.headers['x-user-id'] = payload.sub
          request.headers['x-org-id'] = payload.org
          request.headers['x-user-roles'] = Array.isArray(payload.roles) ? payload.roles.join(',') : ''
        } catch (err) {
          throw new UnauthorizedError()
        }
      },
    })
  }
})
