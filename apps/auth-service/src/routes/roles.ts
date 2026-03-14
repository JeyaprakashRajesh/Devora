import { FastifyInstance } from 'fastify'
import { eq, and, or, isNull } from 'drizzle-orm'
import { schema } from '@devora/db'
import { authenticate } from '../middleware/authenticate.js'
import { RbacService } from '../services/rbac.service.js'
import type { JwtPayload } from '../middleware/authenticate.js'

const { roles: rolesTable } = schema

export async function rolesRoutes(app: FastifyInstance) {
  // GET /orgs/:orgId/roles
  app.get('/:orgId/roles', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { orgId } = request.params as { orgId: string }
    const rolesList = await app.db
      .select()
      .from(rolesTable)
      .where(or(eq(rolesTable.orgId, orgId), isNull(rolesTable.orgId)))
    return reply.send(rolesList)
  })

  // POST /orgs/:orgId/roles — create custom role
  app.post('/:orgId/roles', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { orgId } = request.params as { orgId: string }
    const { name, scope, permissions } = request.body as { name: string; scope: string; permissions: string[] }
    // TODO: insert into DB (Task 1-05)
    return reply.code(201).send({ orgId, name, scope, permissions, isSystem: false })
  })

  // POST /orgs/:orgId/users/:userId/roles — assign role
  app.post('/:orgId/users/:userId/roles', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { orgId, userId } = request.params as { orgId: string; userId: string }
    const { roleId, resourceType, resourceId } = request.body as any
    const actor = request.user as JwtPayload
    const rbacService = new RbacService(app.db)
    await rbacService.assignRole({
      userId,
      roleId,
      resourceType,
      resourceId,
      grantedBy: actor.sub,
    })
    return reply.code(201).send({ userId, orgId, roleId, resourceType, resourceId })
  })

  // DELETE /orgs/:orgId/users/:userId/roles/:roleId — revoke role
  app.delete('/:orgId/users/:userId/roles/:roleId', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { userId, roleId } = request.params as { orgId: string; userId: string; roleId: string }
    const { resourceId } = (request.query ?? {}) as { resourceId?: string }
    const rbacService = new RbacService(app.db)
    await rbacService.revokeRole(userId, roleId, resourceId)
    return reply.code(204).send()
  })
}
