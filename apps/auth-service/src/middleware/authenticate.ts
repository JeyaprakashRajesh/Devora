import { FastifyRequest, FastifyReply } from 'fastify'
import { UnauthorizedError } from '@devora/errors'

export interface JwtPayload {
  sub:       string   // userId
  org:       string   // orgId
  roles:     string[] // roleId[]
  sessionId: string
}

export async function authenticate(request: FastifyRequest, _reply: FastifyReply) {
  try {
    await request.jwtVerify()
  } catch {
    throw new UnauthorizedError()
  }
}
