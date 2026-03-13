import type { FastifyPluginAsync } from 'fastify'
import { ValidationError } from '@devora/errors'
import { z } from 'zod'
import type {
  Workspace,
  WorkspaceService,
  WorkspaceSession,
  WorkspaceStatus,
} from '../services/workspace.service.js'
import authenticate from '../middleware/authenticate.js'

interface WorkspaceRoutesOptions {
  workspaceService: WorkspaceService
}

const createWorkspaceSchema = z.object({
  projectId: z.string().uuid().optional(),
})

const workspaceIdSchema = z.string().uuid()

const logsQuerySchema = z.object({
  tailLines: z.preprocess(
    (value) => {
      if (value === undefined) {
        return 100
      }

      const parsed = Number(value)
      if (Number.isNaN(parsed)) {
        return value
      }

      return Math.min(1000, Math.max(1, parsed))
    },
    z.coerce.number().min(1).max(1000).default(100),
  ),
})

function parseWorkspaceId(value: string): string {
  const result = workspaceIdSchema.safeParse(value)
  if (!result.success) {
    throw new ValidationError('Invalid workspace ID')
  }
  return result.data
}

const workspacesRoutes: FastifyPluginAsync<WorkspaceRoutesOptions> = async (
  app,
  { workspaceService },
) => {
  app.post<{ Body: { projectId?: string }; Reply: WorkspaceSession }>(
    '/workspaces',
    { preHandler: authenticate },
    async (request, reply) => {
      const parsedBody = createWorkspaceSchema.safeParse(request.body ?? {})
      if (!parsedBody.success) {
        throw new ValidationError('Validation failed', parsedBody.error.issues)
      }

      const body = parsedBody.data
      const session = await workspaceService.getOrCreate(
        request.user.sub,
        request.user.org,
        body.projectId,
      )
      return reply.status(200).send(session)
    },
  )

  app.get<{ Reply: { workspaces: Workspace[] } }>(
    '/workspaces',
    { preHandler: authenticate },
    async (request, reply) => {
      const workspaces = await workspaceService.list(request.user.sub)
      return reply.status(200).send({ workspaces })
    },
  )

  app.get<{ Params: { workspaceId: string }; Reply: WorkspaceStatus }>(
    '/workspaces/:workspaceId',
    { preHandler: authenticate },
    async (request, reply) => {
      const workspaceId = parseWorkspaceId(request.params.workspaceId)
      const status = await workspaceService.getStatus(workspaceId, request.user.sub)
      return reply.status(200).send(status)
    },
  )

  app.post<{ Params: { workspaceId: string }; Reply: { message: string } }>(
    '/workspaces/:workspaceId/stop',
    { preHandler: authenticate },
    async (request, reply) => {
      const workspaceId = parseWorkspaceId(request.params.workspaceId)
      await workspaceService.stop(workspaceId, request.user.sub)
      return reply.status(200).send({ message: 'Workspace stopped' })
    },
  )

  app.post<{ Params: { workspaceId: string }; Reply: { ok: boolean } }>(
    '/workspaces/:workspaceId/heartbeat',
    { preHandler: authenticate },
    async (request, reply) => {
      const workspaceId = parseWorkspaceId(request.params.workspaceId)
      await workspaceService.heartbeat(workspaceId, request.user.sub)
      return reply.status(200).send({ ok: true })
    },
  )

  app.delete<{ Params: { workspaceId: string }; Reply: { message: string } }>(
    '/workspaces/:workspaceId',
    { preHandler: authenticate },
    async (request, reply) => {
      const workspaceId = parseWorkspaceId(request.params.workspaceId)
      app.log.warn(
        `Permanent workspace deletion requested by ${request.user.sub} for ${workspaceId}`,
      )
      await workspaceService.delete(workspaceId, request.user.sub)
      return reply.status(200).send({ message: 'Workspace deleted' })
    },
  )

  app.get<{ Params: { workspaceId: string }; Querystring: { tailLines?: string } }>(
    '/workspaces/:workspaceId/logs',
    { preHandler: authenticate },
    async (request, reply) => {
      const workspaceId = parseWorkspaceId(request.params.workspaceId)
      const parsedQuery = logsQuerySchema.safeParse(request.query ?? {})
      if (!parsedQuery.success) {
        throw new ValidationError('Validation failed', parsedQuery.error.issues)
      }

      const query = parsedQuery.data
      const logs = await workspaceService.getLogs(
        workspaceId,
        request.user.sub,
        query.tailLines,
      )

      return reply
        .status(200)
        .type('text/plain; charset=utf-8')
        .send(logs)
    },
  )
}

export default workspacesRoutes
