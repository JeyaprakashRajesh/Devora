/**
 * Tests for monitor-service sandbox subscriber logic.
 * Captures subscribe() handlers and invokes them directly.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { schema, type Db } from '@devora/db'
import { registerSandboxSubscribers } from '../../../../monitor-service/src/subscribers/sandbox.subscriber.js'

// ── Database setup ────────────────────────────────────────────────────────────

const MONITOR_DB_URL = 'postgresql://devora:devora_dev@localhost:5438/devora_monitor'

const { sandboxActivities } = schema

// ── Mock subscribe helper ─────────────────────────────────────────────────────

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
  if (!handler) {
    throw new Error(`No handler registered for subject: ${subject}`)
  }
  await handler(event)
}

// ── Constants ─────────────────────────────────────────────────────────────────

const WS_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const USER_ID = '11111111-1111-1111-1111-111111111111'
const ORG_ID = '22222222-2222-2222-2222-222222222222'

function makeLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as any
}

let db: Db
let testPool: Pool

async function ensureMonitorDb(): Promise<void> {
  const adminPool = new Pool({
    connectionString: 'postgresql://devora:devora_dev@localhost:5438/postgres',
  })
  try {
    const res = await adminPool.query<{ datname: string }>(
      'SELECT datname FROM pg_database WHERE datname = $1',
      ['devora_monitor'],
    )
    if ((res.rowCount ?? 0) === 0) {
      await adminPool.query('CREATE DATABASE "devora_monitor"')
    }
  } finally {
    await adminPool.end()
  }
}

async function ensureSandboxActivitiesTable(): Promise<void> {
  await testPool.query(`
    CREATE TABLE IF NOT EXISTS sandbox_activities (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL,
      user_id UUID NOT NULL,
      org_id UUID NOT NULL,
      event_type TEXT NOT NULL,
      metadata JSONB NOT NULL DEFAULT '{}',
      recorded_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `)
}

beforeAll(async () => {
  await ensureMonitorDb()
  testPool = new Pool({ connectionString: MONITOR_DB_URL })
  await ensureSandboxActivitiesTable()
  db = drizzle(testPool, { schema }) as Db

  registerSandboxSubscribers({} as any, db, makeLogger())
})

afterAll(async () => {
  await testPool.end()
})

beforeEach(async () => {
  await testPool.query('TRUNCATE TABLE sandbox_activities RESTART IDENTITY CASCADE')
})

describe('registerSandboxSubscribers (monitor-service)', () => {
  it('records sandbox.created activity', async () => {
    const createdAt = new Date().toISOString()
    await emit('sandbox.created', {
      workspaceId: WS_ID,
      userId: USER_ID,
      orgId: ORG_ID,
      projectId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      podName: 'ws-pod',
      createdAt,
    })

    const rows = await testPool.query(
      'SELECT * FROM sandbox_activities WHERE workspace_id = $1 AND event_type = $2',
      [WS_ID, 'created'],
    )
    expect(rows.rowCount).toBe(1)
    expect(rows.rows[0].user_id).toBe(USER_ID)
  })

  it('records sandbox.started activity', async () => {
    const startedAt = new Date().toISOString()
    await emit('sandbox.started', {
      workspaceId: WS_ID,
      userId: USER_ID,
      orgId: ORG_ID,
      podName: 'ws-pod',
      startedAt,
    })

    const rows = await testPool.query(
      'SELECT * FROM sandbox_activities WHERE workspace_id = $1 AND event_type = $2',
      [WS_ID, 'started'],
    )
    expect(rows.rowCount).toBe(1)
  })

  it('records sandbox.stopped with durationMinutes when started event exists', async () => {
    const startedAt = new Date(Date.now() - 5 * 60 * 1000).toISOString() // 5 min ago
    const stoppedAt = new Date().toISOString()

    await emit('sandbox.started', {
      workspaceId: WS_ID,
      userId: USER_ID,
      orgId: ORG_ID,
      podName: 'ws-pod',
      startedAt,
    })

    await emit('sandbox.stopped', {
      workspaceId: WS_ID,
      userId: USER_ID,
      orgId: ORG_ID,
      reason: 'manual',
      stoppedAt,
    })

    const rows = await testPool.query(
      'SELECT * FROM sandbox_activities WHERE workspace_id = $1 AND event_type = $2 ORDER BY recorded_at DESC LIMIT 1',
      [WS_ID, 'stopped'],
    )
    expect(rows.rowCount).toBe(1)
    expect(rows.rows[0].metadata).toHaveProperty('reason', 'manual')
    expect(rows.rows[0].metadata).toHaveProperty('durationMinutes')
    expect(Number(rows.rows[0].metadata.durationMinutes)).toBeGreaterThan(0)
  })

  it('records sandbox.stopped without durationMinutes when no prior started event', async () => {
    const stoppedAt = new Date().toISOString()

    await emit('sandbox.stopped', {
      workspaceId: WS_ID,
      userId: USER_ID,
      orgId: ORG_ID,
      reason: 'idle',
      stoppedAt,
    })

    const rows = await testPool.query(
      'SELECT * FROM sandbox_activities WHERE workspace_id = $1 AND event_type = $2 ORDER BY recorded_at DESC LIMIT 1',
      [WS_ID, 'stopped'],
    )
    expect(rows.rowCount).toBe(1)
    expect(rows.rows[0].metadata).toHaveProperty('reason', 'idle')
    expect(rows.rows[0].metadata.durationMinutes).toBeUndefined()
  })

  it('records sandbox.resource.spike activity with cpu and memory metadata', async () => {
    const detectedAt = new Date().toISOString()
    await emit('sandbox.resource.spike', {
      workspaceId: WS_ID,
      userId: USER_ID,
      orgId: ORG_ID,
      cpu: 97.12,
      memory: 1500.45,
      detectedAt,
    })

    const rows = await testPool.query(
      'SELECT * FROM sandbox_activities WHERE workspace_id = $1 AND event_type = $2',
      [WS_ID, 'resource_spike'],
    )
    expect(rows.rowCount).toBe(1)
    expect(rows.rows[0].metadata).toHaveProperty('cpu', 97.12)
    expect(rows.rows[0].metadata).toHaveProperty('memory', 1500.45)
  })
})
