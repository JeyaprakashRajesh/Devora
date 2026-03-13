import { describe, it, expect, vi, beforeEach } from 'vitest'
import Fastify from 'fastify'
import { rolesRoutes } from '../routes/roles.js'
import { RbacService } from '../services/rbac.service.js'

vi.mock('../services/rbac.service.js')
vi.mock('../middleware/authenticate.js', () => ({
  authenticate: vi.fn(async (request) => {
    request.user = { sub: 'admin-1', org: 'o1', roles: [] }
  })
}))

describe('Role Routes', () => {
  let app: any

  beforeEach(async () => {
    app = Fastify()
    app.decorate('db', {}) // Mock db
    await app.register(rolesRoutes, { prefix: '/orgs' })
  })

  it('GET /orgs/:orgId/roles returns roles', async () => {
    const mockRoles = [{ id: 'r1', name: 'Admin' }]
    vi.mocked(RbacService.prototype.listRoles).mockResolvedValue(mockRoles as any)

    const response = await app.inject({
      method: 'GET',
      url: '/orgs/o1/roles'
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual(mockRoles)
  })

  it('POST /orgs/:orgId/roles creates a role', async () => {
    const newRole = { id: 'r2', name: 'Editor' }
    vi.mocked(RbacService.prototype.createRole).mockResolvedValue(newRole as any)

    const response = await app.inject({
      method: 'POST',
      url: '/orgs/o1/roles',
      payload: { name: 'Editor', scope: 'org', permissions: [] }
    })

    expect(response.statusCode).toBe(201)
    expect(response.json()).toEqual(newRole)
  })

  it('PUT /orgs/:orgId/roles/:roleId updates a role', async () => {
    const updatedRole = { id: 'r1', name: 'Updated Admin' }
    vi.mocked(RbacService.prototype.updateRole).mockResolvedValue(updatedRole as any)

    const response = await app.inject({
      method: 'PUT',
      url: '/orgs/o1/roles/r1',
      payload: { name: 'Updated Admin' }
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual(updatedRole)
  })

  it('DELETE /orgs/:orgId/roles/:roleId deletes a role', async () => {
    vi.mocked(RbacService.prototype.deleteRole).mockResolvedValue({ id: 'r1' } as any)

    const response = await app.inject({
      method: 'DELETE',
      url: '/orgs/o1/roles/r1'
    })

    expect(response.statusCode).toBe(204)
  })

  it('POST /orgs/:orgId/users/:userId/roles assigns a role', async () => {
    vi.mocked(RbacService.prototype.assignRole).mockResolvedValue(undefined as any)

    const response = await app.inject({
      method: 'POST',
      url: '/orgs/o1/users/u1/roles',
      payload: { roleId: 'r1' }
    })

    expect(response.statusCode).toBe(201)
    expect(response.json()).toEqual(expect.objectContaining({ userId: 'u1', roleId: 'r1' }))
  })
})
