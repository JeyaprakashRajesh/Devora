import path from 'node:path'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import type { config as configType } from '../config.js'
import { sanitizeFilePath } from '../lib/sanitize.js'
import type { ActionService } from '../services/action.service.js'
import type { ContextService } from '../services/context.service.js'

const querySchema = z.object({
  filePath: z.string(),
  cursorLine: z.coerce.number().optional(),
})

interface ContextRouteDeps {
  actionService: ActionService
  contextService: ContextService
  config: typeof configType
}

export function contextRoute(deps: ContextRouteDeps) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = querySchema.parse(request.query)
      const absolutePath = sanitizeFilePath(query.filePath)
      const context = await deps.contextService.build(absolutePath)

      const fileDir = path.dirname(absolutePath)
      const nearbyFiles = await deps.actionService.listFiles(fileDir, 1)

      return reply.send({
        currentFile: context.currentFile,
        nearbyFiles,
        projectMeta: context.projectMeta,
        workspaceId: deps.config.DEVORA_WORKSPACE_ID,
      })
    } catch (error) {
      return reply.status(400).send({
        error: error instanceof Error ? error.message : 'Invalid context request',
      })
    }
  }
}
