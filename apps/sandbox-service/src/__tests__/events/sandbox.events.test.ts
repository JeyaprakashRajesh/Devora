/**
 * Tests that WorkspaceService publishes well-formed NATS events.
 * Validates event payload shapes against the SandboxEvent type contracts.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { JSONCodec } from 'nats'
import { Subjects } from '@devora/nats'
import { schema, type Db } from '@devora/db'
import { WorkspaceService } from '../../services/workspace.service.js'
import type { PodService } from '../../services/pod.service.js'
import type { VolumeService } from '../../services/volume.service.js'
import type { Config } from '../../config.js'
import { podName } from '../../k8s/workspace-pod.template.js'

const jc = JSONCodec()

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
    for (const statement of sql.split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean)) {
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

const USER_ID = '11111111-1111-1111-1111-111111111111'
const ORG_ID = '22222222-2222-2222-2222-222222222222'

function makeLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as any
}

function makePod(wsId: string) {
  return {
    metadata: { name: podName(wsId) },
    status: { phase: 'Running', podIP: '10.0.0.1', containerStatuses: [{ ready: true }] },
  }
}

async function insertWorkspace(status = 'running', overrides: Record<string, unknown> = {}) {
  const [ws] = await db.insert(workspaces).values({
    id: randomUUID(),
    userId: USER_ID,
    orgId: ORG_ID,
    name: 'workspace-test',
    status,
    podName: null,
    volumeName: null,
    cpuLimit: '2',
    memoryLimit: '2Gi',
    lastActiveAt: new Date(),
    ...overrides,
  } as any).returning()
  return ws
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
    create: vi.fn(async (opts) => makePod(opts.workspaceId)),
    get: vi.fn(async () => null),
    delete: vi.fn(async () => undefined),
    getPhase: vi.fn(async () => null),
    waitUntilReady: vi.fn(async () => undefined),
    listByOrg: vi.fn(async () => []),
    getLogs: vi.fn(async () => ''),
  }

  volSvc = {
    create: vi.fn(async (opts) => ({ metadata: { name: opts.pvcName } })),
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

function decodeCall(index = 0) {
  const call = publishMock.mock.calls[index]
  return { subject: call[0] as string, payload: jc.decode(call[1]) as Record<string, unknown> }
}

// ── SANDBOX_CREATED event ─────────────────────────────────────────────────────

describe('SANDBOX_CREATED event', () => {
  it('is published on getOrCreate() when a new workspace is provisioned', async () => {
    await svc.getOrCreate(USER_ID, ORG_ID)
    const createdCall = publishMock.mock.calls.find((c) => c[0] === Subjects.SANDBOX_CREATED)
    expect(createdCall).toBeDefined()
    const payload = jc.decode(createdCall[1]) as Record<string, unknown>
    expect(payload).toMatchObject({
      userId: USER_ID,
      orgId: ORG_ID,
    })
    expect(typeof payload.workspaceId).toBe('string')
    expect(typeof payload.createdAt).toBe('string')
  })

  it('contains podName in event payload', async () => {
    await svc.getOrCreate(USER_ID, ORG_ID)
    const createdCall = publishMock.mock.calls.find((c) => c[0] === Subjects.SANDBOX_CREATED)
    const payload = jc.decode(createdCall[1]) as Record<string, unknown>
    expect(typeof payload.podName).toBe('string')
    expect((payload.podName as string).length).toBeGreaterThan(0)
  })
})

// ── SANDBOX_STARTED event ─────────────────────────────────────────────────────

describe('SANDBOX_STARTED event', () => {
  it('is published when starting an existing workspace', async () => {
    await insertWorkspace('stopped')
    await svc.getOrCreate(USER_ID, ORG_ID)
    const startedCall = publishMock.mock.calls.find((c) => c[0] === Subjects.SANDBOX_STARTED)
    expect(startedCall).toBeDefined()
    const payload = jc.decode(startedCall[1]) as Record<string, unknown>
    expect(payload).toMatchObject({
      userId: USER_ID,
      orgId: ORG_ID,
    })
    expect(typeof payload.startedAt).toBe('string')
  })
})

// ── SANDBOX_STOPPED event ─────────────────────────────────────────────────────

describe('SANDBOX_STOPPED event', () => {
  it('is published with reason=manual on stop()', async () => {
    const ws = await insertWorkspace('running')
    await svc.stop(ws.id, USER_ID)
    const stoppedCall = publishMock.mock.calls.find((c) => c[0] === Subjects.SANDBOX_STOPPED)
    expect(stoppedCall).toBeDefined()
    const payload = jc.decode(stoppedCall[1]) as Record<string, unknown>
    expect(payload.reason).toBe('manual')
    expect(payload.workspaceId).toBe(ws.id)
    expect(typeof payload.stoppedAt).toBe('string')
  })

  it('does not publish SANDBOX_STOPPED on delete()', async () => {
    const ws = await insertWorkspace('running')
    await svc.delete(ws.id, USER_ID)
    const stoppedCall = publishMock.mock.calls.find((c) => c[0] === Subjects.SANDBOX_STOPPED)
    expect(stoppedCall).toBeUndefined()
  })

  it('is published with reason=idle on stopIdle()', async () => {
    await insertWorkspace('running', {
      lastActiveAt: new Date(Date.now() - 40 * 60 * 1000),
    })

    await svc.stopIdle()
    const stoppedCall = publishMock.mock.calls.find((c) => c[0] === Subjects.SANDBOX_STOPPED)
    expect(stoppedCall).toBeDefined()
    const payload = jc.decode(stoppedCall[1]) as Record<string, unknown>
    expect(payload.reason).toBe('idle')
  })

  it('event payload includes userId and orgId', async () => {
    const ws = await insertWorkspace('running')
    await svc.stop(ws.id, USER_ID)
    const stoppedCall = publishMock.mock.calls.find((c) => c[0] === Subjects.SANDBOX_STOPPED)
    const payload = jc.decode(stoppedCall[1]) as Record<string, unknown>
    expect(payload.userId).toBe(USER_ID)
    expect(payload.orgId).toBe(ORG_ID)
  })
})
