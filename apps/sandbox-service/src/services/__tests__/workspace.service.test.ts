import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from 'vitest'
import { Pool } from 'pg'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { JSONCodec, type NatsConnection } from 'nats'
import { schema, type Db } from '@devora/db'
import type { Logger } from '@devora/logger'
import { Subjects } from '@devora/nats'
import type { Config } from '../../config.js'
import { WorkspaceNotFoundError, WorkspaceOwnershipError } from '../../errors.js'
import { podName } from '../../k8s/workspace-pod.template.js'
import { WorkspaceService } from '../workspace.service.js'
import type { PodService } from '../pod.service.js'
import type { VolumeService } from '../volume.service.js'

const { workspaces } = schema
const jc = JSONCodec()

const ADMIN_DATABASE_URL = 'postgresql://devora:devora_dev@localhost:5432/postgres'
const TEST_DATABASE_NAME = 'devora_sandbox_service_test'
const TEST_DATABASE_URL = `postgresql://devora:devora_dev@localhost:5432/${TEST_DATABASE_NAME}`
const migrationPath = path.resolve(process.cwd(), '../../packages/db/src/migrations/0000_medical_namora.sql')

const testConfig: Config = {
  NODE_ENV: 'test',
  PORT: 4005,
  DATABASE_URL: TEST_DATABASE_URL,
  NATS_URL: 'nats://localhost:4222',
  JWT_SECRET: 'x'.repeat(32),
  K8S_NAMESPACE: 'devora-sandboxes',
  K8S_IN_CLUSTER: false,
  KUBECONFIG_PATH: '~/.kube/config',
  WORKSPACE_IMAGE: 'devora/workspace:latest',
  WORKSPACE_STORAGE_CLASS: 'standard',
  WORKSPACE_DEFAULT_CPU: '2',
  WORKSPACE_DEFAULT_MEMORY: '2Gi',
  WORKSPACE_DEFAULT_STORAGE: '10Gi',
  OLLAMA_URL: 'http://ollama:11434',
  PLATFORM_API_URL: 'http://gateway:4000',
  IDLE_TIMEOUT_MINUTES: 30,
}

type PodServiceMock = {
  create: any
  get: any
  delete: any
  getPhase: any
  waitUntilReady: any
  listByOrg: any
  getLogs: any
}

type VolumeServiceMock = {
  create: any
  get: any
  delete: any
  exists: any
}

let adminPool: Pool
let testPool: Pool
let db: Db
let podService: PodServiceMock
let volumeService: VolumeServiceMock
let publishMock: ReturnType<typeof vi.fn>
let logger: Logger
let workspaceService: WorkspaceService

function makeLogger(): Logger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  } as unknown as Logger
}

function makePod(workspaceId: string, phase: string = 'Running', ready = true) {
  return {
    metadata: {
      name: podName(workspaceId),
    },
    status: {
      phase,
      containerStatuses: [
        {
          ready,
        },
      ],
    },
  }
}

async function ensureTestDatabaseExists(): Promise<void> {
  const existing = await adminPool.query<{ datname: string }>(
    'SELECT datname FROM pg_database WHERE datname = $1',
    [TEST_DATABASE_NAME],
  )

  if (existing.rowCount === 0) {
    await adminPool.query(`CREATE DATABASE "${TEST_DATABASE_NAME}"`)
  }
}

async function runMigrations(): Promise<void> {
  const pool = new Pool({ connectionString: TEST_DATABASE_URL })
  const sql = await fs.readFile(migrationPath, 'utf8')
  const statements = sql
    .split('--> statement-breakpoint')
    .map((statement) => statement.trim())
    .filter(Boolean)

  for (const statement of statements) {
    await pool.query(statement)
  }

  await pool.end()
}

async function truncateWorkspaces(): Promise<void> {
  const pool = new Pool({ connectionString: TEST_DATABASE_URL })
  await pool.query('TRUNCATE TABLE workspaces RESTART IDENTITY CASCADE')
  await pool.end()
}

async function insertWorkspace(overrides: Partial<typeof workspaces.$inferInsert> = {}) {
  const now = new Date()
  const [workspace] = await db
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
      lastActiveAt: now,
      ...overrides,
    })
    .returning()

  return workspace
}

