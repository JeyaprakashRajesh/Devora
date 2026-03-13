import type { FastifyRequest } from 'fastify'
import { UnauthorizedError } from '@devora/errors'
import type { JwtPayload } from '@devora/types'
import { WorkspaceOwnershipError } from '../errors.js'

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtPayload
    user: JwtPayload
  }
}

export default async function authenticate(request: FastifyRequest): Promise<void> {
  const authHeader = request.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new UnauthorizedError('Unauthorized')
  }

  try {
    await request.jwtVerify<JwtPayload>()
  } catch {
    throw new UnauthorizedError('Unauthorized')
  }
}

export async function requireOwnership(
  request: FastifyRequest,
  workspaceUserId: string,
): Promise<void> {
  if ((request.user as JwtPayload).sub !== workspaceUserId) {
    throw new WorkspaceOwnershipError()
  }
}
