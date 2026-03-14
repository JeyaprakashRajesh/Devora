import { FastifyInstance } from 'fastify'
import { proxyPlugin } from '../plugins/proxy.js'

export async function registerRoutes(app: FastifyInstance) {
  // Register proxy plugin which handles all /api/* routes
  await app.register(proxyPlugin)

  // Health check for the gateway itself
  app.get('/health', async () => ({ status: 'ok', service: 'gateway' }))
}
