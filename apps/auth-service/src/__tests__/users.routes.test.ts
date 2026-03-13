import { describe, it, expect, vi, beforeEach } from 'vitest'
import Fastify from 'fastify'
import { usersRoutes } from '../routes/users.js'
import { UserService } from '../services/user.service.js'
import { UnauthorizedError, NotFoundError } from '@devora/errors'

vi.mock('../services/user.service.js')
vi.mock('../middleware/authenticate.js', () => ({
  authenticate: vi.fn(async (request) => {
    request.user = { sub: 'u1', org: 'o1', roles: [] }
  })
}))

describe('User Routes', () => {
  let app: any

  beforeEach(async () => {
    app = Fastify()
    app.decorate('db', {}) // Mock db
    await app.register(usersRoutes, { prefix: '/orgs' })
  })

  it('GET /orgs/:orgId/users returns user list', async () => {
    const mockUsers = [{ id: 'u1', email: 'a@b.com' }]
    vi.mocked(UserService.prototype.listByOrg).mockResolvedValue(mockUsers as any)

    const response = await app.inject({
      method: 'GET',
      url: '/orgs/o1/users'
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual(mockUsers)
  })

  it('POST /orgs/:orgId/users/invite creates invitation', async () => {
    const invitedUser = { id: 'u2', email: 'b@c.com', status: 'invited' }
    vi.mocked(UserService.prototype.inviteUser).mockResolvedValue(invitedUser as any)

    const response = await app.inject({
      method: 'POST',
      url: '/orgs/o1/users/invite',
      payload: { email: 'b@c.com' }
    })

    expect(response.statusCode).toBe(201)
    expect(response.json()).toEqual(invitedUser)
  })

  it('GET /orgs/:orgId/users/:userId returns user profile', async () => {
    const mockUser = { id: 'u1', email: 'a@b.com' }
    vi.mocked(UserService.prototype.findById).mockResolvedValue(mockUser as any)

    const response = await app.inject({
      method: 'GET',
      url: '/orgs/o1/users/u1'
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual(mockUser)
  })

  it('PATCH /orgs/:orgId/users/:userId updates user', async () => {
    const updatedUser = { id: 'u1', displayName: 'New Name' }
    vi.mocked(UserService.prototype.update).mockResolvedValue(updatedUser as any)

    const response = await app.inject({
      method: 'PATCH',
      url: '/orgs/o1/users/u1',
      payload: { displayName: 'New Name' }
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual(updatedUser)
  })

  it('DELETE /orgs/:orgId/users/:userId removes user', async () => {
    vi.mocked(UserService.prototype.delete).mockResolvedValue({ id: 'u1' } as any)

    const response = await app.inject({
      method: 'DELETE',
      url: '/orgs/o1/users/u1'
    })

    expect(response.statusCode).toBe(204)
  })
})
