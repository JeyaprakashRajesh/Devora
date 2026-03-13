/**
 * Integration tests for idle workspace cleanup via WorkspaceService.stopIdle().
 * Uses real DB at localhost:5436/devora_sandbox_test with mocked PodService/VolumeService.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { schema, type Db } from '@devora/db'
import type { PodService } from '../../services/pod.service.js'
import type { VolumeService } from '../../services/volume.service.js'
import { WorkspaceService } from '../../services/workspace.service.js'
import type { Config } from '../../config.js'

const ADMIN_URL = 'postgresql://devora:devora_dev@localhost:5436/postgres'
const TEST_DB_NAME = 'devora_sandbox_test'
const TEST_DB_URL = `postgresql://devora:devora_dev@localhost:5436/${TEST_DB_NAME}`

const migrationPath = path.resolve(
  process.cwd(),
  'packages/db/src/migrations/0000_medical_namora.sql',
)

const testConfig: Config = {
  NODE_ENV: 'test',
  PORT: 4005,
  DATABASE_URL: TEST_DB_URL,
  NATS_URL: 'nats://localhost:4222',
  JWT_SECRET: 'x'.repeat(32),
  K8S_NAMESPACE: 'devora-sandboxes',
  K8S_IN_CLUSTER: false,
  KUBECONFIG_PATH: '~/.kube/config',
  K8S_FAIL_FAST: false,
  WORKSPACE_IMAGE: 'devora/workspace:latest',
  WORKSPACE_STORAGE_CLASS: 'standard',
  WORKSPACE_DEFAULT_CPU: '2',
  WORKSPACE_DEFAULT_MEMORY: '2Gi',
  WORKSPACE_DEFAULT_STORAGE: '10Gi',
  OLLAMA_URL: 'http://ollama:11434',
  PLATFORM_API_URL: 'http://gateway:4000',
  IDLE_TIMEOUT_MINUTES: 30,
}

const { workspaces } = schema

async function ensureTestDb(): Promise<void> {
  const pool = new Pool({ connectionString: ADMIN_URL })
  try {
    const res = await pool.query<{ datname: string }>(
      'SELECT datname FROM pg_database WHERE datname = $1',
      [TEST_DB_NAME],
    )
    if ((res.rowCount ?? 0) === 0) {
      await pool.query(`CREATE DATABASE "${TEST_DB_NAME}"`)
    }
  } finally {
    await pool.end()
  }
}

async function runMigrations(): Promise<void> {
  const pool = new Pool({ connectionString: TEST_DB_URL })
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

async function truncate(): Promise<void> {
  const pool = new Pool({ connectionString: TEST_DB_URL })
  try {
    await pool.query('TRUNCATE TABLE workspaces RESTART IDENTITY CASCADE')
  } finally {
    await pool.end()
  }
}

let db: Db
let testPool: Pool
let podSvc: { [K in keyof PodService]: ReturnType<typeof vi.fn> }
let volSvc: { [K in keyof VolumeService]: ReturnType<typeof vi.fn> }
let publishMock: ReturnType<typeof vi.fn>
let svc: WorkspaceService

function makeLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  } as any
}

beforeAll(async () => {
  await ensureTestDb()
  await runMigrations()
  testPool = new Pool({ connectionString: TEST_DB_URL })
  db = drizzle(testPool, { schema }) as Db
})

afterAll(async () => {
  await testPool.end()
})

beforeEach(async () => {
  await truncate()

  podSvc = {
    create: vi.fn(async () => ({})),
    get: vi.fn(async () => null),
    delete: vi.fn(async () => undefined),
    getPhase: vi.fn(async () => null),
    waitUntilReady: vi.fn(async () => undefined),
    listByOrg: vi.fn(async () => []),
    getLogs: vi.fn(async () => ''),
  }

  volSvc = {
    create: vi.fn(async () => ({})),
    get: vi.fn(async () => null),
    delete: vi.fn(async () => undefined),
    exists: vi.fn(async () => false),
  }

  publishMock = vi.fn()

  svc = new WorkspaceService(
    db,
    podSvc as unknown as PodService,
    volSvc as unknown as VolumeService,
    { publish: publishMock } as any,
    testConfig,
    makeLogger(),
  )
})

async function insertWorkspace(overrides: Partial<typeof workspaces.$inferInsert> = {}) {
  const [ws] = await db
    .insert(workspaces)
    .values({
      id: randomUUID(),
      userId: '11111111-1111-1111-1111-111111111111',
      orgId: '22222222-2222-2222-2222-222222222222',
      projectId: null,
      name: 'workspace-test',
      status: 'running',
      podName: null,
      volumeName: null,
      cpuLimit: '2',
      memoryLimit: '2Gi',
      lastActiveAt: new Date(),
      ...overrides,
    })
    .returning()
  return ws
}

function pastDate(minutesAgo: number): Date {
  return new Date(Date.now() - minutesAgo * 60 * 1000)
}

// ── stopIdle() ────────────────────────────────────────────────────────────────

describe('WorkspaceService.stopIdle()', () => {
  it('returns 0 when no workspaces exist', async () => {
    const stopped = await svc.stopIdle()
    expect(stopped).toBe(0)
  })

  it('returns 0 when all running workspaces are active within timeout', async () => {
    await insertWorkspace({ lastActiveAt: pastDate(10) }) // 10 min ago
    const stopped = await svc.stopIdle()
    expect(stopped).toBe(0)
  })

  it('stops workspaces that have been idle past the configured timeout', async () => {
    await insertWorkspace({ lastActiveAt: pastDate(35) }) // 35 min > 30 min timeout
    const stopped = await svc.stopIdle()
    expect(stopped).toBe(1)
    expect(podSvc.delete).toHaveBeenCalledTimes(1)
  })

  it('stops multiple idle workspaces and returns the count', async () => {
    await insertWorkspace({ lastActiveAt: pastDate(40) })
    await insertWorkspace({ lastActiveAt: pastDate(45) })
    await insertWorkspace({ lastActiveAt: pastDate(10) }) // active
    const stopped = await svc.stopIdle()
    expect(stopped).toBe(2)
  })

  it('does not attempt to stop workspaces in stopped status', async () => {
    await insertWorkspace({ status: 'stopped', lastActiveAt: pastDate(60) })
    const stopped = await svc.stopIdle()
    expect(stopped).toBe(0)
  })

  it('does not attempt to stop workspaces in starting status', async () => {
    await insertWorkspace({ status: 'starting', lastActiveAt: pastDate(60) })
    const stopped = await svc.stopIdle()
    expect(stopped).toBe(0)
  })

  it('publishes NATS event for each stopped idle workspace', async () => {
    await insertWorkspace({ lastActiveAt: pastDate(35) })
    await svc.stopIdle()
    expect(publishMock).toHaveBeenCalled()
  })

  it('throws when pod delete fails for an idle workspace', async () => {
    await insertWorkspace({ id: '11111111-0000-4111-8111-111111111111', lastActiveAt: pastDate(35) })
    await insertWorkspace({ id: '22222222-0000-4222-8222-222222222222', lastActiveAt: pastDate(35) })

    // First delete throws, second should still be attempted
    podSvc.delete
      .mockRejectedValueOnce(new Error('K8s error'))
      .mockResolvedValue(undefined)

    await expect(svc.stopIdle()).rejects.toThrow('K8s error')
  })
})