function decodePublishCall(callIndex: number) {
  const call = publishMock.mock.calls[callIndex]
  return {
    subject: call[0] as string,
    payload: jc.decode(call[1]) as Record<string, unknown>,
  }
}

beforeAll(async () => {
  adminPool = new Pool({ connectionString: ADMIN_DATABASE_URL })
  await ensureTestDatabaseExists()
  await runMigrations()
  testPool = new Pool({ connectionString: TEST_DATABASE_URL })
  db = drizzle(testPool, { schema }) as Db
})

beforeEach(async () => {
  await truncateWorkspaces()

  podService = {
    create: vi.fn(async (opts) => makePod(opts.workspaceId)),
    get: vi.fn(async () => null),
    delete: vi.fn(async () => undefined),
    getPhase: vi.fn(async () => null),
    waitUntilReady: vi.fn(async () => undefined),
    listByOrg: vi.fn(async () => []),
    getLogs: vi.fn(async () => 'log output'),
  }

  volumeService = {
    create: vi.fn(async (opts) => ({ metadata: { name: opts.pvcName } })),
    get: vi.fn(async () => null),
    delete: vi.fn(async () => undefined),
    exists: vi.fn(async () => false),
  }

  publishMock = vi.fn()
  logger = makeLogger()

  workspaceService = new WorkspaceService(
    db,
    podService as unknown as PodService,
    volumeService as unknown as VolumeService,
    { publish: publishMock } as unknown as NatsConnection,
    testConfig,
    logger,
  )
})

afterAll(async () => {
  await testPool.end()
  await adminPool.end()
})

describe('getOrCreate()', () => {
  it('creates new workspace and PVC when none exists', async () => {
    const userId = '11111111-1111-1111-1111-111111111111'
    const orgId = '22222222-2222-2222-2222-222222222222'

    const session = await workspaceService.getOrCreate(userId, orgId)

    const rows = await db.select().from(workspaces)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.status).toBe('starting')
    expect(volumeService.create).toHaveBeenCalledTimes(1)
    expect(volumeService.create.mock.calls[0]?.[0]?.pvcName).toBe(`pvc-${rows[0]?.id}`)
    expect(podService.create).toHaveBeenCalledTimes(1)
    expect(podService.create.mock.calls[0]?.[0]?.podName).toBe(`ws-${rows[0]?.id}`)
    expect(session.workspaceId).toBe(rows[0]?.id)
    expect(session.proxyPath).toBe(`/api/sandbox/workspaces/${rows[0]?.id}/connect`)
  })

  it('is idempotent — second call returns same workspace', async () => {
    const userId = '11111111-1111-1111-1111-111111111111'
    const orgId = '22222222-2222-2222-2222-222222222222'

    const first = await workspaceService.getOrCreate(userId, orgId)
    podService.get.mockResolvedValue(makePod(first.workspaceId, 'Running', true))
    volumeService.exists.mockResolvedValue(true)

    const second = await workspaceService.getOrCreate(userId, orgId)

    const rows = await db.select().from(workspaces)
    expect(rows).toHaveLength(1)
    expect(first.workspaceId).toBe(second.workspaceId)
    expect(volumeService.create).toHaveBeenCalledTimes(1)
  })

  it('reuses existing PVC if workspace record exists', async () => {
    const workspace = await insertWorkspace({
      status: 'stopped',
      volumeName: `pvc-${randomUUID()}`,
    })
    volumeService.exists.mockResolvedValue(true)

    await workspaceService.getOrCreate(workspace.userId, workspace.orgId)

    expect(volumeService.create).not.toHaveBeenCalled()
    expect(podService.create).toHaveBeenCalledTimes(1)
  })

  it('deletes Failed pod before creating new one', async () => {
    const workspace = await insertWorkspace({
      status: 'running',
      volumeName: `pvc-${randomUUID()}`,
    })
    volumeService.exists.mockResolvedValue(true)
    podService.get.mockResolvedValue(makePod(workspace.id, 'Failed', false))

    await workspaceService.getOrCreate(workspace.userId, workspace.orgId)

    expect(podService.delete).toHaveBeenCalledWith(workspace.id)
    expect(podService.create).toHaveBeenCalledTimes(1)
    expect(podService.delete.mock.invocationCallOrder[0]).toBeLessThan(
      podService.create.mock.invocationCallOrder[0],
    )
  })

  it('returns running status without recreating pod if already running', async () => {
    const workspace = await insertWorkspace({
      status: 'running',
      volumeName: `pvc-${randomUUID()}`,
    })
    volumeService.exists.mockResolvedValue(true)
    podService.get.mockResolvedValue(makePod(workspace.id, 'Running', true))

    const session = await workspaceService.getOrCreate(workspace.userId, workspace.orgId)

    expect(podService.create).not.toHaveBeenCalled()
    expect(session.status).toBe('running')
  })

  it('publishes SANDBOX_CREATED to NATS for new workspace', async () => {
    await workspaceService.getOrCreate(
      '11111111-1111-1111-1111-111111111111',
      '22222222-2222-2222-2222-222222222222',
    )

    const published = decodePublishCall(0)
    expect(published.subject).toBe(Subjects.SANDBOX_CREATED)
    expect(published.payload.userId).toBe('11111111-1111-1111-1111-111111111111')
    expect(published.payload.orgId).toBe('22222222-2222-2222-2222-222222222222')
    expect(typeof published.payload.workspaceId).toBe('string')
  })

  it('publishes SANDBOX_STARTED to NATS for existing stopped workspace', async () => {
    const workspace = await insertWorkspace({
      status: 'stopped',
      volumeName: `pvc-${randomUUID()}`,
    })
    volumeService.exists.mockResolvedValue(true)

    await workspaceService.getOrCreate(workspace.userId, workspace.orgId)

    const published = decodePublishCall(0)
    expect(published.subject).toBe(Subjects.SANDBOX_STARTED)
    expect(published.payload.workspaceId).toBe(workspace.id)
  })
})

