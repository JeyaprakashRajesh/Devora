import { describe, it, expect, vi } from 'vitest'
import { UserService } from '../services/user.service.js'
import { NotFoundError } from '@devora/errors'

function makeMockDb(overrides: any = {}) {
  const chain: any = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    // For single results
    then: (resolve: any) => resolve(overrides.selectResult ?? overrides.returningResult ?? []),
  }
  // If we want specific calls to return specific things, we can override the chain
  chain.where.mockReturnValue(chain)
  chain.returning.mockResolvedValue(overrides.returningResult ?? [])
  // For findById, it uses select().from().where(), so where should resolve to selectResult
  if (overrides.selectResult) {
    chain.where.mockResolvedValue(overrides.selectResult)
  }
  return chain
}

describe('UserService', () => {
  it('findById returns user when found', async () => {
    const user = { id: 'u1', email: 'a@b.com', passwordHash: 'hash' }
    const db = makeMockDb({ selectResult: [user] })
    const svc = new UserService(db)
    const result = await svc.findById('u1')
    expect(result.id).toBe('u1')
    expect((result as any).passwordHash).toBeUndefined()
  })

  it('findById throws NotFoundError when not found', async () => {
    const db = makeMockDb({ selectResult: [] })
    const svc = new UserService(db)
    await expect(svc.findById('u2')).rejects.toThrow(NotFoundError)
  })

  it('inviteUser creates a new user if not exists', async () => {
    const db = makeMockDb({ 
      selectResult: [], // findByEmail
      returningResult: [{ id: 'u1', email: 'a@b.com' }] 
    })
    const svc = new UserService(db)
    const result = await svc.inviteUser('o1', 'a@b.com')
    expect(result.email).toBe('a@b.com')
    expect(db.insert).toHaveBeenCalled()
  })

  it('delete removes user from org', async () => {
    const db = makeMockDb({ returningResult: [{ id: 'u1' }] })
    const svc = new UserService(db)
    const result = await svc.delete('u1', 'o1')
    expect(result.id).toBe('u1')
    expect(db.delete).toHaveBeenCalled()
  })
})
