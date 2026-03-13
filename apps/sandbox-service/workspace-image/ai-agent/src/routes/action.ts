import type { FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import {
  ActionService,
  CommandTimeoutError,
  ValidationError,
} from '../services/action.service.js'

const requestSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('read_file'),
    args: z.object({
      filePath: z.string(),
    }),
  }),
  z.object({
    action: z.literal('write_file'),
    args: z.object({
      filePath: z.string(),
      content: z.string().max(500 * 1024),
    }),
  }),
  z.object({
    action: z.literal('list_files'),
    args: z.object({
      dirPath: z.string(),
      depth: z.number().int().min(1).max(4).optional(),
    }),
  }),
  z.object({
    action: z.literal('run_command'),
    args: z.object({
      command: z.string(),
      args: z.array(z.string()).max(20),
    }),
  }),
  z.object({
    action: z.literal('search_code'),
    args: z.object({
      query: z.string().max(200),
      filePattern: z.string().optional(),
    }),
  }),
])

interface ActionRouteDeps {
  actionService: ActionService
}

export function actionRoute(deps: ActionRouteDeps) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const payload = requestSchema.parse(request.body)

      switch (payload.action) {
        case 'read_file': {
          const result = await deps.actionService.readFile(payload.args.filePath)
          return reply.send({ result })
        }
        case 'write_file': {
          await deps.actionService.writeFile(payload.args.filePath, payload.args.content)
          return reply.send({ result: { ok: true } })
        }
        case 'list_files': {
          const result = await deps.actionService.listFiles(
            payload.args.dirPath,
            payload.args.depth,
          )
          return reply.send({ result })
        }
        case 'run_command': {
          const result = await deps.actionService.runCommand(
            payload.args.command,
            payload.args.args,
          )
          return reply.send({ result })
        }
        case 'search_code': {
          const result = await deps.actionService.searchCode(
            payload.args.query,
            payload.args.filePattern,
          )
          return reply.send({ result })
        }
      }
    } catch (error) {
      if (error instanceof ValidationError || error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.message })
      }

      if (error instanceof CommandTimeoutError) {
        return reply.status(408).send({ error: error.message })
      }

      if (error instanceof Error && error.message.includes('Path traversal')) {
        return reply.status(400).send({ error: error.message })
      }

      return reply.status(500).send({ error: 'Action failed' })
    }
  }
}
