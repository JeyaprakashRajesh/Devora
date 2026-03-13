import 'dotenv/config'
import { buildApp } from './app.js'
import { config } from './config.js'

async function main() {
  const app = await buildApp()
  await app.listen({ port: config.PORT, host: '0.0.0.0' })
}

void main().catch((error) => {
  console.error(error)
  process.exit(1)
})