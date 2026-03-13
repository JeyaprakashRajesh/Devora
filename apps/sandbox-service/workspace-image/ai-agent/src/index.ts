import Fastify from 'fastify'
import { config } from './config.js'
import { completeRoute } from './routes/complete.js'
import { chatRoute } from './routes/chat.js'
import { actionRoute } from './routes/action.js'
import { contextRoute } from './routes/context.js'
import { OllamaClient } from './services/ollama.client.js'
import { ActionService } from './services/action.service.js'
import { ContextService } from './services/context.service.js'

async function main(): Promise<void> {
  const app = Fastify({ logger: true })

  const ollamaClient = new OllamaClient(config.OLLAMA_URL)
  const actionService = new ActionService(config.WORKSPACE_ROOT)
  const contextService = new ContextService(config.WORKSPACE_ROOT, actionService)

  app.post('/complete', completeRoute({ ollamaClient, config }))
  app.post('/chat', chatRoute({ ollamaClient, config }))
  app.post('/agent/action', actionRoute({ actionService }))
  app.get('/context', contextRoute({ actionService, contextService, config }))
  app.get('/health', async () => ({ status: 'ok', service: 'devora-agent' }))

  await app.listen({ port: config.PORT, host: config.HOST })

  app.log.info(`Devora AI agent ready on port ${config.PORT}`)
  app.log.info(
    `Models: autocomplete=${config.AUTOCOMPLETE_MODEL} chat=${config.CHAT_MODEL}`,
  )
  app.log.info(`Workspace: ${config.WORKSPACE_ROOT}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
