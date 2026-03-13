import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { schema } from '@devora/db'
import { Subjects } from '@devora/nats'
import { getTestDb, closeTestDb, truncateSandboxActivities } from '../helpers.js'
import { registerSandboxSubscribers } from '../../subscribers/sandbox.subscriber.js'

const { sandboxActivities } = schema

type EventHandler = (event: Record<string, unknown>) => Promise<void>
const handlers = new Map<string, EventHandler>()

vi.mock('@devora/nats', async (importOriginal) => {
  const original = await importOriginal<typeof import('@devora/nats')>()
  return {
    ...original,
    subscribe: vi.fn((nc: unknown, subject: string, handler: EventHandler) => {
      handlers.set(subject, handler)
    }),
  }
})

async function emit(subject: string, event: Record<string, unknown>): Promise<void> {
  const handler = handlers.get(subject)
  if (!handler) throw new Error(`No handler for ${subject}`)
  await handler(event)
}

const WS_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const USER_ID = '11111111-1111-1111-1111-111111111111'
const ORG_ID = '22222222-2222-2222-2222-222222222222'

beforeAll(async () => {
  const db = getTestDb()
  registerSandboxSubscribers({} as any, db, { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as any)
})

afterAll(async () => {
  await closeTestDb()
})

beforeEach(async () => {
  await truncateSandboxActivities()
})

describe('monitor-service sandbox subscribers', () => {
  it('creates sandbox activity for created events', async () => {
    await emit(Subjects.SANDBOX_CREATED, {
      workspaceId: WS_ID,
      userId: USER_ID,
      orgId: ORG_ID,
      projectId: null,
      podName: 'ws-pod',
      createdAt: new Date().toISOString(),
    })

    const db = getTestDb()
    const rows = await db
      .select()
      .from(sandboxActivities)
      .where(and(eq(sandboxActivities.workspaceId, WS_ID), eq(sandboxActivities.eventType, 'created')))

    expect(rows.length).toBe(1)
  })

  it('creates sandbox activity for started events', async () => {
    await emit(Subjects.SANDBOX_STARTED, {
      workspaceId: WS_ID,
      userId: USER_ID,
      orgId: ORG_ID,
      podName: 'ws-pod',
      startedAt: new Date().toISOString(),
    })

    const db = getTestDb()
    const rows = await db
      .select()
      .from(sandboxActivities)
      .where(and(eq(sandboxActivities.workspaceId, WS_ID), eq(sandboxActivities.eventType, 'started')))

    expect(rows.length).toBe(1)
  })

  it('records stopped event with durationMinutes when start exists', async () => {
    const startedAt = new Date(Date.now() - 4 * 60 * 1000).toISOString()
    const stoppedAt = new Date().toISOString()

    await emit(Subjects.SANDBOX_STARTED, {
      workspaceId: WS_ID,
      userId: USER_ID,
      orgId: ORG_ID,
      podName: 'ws-pod',
      startedAt,
    })

    await emit(Subjects.SANDBOX_STOPPED, {
      workspaceId: WS_ID,
      userId: USER_ID,
      orgId: ORG_ID,
      reason: 'manual',
      stoppedAt,
    })

    const db = getTestDb()
    const rows = await db
      .select()
      .from(sandboxActivities)
      .where(and(eq(sandboxActivities.workspaceId, WS_ID), eq(sandboxActivities.eventType, 'stopped')))

    expect(rows.length).toBe(1)
    expect(rows[0].metadata).toHaveProperty('reason', 'manual')
    expect((rows[0].metadata as Record<string, unknown>).durationMinutes).toBeDefined()
  })

  it('records stopped event without durationMinutes when no start exists', async () => {
    await emit(Subjects.SANDBOX_STOPPED, {
      workspaceId: WS_ID,
      userId: USER_ID,
      orgId: ORG_ID,
      reason: 'idle',
      stoppedAt: new Date().toISOString(),
    })

    const db = getTestDb()
    const rows = await db
      .select()
      .from(sandboxActivities)
      .where(and(eq(sandboxActivities.workspaceId, WS_ID), eq(sandboxActivities.eventType, 'stopped')))

    expect(rows.length).toBe(1)
    expect(rows[0].metadata).toHaveProperty('reason', 'idle')
    expect((rows[0].metadata as Record<string, unknown>).durationMinutes).toBeUndefined()
  })

  it('creates sandbox activity for resource spike events', async () => {
    await emit(Subjects.SANDBOX_RESOURCE_SPIKE, {
      workspaceId: WS_ID,
      userId: USER_ID,
      orgId: ORG_ID,
      cpu: 96.5,
      memory: 1234,
      detectedAt: new Date().toISOString(),
    })

    const db = getTestDb()
    const rows = await db
      .select()
      .from(sandboxActivities)
      .where(and(eq(sandboxActivities.workspaceId, WS_ID), eq(sandboxActivities.eventType, 'resource_spike')))

    expect(rows.length).toBe(1)
    expect(rows[0].metadata).toHaveProperty('cpu', 96.5)
    expect(rows[0].metadata).toHaveProperty('memory', 1234)
  })
})
