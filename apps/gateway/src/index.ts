import { buildApp } from './app.js'
import { config } from './config.js'

async function start() {
  const app = await buildApp()

  try {
    await app.listen({ port: config.PORT, host: '0.0.0.0' })
    app.log.info({ port: config.PORT }, 'Gateway started')
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

start()
