import type { IncomingMessage } from 'node:http'
import type { Socket } from 'node:net'
import type { FastifyPluginAsync } from 'fastify'
import httpProxy from 'http-proxy'
import { ValidationError } from '@devora/errors'
import { z } from 'zod'
import type { JwtPayload } from '@devora/types'
import { WorkspaceNotFoundError, WorkspaceOwnershipError } from '../errors.js'
import type { PodService } from '../services/pod.service.js'
import type { WorkspaceService } from '../services/workspace.service.js'
import authenticate from '../middleware/authenticate.js'

interface ProxyRoutesOptions {
  workspaceService: WorkspaceService
  podService: PodService
}

const workspaceIdSchema = z.string().uuid()

function parseWorkspaceId(value: string): string {
  const result = workspaceIdSchema.safeParse(value)
  if (!result.success) {
    throw new ValidationError('Invalid workspace ID')
  }
  return result.data
}

function getBearerToken(authHeader?: string): string | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null
  }
  return authHeader.slice('Bearer '.length).trim()
}

function sendUpgradeError(socket: Socket, statusCode: number, body: string): void {
  if (socket.destroyed) {
    return
  }

  socket.write(
    `HTTP/1.1 ${statusCode} Error\r\n`
    + 'Connection: close\r\n'
    + 'Content-Type: application/json\r\n'
    + `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n`
    + body,
  )
  socket.destroy()
}

function extractWorkspaceIdFromUrl(url?: string): string | null {
  if (!url) {
    return null
  }

  const pathname = new URL(url, 'http://localhost').pathname
  const match = pathname.match(/^\/workspaces\/([^/]+)\/connect$/)
  return match?.[1] ?? null
}

const proxyRoutes: FastifyPluginAsync<ProxyRoutesOptions> = async (
  app,
  { workspaceService, podService },
) => {
  const proxy = httpProxy.createProxyServer({ ws: true })

  proxy.on('error', (error, request, response) => {
    app.log.error({ error }, 'Workspace proxy error')

    const maybeSocket = response as Socket | undefined
    if (maybeSocket && typeof maybeSocket.destroy === 'function') {
      if (!maybeSocket.destroyed) {
        maybeSocket.destroy()
      }
      return
    }

    const maybeResponse = response as { headersSent?: boolean; writeHead?: Function; end?: Function } | undefined
    if (maybeResponse && !maybeResponse.headersSent && maybeResponse.writeHead && maybeResponse.end) {
      maybeResponse.writeHead(502, { 'Content-Type': 'application/json' })
      maybeResponse.end(JSON.stringify({ code: 'GEN_002', message: 'Sandbox proxy error' }))
    }

    const maybeRequest = request as IncomingMessage | undefined
    if (maybeRequest?.socket && !maybeRequest.socket.destroyed) {
      maybeRequest.socket.destroy()
    }
  })

  app.get<{ Params: { workspaceId: string } }>(
    '/workspaces/:workspaceId/connect',
    { preHandler: authenticate },
    async (request, reply) => {
      const workspaceId = parseWorkspaceId(request.params.workspaceId)
      const status = await workspaceService.getStatus(workspaceId, request.user.sub)
      if (status.status !== 'running') {
        return reply.status(409).send({
          code: 'SANDBOX_NOT_READY',
          message: 'Workspace is not running',
        })
      }

      const pod = await podService.get(workspaceId)
      const podIp = pod?.status?.podIP
      if (!podIp) {
        return reply.status(503).send({
          code: 'SANDBOX_NO_IP',
          message: 'Workspace pod has no IP yet',
        })
      }

      const target = `http://${podIp}:8080`
      reply.hijack()
      proxy.web(request.raw, reply.raw, { target })
    },
  )

  const upgradeHandler = async (
    request: IncomingMessage,
    socket: Socket,
    head: Buffer,
  ) => {
    const workspaceIdParam = extractWorkspaceIdFromUrl(request.url)
    if (!workspaceIdParam) {
      return
    }

    try {
      const workspaceId = parseWorkspaceId(workspaceIdParam)
      const token = getBearerToken(request.headers.authorization)
      if (!token) {
        sendUpgradeError(
          socket,
          401,
          JSON.stringify({ code: 'AUTH_001', message: 'Unauthorized' }),
        )
        return
      }

      const payload = await app.jwt.verify<JwtPayload>(token)
      const status = await workspaceService.getStatus(workspaceId, payload.sub)
      if (status.status !== 'running') {
        sendUpgradeError(
          socket,
          409,
          JSON.stringify({
            code: 'SANDBOX_NOT_READY',
            message: 'Workspace is not running',
          }),
        )
        return
      }

      const pod = await podService.get(workspaceId)
      const podIp = pod?.status?.podIP
      if (!podIp) {
        sendUpgradeError(
          socket,
          503,
          JSON.stringify({
            code: 'SANDBOX_NO_IP',
            message: 'Workspace pod has no IP yet',
          }),
        )
        return
      }

      const target = `http://${podIp}:8080`
      proxy.ws(request, socket, head, { target })
    } catch (error) {
      if (error instanceof ValidationError) {
        sendUpgradeError(
          socket,
          400,
          JSON.stringify({ code: 'GEN_001', message: error.message }),
        )
        return
      }

      if (error instanceof WorkspaceNotFoundError) {
        sendUpgradeError(
          socket,
          404,
          JSON.stringify({ code: error.code, message: error.message }),
        )
        return
      }

      if (error instanceof WorkspaceOwnershipError) {
        sendUpgradeError(
          socket,
          403,
          JSON.stringify({ code: error.code, message: error.message }),
        )
        return
      }

      app.log.error({ error }, 'Workspace upgrade proxy failed')
      sendUpgradeError(
        socket,
        502,
        JSON.stringify({ code: 'GEN_002', message: 'Sandbox proxy error' }),
      )
    }
  }

  const onUpgrade = (request: IncomingMessage, socket: Socket, head: Buffer) => {
    void upgradeHandler(request, socket, head)
  }

  app.server.on('upgrade', onUpgrade)

  app.addHook('onClose', async () => {
    app.server.removeListener('upgrade', onUpgrade)
    proxy.close()
  })
}

export default proxyRoutes
