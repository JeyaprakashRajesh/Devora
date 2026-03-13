import 'dotenv/config'
import { buildApp } from './app.js'
import { config } from './config.js'

async function main() {
  const app = await buildApp()

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'Received shutdown signal')
    try {
      await app.close()
    } finally {
      process.exit(0)
    }
  }

  process.on('SIGTERM', () => {
    void shutdown('SIGTERM')
  })

  process.on('SIGINT', () => {
    void shutdown('SIGINT')
  })

  process.on('uncaughtException', (error) => {
    app.log.error({ error }, 'Uncaught exception')
    process.exit(1)
  })

  process.on('unhandledRejection', (reason) => {
    app.log.error({ reason }, 'Unhandled rejection')
    process.exit(1)
  })

  await app.listen({ port: config.PORT, host: '0.0.0.0' })
}

void main()
