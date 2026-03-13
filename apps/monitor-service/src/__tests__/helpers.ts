import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { schema, type Db } from '@devora/db'

export const MONITOR_TEST_URL =
  process.env.MONITOR_TEST_URL
  ?? 'postgresql://devora:devora_dev@localhost:5438/devora_monitor_test'

let _pool: Pool | null = null
let _db: Db | null = null

export function getTestDb(): Db {
  if (!_db) {
    _pool = new Pool({ connectionString: MONITOR_TEST_URL })
    _db = drizzle(_pool, { schema }) as Db
  }
  return _db
}

export async function closeTestDb(): Promise<void> {
  if (_pool) {
    await _pool.end()
    _pool = null
    _db = null
  }
}

export async function truncateSandboxActivities(): Promise<void> {
  const pool = new Pool({ connectionString: MONITOR_TEST_URL })
  try {
    await pool.query('TRUNCATE TABLE sandbox_activities RESTART IDENTITY CASCADE')
  } finally {
    await pool.end()
  }
}
