import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CoreV1Api } from '@kubernetes/client-node'
import { VolumeService } from '../../services/volume.service.js'
import { pvcName } from '../../k8s/workspace-pvc.template.js'
import type { Logger } from '@devora/logger'
import type { WorkspacePVCOptions } from '../../k8s/workspace-pvc.template.js'

const TEST_NAMESPACE = 'devora-sandboxes'
const TEST_WS_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

function makePvcResponse(workspaceId: string) {
  return {
    body: {
      metadata: { name: pvcName(workspaceId) },
      status: { phase: 'Bound' },
      spec: { storageClassName: 'standard', resources: { requests: { storage: '10Gi' } } },
    },
  }
}

function makeK8sError(statusCode: number) {
  return { response: { statusCode }, statusCode }
}

function makeLogger(): Logger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn(),
  } as unknown as Logger
}

const baseCreateOpts: WorkspacePVCOptions = {
  pvcName: pvcName(TEST_WS_ID),
  workspaceId: TEST_WS_ID,
  userId: 'user-test',
  orgId: 'org-test',
  storageSize: '10Gi',
  storageClass: 'standard',
  namespace: TEST_NAMESPACE,
}

let coreV1Api: Partial<CoreV1Api>
let volumeService: VolumeService

beforeEach(() => {
  coreV1Api = {
    createNamespacedPersistentVolumeClaim: vi.fn(async () => makePvcResponse(TEST_WS_ID)),
    readNamespacedPersistentVolumeClaim: vi.fn(async () => makePvcResponse(TEST_WS_ID)),
    deleteNamespacedPersistentVolumeClaim: vi.fn(async () => ({ body: {} })),
  }
  volumeService = new VolumeService(coreV1Api as CoreV1Api, TEST_NAMESPACE, makeLogger())
})

// ── create() ─────────────────────────────────────────────────────────────────

describe('VolumeService.create()', () => {
  it('calls coreV1Api.createNamespacedPersistentVolumeClaim with namespace', async () => {
    await volumeService.create(baseCreateOpts)
    expect(coreV1Api.createNamespacedPersistentVolumeClaim).toHaveBeenCalledWith(
      TEST_NAMESPACE,
      expect.any(Object),
    )
  })

  it('returns the created PVC from K8s response', async () => {
    const result = await volumeService.create(baseCreateOpts)
    expect(result.metadata?.name).toBe(pvcName(TEST_WS_ID))
  })

  it('throws if K8s returns 409 (PVC already exists)', async () => {
    (coreV1Api.createNamespacedPersistentVolumeClaim as ReturnType<typeof vi.fn>).mockRejectedValue(
      makeK8sError(409),
    )
    await expect(volumeService.create(baseCreateOpts)).rejects.toMatchObject(
      expect.objectContaining({ statusCode: 409 }),
    )
  })
})

// ── get() ─────────────────────────────────────────────────────────────────────

describe('VolumeService.get()', () => {
  it('returns PVC when found', async () => {
    const result = await volumeService.get(TEST_WS_ID)
    expect(result).not.toBeNull()
    expect(result?.metadata?.name).toBe(pvcName(TEST_WS_ID))
  })

  it('returns null when K8s returns 404', async () => {
    (coreV1Api.readNamespacedPersistentVolumeClaim as ReturnType<typeof vi.fn>).mockRejectedValue(
      makeK8sError(404),
    )
    const result = await volumeService.get(TEST_WS_ID)
    expect(result).toBeNull()
  })

  it('rethrows on non-404 K8s errors', async () => {
    (coreV1Api.readNamespacedPersistentVolumeClaim as ReturnType<typeof vi.fn>).mockRejectedValue(
      makeK8sError(503),
    )
    await expect(volumeService.get(TEST_WS_ID)).rejects.toMatchObject(
      expect.objectContaining({ statusCode: 503 }),
    )
  })
})

// ── delete() ─────────────────────────────────────────────────────────────────

describe('VolumeService.delete()', () => {
  it('calls coreV1Api.deleteNamespacedPersistentVolumeClaim with correct name and namespace', async () => {
    await volumeService.delete(TEST_WS_ID)
    expect(coreV1Api.deleteNamespacedPersistentVolumeClaim).toHaveBeenCalledWith(
      pvcName(TEST_WS_ID),
      TEST_NAMESPACE,
    )
  })

  it('does not throw when K8s returns 404', async () => {
    (coreV1Api.deleteNamespacedPersistentVolumeClaim as ReturnType<typeof vi.fn>).mockRejectedValue(
      makeK8sError(404),
    )
    await expect(volumeService.delete(TEST_WS_ID)).resolves.not.toThrow()
  })

  it('throws on non-404 K8s errors', async () => {
    (coreV1Api.deleteNamespacedPersistentVolumeClaim as ReturnType<typeof vi.fn>).mockRejectedValue(
      makeK8sError(403),
    )
    await expect(volumeService.delete(TEST_WS_ID)).rejects.toMatchObject(
      expect.objectContaining({ statusCode: 403 }),
    )
  })
})

// ── exists() ─────────────────────────────────────────────────────────────────

describe('VolumeService.exists()', () => {
  it('returns true when PVC is found', async () => {
    expect(await volumeService.exists(TEST_WS_ID)).toBe(true)
  })

  it('returns false when PVC is not found (404)', async () => {
    (coreV1Api.readNamespacedPersistentVolumeClaim as ReturnType<typeof vi.fn>).mockRejectedValue(
      makeK8sError(404),
    )
    expect(await volumeService.exists(TEST_WS_ID)).toBe(false)
  })
})
