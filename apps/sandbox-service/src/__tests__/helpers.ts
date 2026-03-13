/**
 * Shared test utilities for sandbox-service tests.
 */
import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { vi } from 'vitest'
import type { V1Pod, V1PersistentVolumeClaim } from '@kubernetes/client-node'
import { JSONCodec, type NatsConnection } from 'nats'
import { schema, type Db } from '@devora/db'
import type { JwtPayload } from '@devora/types'
import type { Logger } from '@devora/logger'
import {
  podName,
  pvcName,
} from '../k8s/workspace-pod.template.js'
import type { PodService } from '../services/pod.service.js'
import type { VolumeService } from '../services/volume.service.js'

const { workspaces } = schema
const jc = JSONCodec()

// ─── Database ────────────────────────────────────────────────────────────────

export const SANDBOX_TEST_URL =
  process.env.SANDBOX_TEST_URL
  ?? 'postgresql://devora:devora_dev@localhost:5436/devora_sandbox_test'

let _pool: Pool | null = null
let _db: Db | null = null

export function getTestDb(): Db {
  if (!_db) {
    _pool = new Pool({ connectionString: SANDBOX_TEST_URL })
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

export async function truncateTables(db: Db = getTestDb()): Promise<void> {
  const pool = new Pool({ connectionString: SANDBOX_TEST_URL })
  try {
    await pool.query('TRUNCATE TABLE workspaces RESTART IDENTITY CASCADE')
  } finally {
    await pool.end()
  }
}

export async function seedWorkspace(
  db: Db,
  overrides: Partial<typeof workspaces.$inferInsert> = {},
): Promise<typeof workspaces.$inferSelect> {
  const [workspace] = await db
    .insert(workspaces)
    .values({
      id: randomUUID(),
      userId: '11111111-1111-1111-1111-111111111111',
      orgId: '22222222-2222-2222-2222-222222222222',
      projectId: null,
      name: 'workspace-test',
      status: 'stopped',
      podName: null,
      volumeName: null,
      cpuLimit: '2',
      memoryLimit: '2Gi',
      lastActiveAt: new Date(),
      ...overrides,
    })
    .returning()
  return workspace
}

// ─── Mock factories ───────────────────────────────────────────────────────────

export function fakePod(workspaceId: string, phase = 'Running'): V1Pod {
  return {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: {
      name: podName(workspaceId),
      namespace: 'devora-sandboxes',
      labels: {
        app: 'devora-workspace',
        'devora.io/workspace-id': workspaceId,
        'devora.io/user-id': 'user-test',
        'devora.io/org-id': 'org-test',
      },
    },
    status: {
      phase,
      podIP: '10.0.0.100',
      containerStatuses: [
        {
          name: 'workspace',
          ready: phase === 'Running',
          restartCount: 0,
          image: 'devora/workspace:latest',
          imageID: '',
          started: phase === 'Running',
        },
      ],
    },
  }
}

export function fakePVC(workspaceId: string): V1PersistentVolumeClaim {
  return {
    apiVersion: 'v1',
    kind: 'PersistentVolumeClaim',
    metadata: {
      name: pvcName(workspaceId),
      namespace: 'devora-sandboxes',
      labels: {
        'devora.io/workspace-id': workspaceId,
      },
    },
    spec: {
      accessModes: ['ReadWriteOnce'],
      resources: { requests: { storage: '10Gi' } },
    },
    status: {
      phase: 'Bound',
    },
  }
}

export type PodServiceMock = {
  [K in keyof PodService]: ReturnType<typeof vi.fn>
}

export function createMockPodService(workspaceId?: string): PodServiceMock {
  const id = workspaceId ?? randomUUID()
  return {
    create: vi.fn(async (opts) => fakePod(opts.workspaceId ?? id)),
    get: vi.fn(async () => null),
    delete: vi.fn(async () => undefined),
    getPhase: vi.fn(async () => null),
    waitUntilReady: vi.fn(async () => undefined),
    listByOrg: vi.fn(async () => []),
    getLogs: vi.fn(async () => 'log line 1\nlog line 2\n'),
  }
}

export type VolumeServiceMock = {
  [K in keyof VolumeService]: ReturnType<typeof vi.fn>
}

export function createMockVolumeService(workspaceId?: string): VolumeServiceMock {
  const id = workspaceId ?? randomUUID()
  return {
    create: vi.fn(async (opts) => fakePVC(opts.workspaceId ?? id)),
    get: vi.fn(async () => null),
    delete: vi.fn(async () => undefined),
    exists: vi.fn(async () => false),
  }
}

export function createMockNats(): { publish: ReturnType<typeof vi.fn> } & Pick<NatsConnection, 'subscribe'> {
  return {
    publish: vi.fn(),
    subscribe: vi.fn(() => ({
      [Symbol.asyncIterator]: () => ({ next: async () => ({ done: true, value: undefined }) }),
      unsubscribe: vi.fn(),
      drain: vi.fn(),
      getID: vi.fn(() => 1),
      getSubject: vi.fn(() => ''),
      isClosed: false,
      isDraining: false,
      getReceived: vi.fn(() => 0),
    })),
  } as unknown as { publish: ReturnType<typeof vi.fn> } & Pick<NatsConnection, 'subscribe'>
}

export function makeLogger(): Logger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn(() => makeLogger()),
  } as unknown as Logger
}

// ─── JWT helpers ─────────────────────────────────────────────────────────────

const TEST_JWT_SECRET = 'x'.repeat(32)
const TEST_USER_ID = '11111111-1111-1111-1111-111111111111'
const TEST_ORG_ID = '22222222-2222-2222-2222-222222222222'

/**
 * Sign a test JWT.  Requires the app to be built (app.jwt.sign).
 * Use with buildTestApp() in beforeAll.
 */
export function makeSignJwt(app: FastifyInstance) {
  return (overrides: Partial<JwtPayload> = {}): string => {
    const payload: Partial<JwtPayload> = {
      sub: TEST_USER_ID,
      org: TEST_ORG_ID,
      roles: ['developer'],
      ...overrides,
    }
    return app.jwt.sign(payload as any)
  }
}

export function getAuthHeader(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` }
}

export { TEST_USER_ID, TEST_ORG_ID, TEST_JWT_SECRET, jc }

// ─── Publish decoding ─────────────────────────────────────────────────────────

export function decodePublishCall(
  publishMock: ReturnType<typeof vi.fn>,
  callIndex = 0,
): { subject: string; payload: Record<string, unknown> } {
  const call = publishMock.mock.calls[callIndex]
  return {
    subject: call[0] as string,
    payload: jc.decode(call[1]) as Record<string, unknown>,
  }
}
