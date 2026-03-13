import { FastifyInstance } from 'fastify'
import { authenticate, requirePermission } from '../middleware/authenticate.js'
import { RbacService } from '../services/rbac.service.js'
import type { JwtPayload } from '../middleware/authenticate.js'

export async function rolesRoutes(app: FastifyInstance) {
  const rbacService = new RbacService(app.db)

  // GET /orgs/:orgId/roles
  app.get('/:orgId/roles', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { orgId } = request.params as { orgId: string }
    const rolesList = await rbacService.listRoles(orgId)
    return reply.send(rolesList)
  })

  // POST /orgs/:orgId/roles — create custom role
  app.post('/:orgId/roles', {
    preHandler: [authenticate, requirePermission('org:manage')],
  }, async (request, reply) => {
    const { orgId } = request.params as { orgId: string }
    const { name, scope, permissions } = request.body as { name: string; scope: string; permissions: string[] }
    const role = await rbacService.createRole(orgId, name, scope, permissions)
    return reply.code(201).send(role)
  })

  // PUT /orgs/:orgId/roles/:roleId — update custom role
  app.put('/:orgId/roles/:roleId', {
    preHandler: [authenticate, requirePermission('org:manage')],
  }, async (request, reply) => {
    const { orgId, roleId } = request.params as { orgId: string; roleId: string }
    const { name, permissions } = request.body as { name?: string; permissions?: string[] }
    const role = await rbacService.updateRole(orgId, roleId, { name, permissions })
    return reply.send(role)
  })

  // DELETE /orgs/:orgId/roles/:roleId — delete custom role
  app.delete('/:orgId/roles/:roleId', {
    preHandler: [authenticate, requirePermission('org:manage')],
  }, async (request, reply) => {
    const { orgId, roleId } = request.params as { orgId: string; roleId: string }
    await rbacService.deleteRole(orgId, roleId)
    return reply.code(204).send()
  })

  // POST /orgs/:orgId/users/:userId/roles — assign role
  app.post('/:orgId/users/:userId/roles', {
    preHandler: [authenticate, requirePermission('role:assign')],
  }, async (request, reply) => {
    const { userId } = request.params as { orgId: string; userId: string }
    const { roleId, resourceType, resourceId, expiresAt } = request.body as any
    const actor = request.user as JwtPayload
    await rbacService.assignRole({
      userId,
      roleId,
      resourceType,
      resourceId,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
      grantedBy: actor.sub,
    }, app.nc)
    return reply.code(201).send({ userId, roleId, resourceType, resourceId })
  })

  // DELETE /orgs/:orgId/users/:userId/roles/:roleId — revoke role
  app.delete('/:orgId/users/:userId/roles/:roleId', {
    preHandler: [authenticate, requirePermission('role:assign')],
  }, async (request, reply) => {
    const { userId, roleId } = request.params as { orgId: string; userId: string; roleId: string }
    const { resourceId } = (request.query ?? {}) as { resourceId?: string }
    await rbacService.revokeRole(userId, roleId, resourceId)
    return reply.code(204).send()
  })
}
