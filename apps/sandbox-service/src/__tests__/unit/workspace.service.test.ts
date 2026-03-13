import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  beforeAll,
  beforeEach,
  afterAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { Pool } from 'pg'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { JSONCodec } from 'nats'
import { schema, type Db } from '@devora/db'
import type { Logger } from '@devora/logger'
import { Subjects } from '@devora/nats'
import type { Config } from '../../config.js'
import { WorkspaceNotFoundError, WorkspaceOwnershipError } from '../../errors.js'
import { podName } from '../../k8s/workspace-pod.template.js'
import { WorkspaceService } from '../../services/workspace.service.js'
import { ValidationError } from '@devora/errors'
import type { PodService } from '../../services/pod.service.js'
import type { VolumeService } from '../../services/volume.service.js'

const { workspaces } = schema
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

type PodMock = { [K in keyof PodService]: ReturnType<typeof vi.fn> }
type VolMock = { [K in keyof VolumeService]: ReturnType<typeof vi.fn> }

let adminPool: Pool
let testPool: Pool
let db: Db
let podSvc: PodMock
let volSvc: VolMock
let publishMock: ReturnType<typeof vi.fn>
let logger: Logger
let svc: WorkspaceService

function makeLogger(): Logger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  } as unknown as Logger
}

function makePod(workspaceId: string, phase = 'Running', ready = true) {
  return {
    metadata: { name: podName(workspaceId) },
    status: { phase, podIP: '10.0.0.1', containerStatuses: [{ ready }] },
  }
}

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

async function insertWorkspace(
  overrides: Partial<typeof workspaces.$inferInsert> = {},
): Promise<typeof workspaces.$inferSelect> {
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

function decodeCall(index = 0) {
  const call = publishMock.mock.calls[index]
  return { subject: call[0] as string, payload: jc.decode(call[1]) as Record<string, unknown> }
}

beforeAll(async () => {
  adminPool = new Pool({ connectionString: ADMIN_URL })
  await ensureTestDb()
  await runMigrations()
  testPool = new Pool({ connectionString: TEST_DB_URL })
  db = drizzle(testPool, { schema }) as Db
})

afterAll(async () => {
  await testPool.end()
  await adminPool.end()
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
    getLogs: vi.fn(async () => 'log output'),
  }

  volSvc = {
    create: vi.fn(async (opts) => ({ metadata: { name: opts.pvcName } })),
    get: vi.fn(async () => null),
    delete: vi.fn(async () => undefined),
    exists: vi.fn(async () => false),
  }

  publishMock = vi.fn()
  logger = makeLogger()

  svc = new WorkspaceService(
    db,
    podSvc as unknown as PodService,
    volSvc as unknown as VolumeService,
    { publish: publishMock } as any,
    testConfig,
    logger,
  )
})

// ── getOrCreate() ─────────────────────────────────────────────────────────────

