import fp from 'fastify-plugin'
import { FastifyInstance } from 'fastify'
import { createDb, Db } from '@devora/db'
import { config } from '../config.js'

declare module 'fastify' {
  interface FastifyInstance {
    db: Db
  }
}

export const dbPlugin = fp(async (app: FastifyInstance) => {
  const db = createDb(config.DATABASE_URL)
  app.decorate('db', db)
  app.log.info('Database plugin registered')
})
