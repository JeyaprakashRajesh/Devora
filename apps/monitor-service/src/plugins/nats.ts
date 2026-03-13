import { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'
import { createNatsClient } from '@devora/nats'
import { NatsConnection } from 'nats'
import { config } from '../config.js'

declare module 'fastify' {
  interface FastifyInstance {
    nats: NatsConnection
  }
}

async function natsPluginImpl(app: FastifyInstance) {
  const nats = await createNatsClient(config.NATS_URL, app.log as any)
  app.decorate('nats', nats)

  app.addHook('onClose', async () => {
    await nats.drain()
    await nats.close()
  })
}

export const natsPlugin = fp(natsPluginImpl, { name: 'monitor-nats-plugin' })