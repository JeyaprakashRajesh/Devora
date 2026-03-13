import fs from 'node:fs/promises'
import path from 'node:path'
import { config as loadDotEnv } from 'dotenv'
import { Pool } from 'pg'
import Redis from 'ioredis'

loadDotEnv({ path: path.resolve(process.cwd(), '.env.test') })

const databaseUrlEnv = process.env.DATABASE_URL
const redisUrlEnv = process.env.REDIS_URL

if (!databaseUrlEnv) {
  throw new Error('DATABASE_URL is required for tests')
}

if (!redisUrlEnv) {
  throw new Error('REDIS_URL is required for tests')
}

const databaseUrl: string = databaseUrlEnv
const redisUrl: string = redisUrlEnv

const pool = new Pool({ connectionString: databaseUrl })
const redis = new Redis(redisUrl)

const migrationPath = path.resolve(process.cwd(), '../../packages/db/src/migrations/0000_medical_namora.sql')

async function ensureTestDatabaseExists(): Promise<void> {
  const dbUrl = new URL(databaseUrl)
  const dbName = dbUrl.pathname.replace('/', '')

  const adminUrl = new URL(databaseUrl)
  adminUrl.pathname = '/postgres'

  const adminPool = new Pool({ connectionString: adminUrl.toString() })

  const existing = await adminPool.query<{ datname: string }>(
    'SELECT datname FROM pg_database WHERE datname = $1',
    [dbName],
  )

  if (existing.rowCount === 0) {
    await adminPool.query(`CREATE DATABASE "${dbName}"`)
  }

  await adminPool.end()
}

async function runMigrations(): Promise<void> {
  const sql = await fs.readFile(migrationPath, 'utf8')
  const statements = sql
    .split('--> statement-breakpoint')
    .map((chunk) => chunk.trim())
    .filter(Boolean)

  for (const statement of statements) {
    await pool.query(statement)
  }
}

async function dropAllTables(): Promise<void> {
  const result = await pool.query<{ tablename: string }>(`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
  `)

  if (result.rows.length === 0) {
    return
  }

  const tableList = result.rows.map((row) => `"public"."${row.tablename}"`).join(', ')
  await pool.query(`DROP TABLE IF EXISTS ${tableList} CASCADE`)
}

export async function buildTestApp() {
  const { buildApp } = await import('../app.js')
  const app = await buildApp()
  await app.ready()
  return app
}

export default async function globalSetup() {
  await ensureTestDatabaseExists()
  await runMigrations()
  await redis.flushdb()

  return async () => {
    await redis.flushdb()
    await dropAllTables()
    await redis.quit()
    await pool.end()
  }
}
