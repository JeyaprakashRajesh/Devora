import fp from 'fastify-plugin'
import { FastifyInstance } from 'fastify'
import Redis from 'ioredis'
import { config } from '../config.js'

declare module 'fastify' {
  interface FastifyInstance {
    redis: Redis
  }
}

export const redisPlugin = fp(async (app: FastifyInstance) => {
  const redis = new Redis(config.REDIS_URL)

  redis.on('error', (err) => app.log.error({ err }, 'Redis connection error'))
  redis.on('connect', () => app.log.info('Connected to Redis'))

  app.decorate('redis', redis)

  app.addHook('onClose', async () => {
    await redis.quit()
  })
})