describe('stop()', () => {
  it('deletes pod but keeps PVC', async () => {
    const workspace = await insertWorkspace({
      status: 'running',
      podName: `ws-${randomUUID()}`,
      volumeName: `pvc-${randomUUID()}`,
    })

    await workspaceService.stop(workspace.id, workspace.userId)

    expect(podService.delete).toHaveBeenCalledWith(workspace.id)
    expect(volumeService.delete).not.toHaveBeenCalled()

    const [updated] = await db.select().from(workspaces).where(eq(workspaces.id, workspace.id))
    expect(updated?.status).toBe('stopped')
    expect(updated?.podName).toBeNull()
  })

  it('publishes SANDBOX_STOPPED with reason manual', async () => {
    const workspace = await insertWorkspace({ status: 'running' })

    await workspaceService.stop(workspace.id, workspace.userId)

    const published = decodePublishCall(0)
    expect(published.subject).toBe(Subjects.SANDBOX_STOPPED)
    expect(published.payload.reason).toBe('manual')
  })

  it('throws WorkspaceOwnershipError if userId does not match', async () => {
    const workspace = await insertWorkspace({ userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' })

    await expect(
      workspaceService.stop(workspace.id, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
    ).rejects.toBeInstanceOf(WorkspaceOwnershipError)
  })

  it('throws WorkspaceNotFoundError for unknown workspaceId', async () => {
    await expect(
      workspaceService.stop(randomUUID(), '11111111-1111-1111-1111-111111111111'),
    ).rejects.toBeInstanceOf(WorkspaceNotFoundError)
  })
})

describe('delete()', () => {
  it('deletes both pod and PVC', async () => {
    const workspace = await insertWorkspace({
      status: 'running',
      volumeName: `pvc-${randomUUID()}`,
    })

    await workspaceService.delete(workspace.id, workspace.userId)

    expect(podService.delete).toHaveBeenCalledWith(workspace.id)
    expect(volumeService.delete).toHaveBeenCalledWith(workspace.id)

    const [updated] = await db.select().from(workspaces).where(eq(workspaces.id, workspace.id))
    expect(updated?.status).toBe('deleted')
  })

  it('throws WorkspaceOwnershipError if userId does not match', async () => {
    const workspace = await insertWorkspace({ userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' })

    await expect(
      workspaceService.delete(workspace.id, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
    ).rejects.toBeInstanceOf(WorkspaceOwnershipError)
  })
})

describe('heartbeat()', () => {
  it('updates lastActiveAt timestamp', async () => {
    const oldDate = new Date(Date.now() - 60 * 60 * 1000)
    const workspace = await insertWorkspace({ lastActiveAt: oldDate })

    await workspaceService.heartbeat(workspace.id, workspace.userId)

    const [updated] = await db.select().from(workspaces).where(eq(workspaces.id, workspace.id))
    expect(updated?.lastActiveAt).toBeInstanceOf(Date)
    expect((updated?.lastActiveAt?.getTime() ?? 0) > Date.now() - 5000).toBe(true)
  })

  it('throws WorkspaceNotFoundError for unknown workspaceId', async () => {
    await expect(
      workspaceService.heartbeat(randomUUID(), '11111111-1111-1111-1111-111111111111'),
    ).rejects.toBeInstanceOf(WorkspaceNotFoundError)
  })
})

describe('stopIdle()', () => {
  it('stops workspaces idle longer than threshold', async () => {
    const userId = '11111111-1111-1111-1111-111111111111'
    const orgId = '22222222-2222-2222-2222-222222222222'
    const now = Date.now()

    const workspaceA = await insertWorkspace({
      userId,
      orgId,
      status: 'running',
      lastActiveAt: new Date(now - 120 * 60 * 1000),
    })
    const workspaceB = await insertWorkspace({
      userId,
      orgId,
      status: 'running',
      lastActiveAt: new Date(now - 10 * 60 * 1000),
    })
    const workspaceC = await insertWorkspace({
      userId,
      orgId,
      status: 'running',
      lastActiveAt: new Date(now - 45 * 60 * 1000),
    })

    const stoppedCount = await workspaceService.stopIdle(30)

    const updated = await db.select().from(workspaces)
    const byId = new Map(updated.map((workspace) => [workspace.id, workspace]))

    expect(byId.get(workspaceA.id)?.status).toBe('stopped')
    expect(byId.get(workspaceB.id)?.status).toBe('running')
    expect(byId.get(workspaceC.id)?.status).toBe('stopped')
    expect(stoppedCount).toBe(2)
  })

  it('does not stop already stopped workspaces', async () => {
    await insertWorkspace({
      status: 'stopped',
      lastActiveAt: new Date(Date.now() - 120 * 60 * 1000),
    })

    const stoppedCount = await workspaceService.stopIdle(30)

    expect(stoppedCount).toBe(0)
    expect(podService.delete).not.toHaveBeenCalled()
  })

  it('publishes SANDBOX_STOPPED with reason idle for each stopped workspace', async () => {
    await insertWorkspace({
      status: 'running',
      lastActiveAt: new Date(Date.now() - 120 * 60 * 1000),
    })
    await insertWorkspace({
      status: 'running',
      lastActiveAt: new Date(Date.now() - 45 * 60 * 1000),
    })

    await workspaceService.stopIdle(30)

    expect(publishMock).toHaveBeenCalledTimes(2)
    expect(decodePublishCall(0).subject).toBe(Subjects.SANDBOX_STOPPED)
    expect(decodePublishCall(0).payload.reason).toBe('idle')
    expect(decodePublishCall(1).payload.reason).toBe('idle')
  })
})

describe('getLogs()', () => {
  it('returns pod logs for running workspace', async () => {
    const workspace = await insertWorkspace({ status: 'running' })

    const result = await workspaceService.getLogs(workspace.id, workspace.userId)

    expect(podService.getLogs).toHaveBeenCalledWith(workspace.id, undefined)
    expect(result).toBe('log output')
  })

  it('throws ValidationError if workspace not running', async () => {
    const workspace = await insertWorkspace({ status: 'stopped' })

    await expect(
      workspaceService.getLogs(workspace.id, workspace.userId),
    ).rejects.toThrow('Workspace is not running')
  })
})