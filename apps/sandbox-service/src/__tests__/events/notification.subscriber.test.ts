/**
 * Tests for notification-service sandbox subscriber logic.
 * Directly imports the subscriber function and tests with a mock DB.
 */
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { schema, type Db } from '@devora/db'
import { registerSandboxSubscribers } from '../../../../notification-service/src/subscribers/sandbox.subscriber.js'

// ── Database setup ────────────────────────────────────────────────────────────

const NOTIFY_DB_URL = 'postgresql://devora:devora_dev@localhost:5437/devora_notify'

const { notifications } = schema

// ── Mock subscribe helper ─────────────────────────────────────────────────────
// We capture the subscriber callbacks without real NATS, invoking them directly.

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

// ── Initialize subscriber ─────────────────────────────────────────────────────

// Not using real NATS or DB in this test — we mock the subscribe function
// and use a real DB to verify notifications are inserted.

async function ensureNotifyDb(): Promise<void> {
  const adminPool = new Pool({
    connectionString: 'postgresql://devora:devora_dev@localhost:5437/postgres',
  })
  try {
    const res = await adminPool.query<{ datname: string }>(
      'SELECT datname FROM pg_database WHERE datname = $1',
      ['devora_notify'],
    )
    if ((res.rowCount ?? 0) === 0) {
      await adminPool.query('CREATE DATABASE "devora_notify"')
    }
  } finally {
    await adminPool.end()
  }
}

async function ensureNotificationsTable(): Promise<void> {
  await testPool.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL,
      org_id UUID NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT,
      action_url TEXT,
      source_type TEXT,
      source_id UUID,
      read_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `)
}

beforeAll(async () => {
  await ensureNotifyDb()
  testPool = new Pool({ connectionString: NOTIFY_DB_URL })
  await ensureNotificationsTable()
  db = drizzle(testPool, { schema }) as unknown as Db

  // Register subscribers (captures via mock subscribe)
  registerSandboxSubscribers({} as any, db, makeLogger())
})

afterAll(async () => {
  await testPool.end()
})

beforeEach(async () => {
  await testPool.query('TRUNCATE TABLE notifications RESTART IDENTITY CASCADE')
})

// ── SANDBOX_STOPPED events ────────────────────────────────────────────────────

describe('registerSandboxSubscribers (notification-service)', () => {
  describe('sandbox.stopped / reason=idle', () => {
    it('creates a sandbox_idle_stopped notification', async () => {
      await emit('sandbox.stopped', {
        workspaceId: WS_ID,
        userId: USER_ID,
        orgId: ORG_ID,
        reason: 'idle',
        stoppedAt: new Date().toISOString(),
      })

      const rows = await testPool.query('SELECT * FROM notifications WHERE source_id = $1', [WS_ID])
      expect(rows.rowCount).toBe(1)
      expect(rows.rows[0].type).toBe('sandbox_idle_stopped')
      expect(rows.rows[0].user_id).toBe(USER_ID)
    })
  })

  describe('sandbox.stopped / reason=error', () => {
    it('creates a sandbox_error notification', async () => {
      await emit('sandbox.stopped', {
        workspaceId: WS_ID,
        userId: USER_ID,
        orgId: ORG_ID,
        reason: 'error',
        stoppedAt: new Date().toISOString(),
      })

      const rows = await testPool.query('SELECT * FROM notifications WHERE source_id = $1', [WS_ID])
      expect(rows.rowCount).toBe(1)
      expect(rows.rows[0].type).toBe('sandbox_error')
    })
  })

  describe('sandbox.stopped / reason=manual', () => {
    it('does NOT create a notification', async () => {
      await emit('sandbox.stopped', {
        workspaceId: WS_ID,
        userId: USER_ID,
        orgId: ORG_ID,
        reason: 'manual',
        stoppedAt: new Date().toISOString(),
      })

      const rows = await testPool.query('SELECT * FROM notifications WHERE source_id = $1', [WS_ID])
      expect(rows.rowCount).toBe(0)
    })
  })

  describe('sandbox.stopped / reason=deleted', () => {
    it('does NOT create a notification', async () => {
      await emit('sandbox.stopped', {
        workspaceId: WS_ID,
        userId: USER_ID,
        orgId: ORG_ID,
        reason: 'deleted',
        stoppedAt: new Date().toISOString(),
      })

      const rows = await testPool.query('SELECT * FROM notifications WHERE source_id = $1', [WS_ID])
      expect(rows.rowCount).toBe(0)
    })
  })

  describe('sandbox.resource.spike', () => {
    it('creates a resource spike notification when CPU > 95%', async () => {
      await emit('sandbox.resource.spike', {
        workspaceId: WS_ID,
        userId: USER_ID,
        orgId: ORG_ID,
        cpu: 96,
        memory: 512,
        detectedAt: new Date().toISOString(),
      })

      const rows = await testPool.query('SELECT * FROM notifications WHERE source_id = $1', [WS_ID])
      expect(rows.rowCount).toBe(1)
      expect(rows.rows[0].type).toBe('sandbox_resource_spike')
    })

    it('does NOT create duplicate within 30 minutes', async () => {
      // Insert existing notification less than 30 min ago
      await testPool.query(
        'INSERT INTO notifications (user_id, org_id, type, title, source_id, source_type, created_at) VALUES ($1, $2, $3, $4, $5, $6, NOW())',
        [USER_ID, ORG_ID, 'sandbox_resource_spike', 'Recent spike', WS_ID, 'workspace'],
      )

      await emit('sandbox.resource.spike', {
        workspaceId: WS_ID,
        userId: USER_ID,
        orgId: ORG_ID,
        cpu: 97,
        memory: 512,
        detectedAt: new Date().toISOString(),
      })

      const rows = await testPool.query('SELECT * FROM notifications WHERE source_id = $1 AND type = $2', [WS_ID, 'sandbox_resource_spike'])
      expect(rows.rowCount).toBe(1) // No new notification added
    })
  })
})
