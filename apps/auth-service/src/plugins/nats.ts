import fp from 'fastify-plugin'
import { FastifyInstance } from 'fastify'
import { createNatsClient } from '@devora/nats'
import { NatsConnection } from 'nats'
import { config } from '../config.js'

declare module 'fastify' {
  interface FastifyInstance {
    nc: NatsConnection
  }
}

export const natsPlugin = fp(async (app: FastifyInstance) => {
  const nc = await createNatsClient(config.NATS_URL, app.log as any)
  app.decorate('nc', nc)

  app.addHook('onClose', async () => {
    await nc.drain()
  })
})
