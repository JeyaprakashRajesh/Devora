import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq, and } from 'drizzle-orm'
import { schema } from '@devora/db'
import { Subjects } from '@devora/nats'
import { getTestDb, closeTestDb, truncateNotifications } from '../helpers.js'
import { registerSandboxSubscribers } from '../../subscribers/sandbox.subscriber.js'

const { notifications } = schema

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
  await truncateNotifications()
})

describe('notification-service sandbox subscribers', () => {
  it('creates sandbox_idle_stopped notification for idle stop reason', async () => {
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
      .from(notifications)
      .where(and(eq(notifications.sourceId, WS_ID), eq(notifications.type, 'sandbox_idle_stopped')))

    expect(rows.length).toBe(1)
  })

  it('creates sandbox_error notification for error stop reason', async () => {
    await emit(Subjects.SANDBOX_STOPPED, {
      workspaceId: WS_ID,
      userId: USER_ID,
      orgId: ORG_ID,
      reason: 'error',
      stoppedAt: new Date().toISOString(),
    })

    const db = getTestDb()
    const rows = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.sourceId, WS_ID), eq(notifications.type, 'sandbox_error')))

    expect(rows.length).toBe(1)
  })

  it('does not create notification for manual stop reason', async () => {
    await emit(Subjects.SANDBOX_STOPPED, {
      workspaceId: WS_ID,
      userId: USER_ID,
      orgId: ORG_ID,
      reason: 'manual',
      stoppedAt: new Date().toISOString(),
    })

    const db = getTestDb()
    const rows = await db.select().from(notifications)
    expect(rows.length).toBe(0)
  })

  it('creates resource spike notification when CPU > 95', async () => {
    await emit(Subjects.SANDBOX_RESOURCE_SPIKE, {
      workspaceId: WS_ID,
      userId: USER_ID,
      orgId: ORG_ID,
      cpu: 97,
      memory: 0,
      detectedAt: new Date().toISOString(),
    })

    const db = getTestDb()
    const rows = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.sourceId, WS_ID), eq(notifications.type, 'sandbox_resource_spike')))

    expect(rows.length).toBe(1)
  })

  it('does not create duplicate resource spike notification within 30 minutes', async () => {
    await emit(Subjects.SANDBOX_RESOURCE_SPIKE, {
      workspaceId: WS_ID,
      userId: USER_ID,
      orgId: ORG_ID,
      cpu: 99,
      memory: 0,
      detectedAt: new Date().toISOString(),
    })

    await emit(Subjects.SANDBOX_RESOURCE_SPIKE, {
      workspaceId: WS_ID,
      userId: USER_ID,
      orgId: ORG_ID,
      cpu: 99,
      memory: 0,
      detectedAt: new Date().toISOString(),
    })

    const db = getTestDb()
    const rows = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.sourceId, WS_ID), eq(notifications.type, 'sandbox_resource_spike')))

    expect(rows.length).toBe(1)
  })
})
