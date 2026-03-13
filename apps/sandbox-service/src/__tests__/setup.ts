/**
 * Global test setup for sandbox-service.
 * Runs once before all test files.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { Pool } from 'pg'

const SANDBOX_ADMIN_URL = 'postgresql://devora:devora_dev@localhost:5436/postgres'
const SANDBOX_TEST_DB = 'devora_sandbox_test'
export const SANDBOX_TEST_URL = `postgresql://devora:devora_dev@localhost:5436/${SANDBOX_TEST_DB}`

const migrationPath = path.resolve(
  process.cwd(),
  'packages/db/src/migrations/0000_medical_namora.sql',
)

async function ensureDatabase(adminUrl: string, dbName: string): Promise<void> {
  const pool = new Pool({ connectionString: adminUrl })
  try {
    const result = await pool.query<{ datname: string }>(
      'SELECT datname FROM pg_database WHERE datname = $1',
      [dbName],
    )
    if ((result.rowCount ?? 0) === 0) {
      await pool.query(`CREATE DATABASE "${dbName}"`)
    }
  } finally {
    await pool.end()
  }
}

async function runMigrations(testUrl: string): Promise<void> {
  const pool = new Pool({ connectionString: testUrl })
  try {
    const sql = await fs.readFile(migrationPath, 'utf8')
    const statements = sql
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter(Boolean)
    for (const statement of statements) {
      await pool.query(statement)
    }
  } finally {
    await pool.end()
  }
}

export async function setup(): Promise<void> {
  await ensureDatabase(SANDBOX_ADMIN_URL, SANDBOX_TEST_DB)
  await runMigrations(SANDBOX_TEST_URL)
}

export async function teardown(): Promise<void> {
  // Schema is kept for re-runs; only data is truncated per test
}
