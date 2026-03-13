import fp from 'fastify-plugin'
import { FastifyInstance, FastifyRequest } from 'fastify'
import proxy from '@fastify/http-proxy'
import { UnauthorizedError } from '@devora/errors'

export interface ProxyRoute {
  prefix: string
  upstream: string
  rewritePrefix?: string
  websocket?: boolean
}

interface ProxyPluginOptions {
  routes: ProxyRoute[]
}

export const proxyPlugin = fp<ProxyPluginOptions>(async (app: FastifyInstance, options) => {
  const routes = options.routes

  for (const route of routes) {
    const rewritePrefix = route.rewritePrefix ?? route.prefix.replace('/api', '')

    app.register(proxy, {
      upstream: route.upstream,
      prefix: route.prefix,
      websocket: route.websocket,
      rewritePrefix: rewritePrefix === '' ? '/' : rewritePrefix,
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
          let payload: any
          let tokenForDownstream: string | null = null

          const authHeader = request.headers.authorization
          if (typeof authHeader === 'string' && authHeader.length > 0) {
            await request.jwtVerify()
            payload = request.user as any
            if (authHeader.startsWith('Bearer ')) {
              tokenForDownstream = authHeader.slice('Bearer '.length).trim()
            }
          } else {
            const queryToken = (request.query as { token?: unknown } | undefined)?.token
            if (typeof queryToken !== 'string' || queryToken.length === 0) {
              throw new Error('Missing token')
            }

            payload = app.jwt.verify(queryToken)
            tokenForDownstream = queryToken
          }

          if (tokenForDownstream) {
            request.headers.authorization = `Bearer ${tokenForDownstream}`
          }

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
