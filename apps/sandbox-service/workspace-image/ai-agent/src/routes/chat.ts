import type { FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import type { config as configType } from '../config.js'
import { buildSystemPrompt } from '../lib/prompts.js'
import { sanitizeForPrompt } from '../lib/sanitize.js'
import type { OllamaClient, OllamaMessage } from '../services/ollama.client.js'

const bodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().max(8000),
      }),
    )
    .max(20),
  context: z
    .object({
      filePath: z.string().optional(),
      language: z.string().optional(),
      projectName: z.string().optional(),
    })
    .optional(),
})

interface ChatRouteDeps {
  ollamaClient: OllamaClient
  config: typeof configType
}

export function chatRoute(deps: ChatRouteDeps) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const sendSse = (payload: string) => {
      reply.raw.write(`data: ${payload}\n\n`)
    }

    const closeSse = () => {
      reply.raw.end()
    }

    try {
      const body = bodySchema.parse(request.body)
      const systemPrompt = buildSystemPrompt({
        filePath: body.context?.filePath,
        language: body.context?.language,
        projectName: body.context?.projectName,
      })

      const messages: OllamaMessage[] = [
        { role: 'system', content: systemPrompt },
        ...body.messages.map((message) => ({
          role: message.role,
          content: sanitizeForPrompt(message.content),
        })),
      ]

      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      })

      const stream = await deps.ollamaClient.chat({
        model: deps.config.CHAT_MODEL,
        messages,
        stream: true,
      })

      let buffer = ''
      stream.on('data', (chunk: Buffer | string) => {
        buffer += chunk.toString()

        let newlineIndex = buffer.indexOf('\n')
        while (newlineIndex >= 0) {
          const line = buffer.slice(0, newlineIndex).trim()
          buffer = buffer.slice(newlineIndex + 1)

          if (line.length > 0) {
            try {
              const parsed = JSON.parse(line) as {
                done?: boolean
                message?: { content?: string }
              }

              const text = parsed.message?.content ?? ''
              if (text.length > 0) {
                sendSse(JSON.stringify({ text }))
              }

              if (parsed.done) {
                sendSse('[DONE]')
                closeSse()
              }
            } catch {
              // Ignore malformed stream lines.
            }
          }

          newlineIndex = buffer.indexOf('\n')
        }
      })

      stream.on('error', () => {
        sendSse(JSON.stringify({ error: 'AI service unavailable' }))
        closeSse()
      })

      stream.on('end', () => {
        sendSse('[DONE]')
        closeSse()
      })
    } catch {
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      })
      sendSse(JSON.stringify({ error: 'AI service unavailable' }))
      closeSse()
    }
  }
}
