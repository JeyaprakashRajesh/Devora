import type { FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import type { config as configType } from '../config.js'
import { buildFimPrompt } from '../lib/prompts.js'
import { sanitizeForPrompt } from '../lib/sanitize.js'
import type { OllamaClient } from '../services/ollama.client.js'

const bodySchema = z.object({
  prefix: z.string().max(4000),
  suffix: z.string().max(2000),
  language: z.string(),
})

interface CompleteRouteDeps {
  ollamaClient: OllamaClient
  config: typeof configType
}

export function completeRoute(deps: CompleteRouteDeps) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = bodySchema.parse(request.body)
      const prefix = sanitizeForPrompt(body.prefix)
      const suffix = sanitizeForPrompt(body.suffix)
      const modelAvailable = await deps.ollamaClient.isModelAvailable(
        deps.config.AUTOCOMPLETE_MODEL,
      )

      if (!modelAvailable) {
        return reply.send({ completion: '' })
      }

      const prompt = buildFimPrompt(prefix, suffix, body.language)
      const completion = await deps.ollamaClient.generate({
        model: deps.config.AUTOCOMPLETE_MODEL,
        prompt,
        stream: false,
      })

      return reply.send({ completion })
    } catch {
      return reply.send({ completion: '' })
    }
  }
}
