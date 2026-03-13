import { FastifyRequest, FastifyReply } from 'fastify'
import { ForbiddenError, UnauthorizedError } from '@devora/errors'
import { RbacService } from '../services/rbac.service.js'

export interface JwtPayload {
  sub:       string   // userId
  org:       string   // orgId
  roles:     string[] // roleId[]
  sessionId: string
}

export type RbacLike = Pick<RbacService, 'can'>

export async function authenticate(request: FastifyRequest, _reply: FastifyReply) {
  try {
    await request.jwtVerify()
    const payload = request.user as JwtPayload

    const sessionUserId = await request.server.redis.get(`session:${payload.sessionId}`)
    if (!sessionUserId || sessionUserId !== payload.sub) {
      throw new UnauthorizedError('Session expired')
    }

    // Prevent cross-organization access when route explicitly carries an orgId.
    const params = request.params as { orgId?: string } | undefined
    if (params?.orgId) {
      const { org } = payload
      if (org !== params.orgId) {
        throw new ForbiddenError('Token organization does not match request organization')
      }
    }
  } catch (error) {
    if (error instanceof ForbiddenError) {
      throw error
    }
    throw new UnauthorizedError()
  }
}

/**
 * Factory form makes this middleware easy to share across services and test.
 */
export function createRequirePermission(rbac: RbacLike) {
  return function requirePermission(permission: string, resourceIdParam?: string) {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      await authenticate(request, reply)

      const { sub: userId } = request.user as JwtPayload
      const resourceId = resourceIdParam
        ? (request.params as Record<string, string> | undefined)?.[resourceIdParam]
        : undefined
      const resourceType = permission.split(':')[0]

      const allowed = await rbac.can(userId, permission, resourceType, resourceId)
      if (!allowed) {
        throw new ForbiddenError()
      }
    }
  }
}

export function requirePermission(permission: string, resourceIdParam?: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const rbac = new RbacService(request.server.db)
    const guard = createRequirePermission(rbac)
    await guard(permission, resourceIdParam)(request, reply)
  }
}
