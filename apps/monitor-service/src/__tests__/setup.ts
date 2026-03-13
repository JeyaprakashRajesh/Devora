import fs from 'node:fs/promises'
import path from 'node:path'
import { Pool } from 'pg'

const ADMIN_URL = process.env.MONITOR_ADMIN_URL ?? 'postgresql://devora:devora_dev@localhost:5438/postgres'
const TEST_DB_NAME = process.env.MONITOR_TEST_DB_NAME ?? 'devora_monitor_test'
const TEST_DB_URL = process.env.MONITOR_TEST_URL ?? `postgresql://devora:devora_dev@localhost:5438/${TEST_DB_NAME}`

const migrationPath = path.resolve(process.cwd(), 'packages/db/src/migrations/0000_medical_namora.sql')

async function ensureDatabase(adminUrl: string, dbName: string) {
  const pool = new Pool({ connectionString: adminUrl })
  try {
    const res = await pool.query<{ datname: string }>(
      'SELECT datname FROM pg_database WHERE datname = $1',
      [dbName],
    )
    if ((res.rowCount ?? 0) === 0) {
      await pool.query(`CREATE DATABASE "${dbName}"`)
    }
  } finally {
    await pool.end()
  }
}

async function runMigrations(databaseUrl: string) {
  const pool = new Pool({ connectionString: databaseUrl })
  try {
    const sql = await fs.readFile(migrationPath, 'utf8')
    const statements = sql
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter(Boolean)

    for (const statement of statements) {
      await pool.query(statement)
    }

    // `sandbox_activities` is used by monitor subscribers but is not present in the base migration yet.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sandbox_activities (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        user_id uuid NOT NULL,
        org_id uuid NOT NULL,
        event_type text NOT NULL,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        recorded_at timestamp NOT NULL DEFAULT now()
      )
    `)
  } finally {
    await pool.end()
  }
}

export default async function globalSetup() {
  await ensureDatabase(ADMIN_URL, TEST_DB_NAME)
  await runMigrations(TEST_DB_URL)
}
