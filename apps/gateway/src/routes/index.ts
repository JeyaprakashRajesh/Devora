import { FastifyInstance } from 'fastify'
import { proxyPlugin, ProxyRoute } from '../plugins/proxy.js'
import { config } from '../config.js'

const routes: ProxyRoute[] = [
  { prefix: '/api/auth', upstream: config.AUTH_SERVICE_URL },
  { prefix: '/api/projects', upstream: config.PROJECT_SERVICE_URL },
  { prefix: '/api/chat', upstream: config.CHAT_SERVICE_URL },
  { prefix: '/api/deploy', upstream: config.DEPLOY_SERVICE_URL },
  { prefix: '/api/monitor', upstream: config.MONITOR_SERVICE_URL },
  {
    prefix: '/api/sandbox',
    upstream: config.SANDBOX_SERVICE_URL,
    rewritePrefix: '',
    websocket: true,
  },
  { prefix: '/api/notify', upstream: config.NOTIFY_SERVICE_URL },
]

export async function registerRoutes(app: FastifyInstance) {
  // Register proxy plugin which handles all /api/* routes
  await app.register(proxyPlugin, { routes })

  // Health check for the gateway itself
  app.get('/health', async () => ({ status: 'ok', service: 'gateway' }))
}
