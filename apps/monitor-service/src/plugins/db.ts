import { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'
import { createDb, Db } from '@devora/db'
import { config } from '../config.js'

declare module 'fastify' {
  interface FastifyInstance {
    db: Db
  }
}

async function dbPluginImpl(app: FastifyInstance) {
  const db = createDb(config.DATABASE_URL)
  app.decorate('db', db)

  app.addHook('onClose', async () => {
    await (db as any).$client.end()
  })
}

export const dbPlugin = fp(dbPluginImpl, { name: 'monitor-db-plugin' })