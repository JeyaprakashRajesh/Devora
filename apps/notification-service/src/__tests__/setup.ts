import fs from 'node:fs/promises'
import path from 'node:path'
import { Pool } from 'pg'

const ADMIN_URL = process.env.NOTIFY_ADMIN_URL ?? 'postgresql://devora:devora_dev@localhost:5437/postgres'
const TEST_DB_NAME = process.env.NOTIFY_TEST_DB_NAME ?? 'devora_notify_test'
const TEST_DB_URL = process.env.NOTIFY_TEST_URL ?? `postgresql://devora:devora_dev@localhost:5437/${TEST_DB_NAME}`

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
  } finally {
    await pool.end()
  }
}

export default async function globalSetup() {
  await ensureDatabase(ADMIN_URL, TEST_DB_NAME)
  await runMigrations(TEST_DB_URL)
}