describe('getOrCreate()', () => {
  it('creates workspace record in DB for new user', async () => {
    await svc.getOrCreate('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222')
    const rows = await db.select().from(workspaces)
    expect(rows.length).toBe(1)
    expect(rows[0].userId).toBe('11111111-1111-1111-1111-111111111111')
  })

  it('creates PVC for new workspace', async () => {
    await svc.getOrCreate('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222')
    expect(volSvc.create).toHaveBeenCalled()
  })

  it('creates pod for new workspace', async () => {
    await svc.getOrCreate('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222')
    expect(podSvc.create).toHaveBeenCalled()
  })

  it('is idempotent — returns same workspaceId on second call', async () => {
    const s1 = await svc.getOrCreate('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222')
    const s2 = await svc.getOrCreate('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222')
    expect(s1.workspaceId).toBe(s2.workspaceId)
    expect(podSvc.create).toHaveBeenCalled()
  })

  it('scopes workspace to projectId when provided', async () => {
    await svc.getOrCreate('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '44444444-4444-4444-4444-444444444441')
    await svc.getOrCreate('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '44444444-4444-4444-4444-444444444442')
    const rows = await db.select().from(workspaces)
    expect(rows.length).toBe(2)
  })

  it('does not create new workspace for same user + same projectId', async () => {
    await svc.getOrCreate('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '44444444-4444-4444-4444-444444444444')
    await svc.getOrCreate('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '44444444-4444-4444-4444-444444444444')
    const rows = await db.select().from(workspaces)
    expect(rows.length).toBe(1)
  })

  it('reuses existing PVC when workspace record exists', async () => {
    const ws = await insertWorkspace({ userId: '11111111-1111-1111-1111-111111111111', status: 'stopped' })
    volSvc.exists.mockResolvedValue(true)
    await svc.getOrCreate('11111111-1111-1111-1111-111111111111', ws.orgId)
    expect(volSvc.create).not.toHaveBeenCalled()
  })

  it('deletes Failed pod before creating new one', async () => {
    podSvc.get.mockResolvedValue(makePod('x', 'Failed', false))

    const ws = await insertWorkspace({
      userId: '11111111-1111-1111-1111-111111111111',
      status: 'stopped',
    })

    podSvc.get.mockImplementation(async () => makePod(ws.id, 'Failed', false))
    const deleteOrder: string[] = []
    podSvc.delete.mockImplementation(async () => { deleteOrder.push('delete') })
    podSvc.create.mockImplementation(async (opts) => { deleteOrder.push('create'); return makePod(opts.workspaceId) })

    await svc.getOrCreate('11111111-1111-1111-1111-111111111111', ws.orgId)

    expect(deleteOrder.indexOf('delete')).toBeLessThan(deleteOrder.indexOf('create'))
  })

  it('skips pod creation if pod already Running', async () => {
    const ws = await insertWorkspace({ userId: '11111111-1111-1111-1111-111111111111', status: 'stopped' })
    podSvc.get.mockImplementation(async () => makePod(ws.id, 'Running', true))
    await svc.getOrCreate('11111111-1111-1111-1111-111111111111', ws.orgId)
    expect(podSvc.create).not.toHaveBeenCalled()
  })

  it('publishes SANDBOX_CREATED for brand new workspace', async () => {
    await svc.getOrCreate('33333333-3333-4333-8333-333333333333', '22222222-2222-2222-2222-222222222222')
    expect(publishMock).toHaveBeenCalled()
    const { subject } = decodeCall(0)
    expect(subject).toBe(Subjects.SANDBOX_CREATED)
  })

  it('publishes SANDBOX_STARTED for existing stopped workspace', async () => {
    const ws = await insertWorkspace({ userId: '11111111-1111-1111-1111-111111111111', status: 'stopped' })
    volSvc.exists.mockResolvedValue(true)
    await svc.getOrCreate('11111111-1111-1111-1111-111111111111', ws.orgId)
    expect(publishMock).toHaveBeenCalled()
    const { subject } = decodeCall(0)
    expect(subject).toBe(Subjects.SANDBOX_STARTED)
  })

  it('SANDBOX_CREATED payload contains required fields', async () => {
    await svc.getOrCreate('33333333-3333-4333-8333-333333333333', '22222222-2222-2222-2222-222222222222')
    const { payload } = decodeCall(0)
    expect(typeof payload.workspaceId).toBe('string')
    expect(payload.userId).toBe('33333333-3333-4333-8333-333333333333')
    expect(payload.orgId).toBe('22222222-2222-2222-2222-222222222222')
    expect(typeof payload.podName).toBe('string')
    expect(new Date(payload.createdAt as string).toISOString()).toBe(payload.createdAt)
  })

  it('returned session includes workspaceId and proxyPath', async () => {
    const session = await svc.getOrCreate('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222')
    expect(typeof session.workspaceId).toBe('string')
    expect(session.proxyPath).toContain(session.workspaceId)
  })

  it('handles K8s pod creation failure — rolls back DB status to not running', async () => {
    podSvc.create.mockRejectedValue(new Error('K8s API error'))
    await expect(svc.getOrCreate('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222')).rejects.toThrow()
    const rows = await db.select().from(workspaces)
    if (rows.length > 0) {
      expect(rows[0].status).not.toBe('running')
    }
  })
})

// ── getStatus() ───────────────────────────────────────────────────────────────

describe('getStatus()', () => {
  it('returns correct status from DB + pod phase combined', async () => {
    const ws = await insertWorkspace({ status: 'stopped' })
    podSvc.get.mockResolvedValue(makePod(ws.id, 'Running', true))
    const status = await svc.getStatus(ws.id, ws.userId)
    expect(status.podPhase).toBe('Running')
  })

  it('updates DB status to running when pod ready', async () => {
    const ws = await insertWorkspace({ status: 'starting' })
    podSvc.get.mockResolvedValue(makePod(ws.id, 'Running', true))
    await svc.getStatus(ws.id, ws.userId)
    const [updated] = await db.select().from(workspaces).where(eq(workspaces.id, ws.id))
    expect(updated?.status).toBe('running')
  })

  it('throws WorkspaceNotFoundError for unknown ID', async () => {
    await expect(svc.getStatus(randomUUID(), 'any-user')).rejects.toBeInstanceOf(WorkspaceNotFoundError)
  })

  it('throws WorkspaceOwnershipError for wrong userId', async () => {
    const ws = await insertWorkspace({ userId: '11111111-1111-1111-1111-111111111111' })
    await expect(
      svc.getStatus(ws.id, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
    ).rejects.toBeInstanceOf(WorkspaceOwnershipError)
  })

  it('returns null podPhase when pod does not exist', async () => {
    const ws = await insertWorkspace({ status: 'stopped' })
    podSvc.get.mockResolvedValue(null)
    const status = await svc.getStatus(ws.id, ws.userId)
    expect(status.podPhase).toBeNull()
    expect(status.containersReady).toBe(false)
  })
})

// ── stop() ────────────────────────────────────────────────────────────────────

describe('stop()', () => {
  it('calls podService.delete with correct workspaceId', async () => {
    const ws = await insertWorkspace({ status: 'running' })
    await svc.stop(ws.id, ws.userId)
    expect(podSvc.delete).toHaveBeenCalledWith(ws.id)
  })

  it('does NOT call volumeService.delete', async () => {
    const ws = await insertWorkspace({ status: 'running' })
    await svc.stop(ws.id, ws.userId)
    expect(volSvc.delete).not.toHaveBeenCalled()
  })

  it('sets workspace.status to stopped in DB', async () => {
    const ws = await insertWorkspace({ status: 'running' })
    await svc.stop(ws.id, ws.userId)
    const [updated] = await db.select().from(workspaces).where(eq(workspaces.id, ws.id))
    expect(updated?.status).toBe('stopped')
  })

  it('sets workspace.podName to null in DB', async () => {
    const ws = await insertWorkspace({ status: 'running', podName: 'ws-initial' })
    await svc.stop(ws.id, ws.userId)
    const [updated] = await db.select().from(workspaces).where(eq(workspaces.id, ws.id))
    expect(updated?.podName).toBeNull()
  })

  it('publishes SANDBOX_STOPPED with reason manual', async () => {
    const ws = await insertWorkspace({ status: 'running' })
    await svc.stop(ws.id, ws.userId)
    expect(publishMock).toHaveBeenCalled()
    const { subject, payload } = decodeCall(0)
    expect(subject).toBe(Subjects.SANDBOX_STOPPED)
    expect(payload.reason).toBe('manual')
  })

  it('throws WorkspaceOwnershipError for wrong user', async () => {
    const ws = await insertWorkspace({ userId: '11111111-1111-1111-1111-111111111111' })
    await expect(
      svc.stop(ws.id, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
    ).rejects.toBeInstanceOf(WorkspaceOwnershipError)
  })

  it('throws WorkspaceNotFoundError for unknown ID', async () => {
    await expect(svc.stop(randomUUID(), '11111111-1111-1111-1111-111111111111')).rejects.toBeInstanceOf(WorkspaceNotFoundError)
  })

  it('still updates DB status even if pod already deleted (K8s 404)', async () => {
    podSvc.delete.mockResolvedValue(undefined) // already handles 404 internally
    const ws = await insertWorkspace({ status: 'running' })
    await svc.stop(ws.id, ws.userId)
    const [updated] = await db.select().from(workspaces).where(eq(workspaces.id, ws.id))
    expect(updated?.status).toBe('stopped')
  })

  it('stop is idempotent — stopping already stopped workspace succeeds', async () => {
    const ws = await insertWorkspace({ status: 'stopped' })
    await expect(svc.stop(ws.id, ws.userId)).resolves.not.toThrow()
    const [updated] = await db.select().from(workspaces).where(eq(workspaces.id, ws.id))
    expect(updated?.status).toBe('stopped')
  })
})

// ── delete() ──────────────────────────────────────────────────────────────────

describe('delete()', () => {
  it('calls both podService.delete and volumeService.delete', async () => {
    const ws = await insertWorkspace({ status: 'running' })
    await svc.delete(ws.id, ws.userId)
    expect(podSvc.delete).toHaveBeenCalledWith(ws.id)
    expect(volSvc.delete).toHaveBeenCalledWith(ws.id)
  })

  it('sets workspace.status to deleted in DB', async () => {
    const ws = await insertWorkspace({ status: 'running' })
    await svc.delete(ws.id, ws.userId)
    const [updated] = await db.select().from(workspaces).where(eq(workspaces.id, ws.id))
    expect(updated?.status).toBe('deleted')
  })

  it('deleted workspace not returned in getOrCreate', async () => {
    const ws = await insertWorkspace({ userId: '11111111-1111-1111-1111-111111111111', status: 'deleted' })
    await svc.getOrCreate('11111111-1111-1111-1111-111111111111', ws.orgId)
    const rows = await db.select().from(workspaces)
    expect(rows.length).toBe(2) // deleted + new
    const running = rows.find((r) => r.status !== 'deleted')
    expect(running).toBeDefined()
  })

  it('throws WorkspaceOwnershipError for wrong user', async () => {
    const ws = await insertWorkspace({ userId: '11111111-1111-1111-1111-111111111111' })
    await expect(
      svc.delete(ws.id, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
    ).rejects.toBeInstanceOf(WorkspaceOwnershipError)
  })

  it('throws WorkspaceNotFoundError for unknown ID', async () => {
    await expect(svc.delete(randomUUID(), '11111111-1111-1111-1111-111111111111')).rejects.toBeInstanceOf(WorkspaceNotFoundError)
  })

  it('logs a warning before deletion', async () => {
    const ws = await insertWorkspace({ status: 'running' })
    await svc.delete(ws.id, ws.userId)
    expect((logger.warn as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0)
  })
})

// ── heartbeat() ───────────────────────────────────────────────────────────────

describe('heartbeat()', () => {
  it('updates lastActiveAt to current time', async () => {
    const before = new Date()
    const ws = await insertWorkspace({
      lastActiveAt: new Date(Date.now() - 60_000),
    })
    await svc.heartbeat(ws.id, ws.userId)
    const [updated] = await db.select().from(workspaces).where(eq(workspaces.id, ws.id))
    expect(updated?.lastActiveAt!.getTime()).toBeGreaterThanOrEqual(before.getTime())
  })

  it('updates lastActiveAt on repeated calls', async () => {
    const ws = await insertWorkspace({ lastActiveAt: new Date(Date.now() - 60_000) })
    await svc.heartbeat(ws.id, ws.userId)
    const [r1] = await db.select().from(workspaces).where(eq(workspaces.id, ws.id))
    await new Promise((r) => setTimeout(r, 10))
    await svc.heartbeat(ws.id, ws.userId)
    const [r2] = await db.select().from(workspaces).where(eq(workspaces.id, ws.id))
    expect(r2?.lastActiveAt!.getTime()).toBeGreaterThanOrEqual(r1?.lastActiveAt!.getTime())
  })

  it('throws WorkspaceNotFoundError for unknown ID', async () => {
    await expect(svc.heartbeat(randomUUID(), '11111111-1111-1111-1111-111111111111')).rejects.toBeInstanceOf(WorkspaceNotFoundError)
  })

  it('throws WorkspaceOwnershipError for wrong user', async () => {
    const ws = await insertWorkspace({ userId: '11111111-1111-1111-1111-111111111111' })
    await expect(
      svc.heartbeat(ws.id, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
    ).rejects.toBeInstanceOf(WorkspaceOwnershipError)
  })
})

// ── stopIdle() ────────────────────────────────────────────────────────────────

describe('stopIdle()', () => {
  it('stops workspaces idle longer than threshold', async () => {
    const now = Date.now()
    const userId = '11111111-1111-1111-1111-111111111111'

    const wsA = await insertWorkspace({
      userId,
      status: 'running',
      lastActiveAt: new Date(now - 2 * 60 * 60_000), // 2 hours ago
    })
    const wsB = await insertWorkspace({
      userId,
      status: 'running',
      lastActiveAt: new Date(now - 10 * 60_000), // 10 minutes ago
    })
    const wsC = await insertWorkspace({
      userId,
      status: 'running',
      lastActiveAt: new Date(now - 45 * 60_000), // 45 minutes ago
    })

    const count = await svc.stopIdle(30)
    expect(count).toBe(2)

    const [a] = await db.select().from(workspaces).where(eq(workspaces.id, wsA.id))
    const [b] = await db.select().from(workspaces).where(eq(workspaces.id, wsB.id))
    const [c] = await db.select().from(workspaces).where(eq(workspaces.id, wsC.id))

    expect(a?.status).toBe('stopped')
    expect(b?.status).toBe('running')
    expect(c?.status).toBe('stopped')
  })

  it('does not stop workspaces with status != running', async () => {
    await insertWorkspace({
      status: 'stopped',
      lastActiveAt: new Date(Date.now() - 2 * 60 * 60_000),
    })
    const count = await svc.stopIdle(30)
    expect(count).toBe(0)
  })

  it('does not stop workspaces with status deleted', async () => {
    await insertWorkspace({
      status: 'deleted',
      lastActiveAt: new Date(Date.now() - 2 * 60 * 60_000),
    })
    const count = await svc.stopIdle(30)
    expect(count).toBe(0)
  })

  it('publishes SANDBOX_STOPPED with reason idle for each stopped workspace', async () => {
    const userId = '11111111-1111-1111-1111-111111111111'
    await insertWorkspace({ userId, status: 'running', lastActiveAt: new Date(Date.now() - 60 * 60_000) })
    await insertWorkspace({ userId, status: 'running', lastActiveAt: new Date(Date.now() - 90 * 60_000) })

    await svc.stopIdle(30)
    expect(publishMock).toHaveBeenCalledTimes(2)

    const calls = publishMock.mock.calls.map((call) => ({
      subject: call[0] as string,
      payload: jc.decode(call[1]) as Record<string, unknown>,
    }))
    for (const call of calls) {
      expect(call.subject).toBe(Subjects.SANDBOX_STOPPED)
      expect(call.payload.reason).toBe('idle')
    }
  })

  it('throws if pod deletion fails during idle cleanup', async () => {
    const userId = '11111111-1111-1111-1111-111111111111'
    const cutoff = new Date(Date.now() - 60 * 60_000)
    await insertWorkspace({ userId, status: 'running', lastActiveAt: cutoff })
    await insertWorkspace({ userId, status: 'running', lastActiveAt: cutoff })
    await insertWorkspace({ userId, status: 'running', lastActiveAt: cutoff })

    let callCount = 0
    podSvc.delete.mockImplementation(async () => {
      callCount++
      if (callCount === 2) throw new Error('K8s delete failed')
    })

    await expect(svc.stopIdle(30)).rejects.toThrow('K8s delete failed')
  })

  it('returns 0 when no idle workspaces exist', async () => {
    const count = await svc.stopIdle(30)
    expect(count).toBe(0)
  })
})

// ── getLogs() ─────────────────────────────────────────────────────────────────

describe('getLogs()', () => {
  it('returns log string from podService', async () => {
    const ws = await insertWorkspace({ status: 'running' })
    podSvc.getLogs.mockResolvedValue('line1\nline2\nline3')
    const logs = await svc.getLogs(ws.id, ws.userId)
    expect(logs).toBe('line1\nline2\nline3')
  })

  it('passes tailLines to podService.getLogs', async () => {
    const ws = await insertWorkspace({ status: 'running' })
    await svc.getLogs(ws.id, ws.userId, 50)
    expect(podSvc.getLogs).toHaveBeenCalledWith(ws.id, 50)
  })

  it('throws ValidationError if workspace not running', async () => {
    const ws = await insertWorkspace({ status: 'stopped' })
    await expect(svc.getLogs(ws.id, ws.userId)).rejects.toBeInstanceOf(ValidationError)
  })

  it('throws WorkspaceOwnershipError for wrong user', async () => {
    const ws = await insertWorkspace({ userId: '11111111-1111-1111-1111-111111111111', status: 'running' })
    await expect(
      svc.getLogs(ws.id, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
    ).rejects.toBeInstanceOf(WorkspaceOwnershipError)
  })

  it('throws WorkspaceNotFoundError for unknown ID', async () => {
    await expect(svc.getLogs(randomUUID(), '11111111-1111-1111-1111-111111111111')).rejects.toBeInstanceOf(WorkspaceNotFoundError)
  })
})
