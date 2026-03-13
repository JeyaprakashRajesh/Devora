import type { CoreV1Api, V1PersistentVolumeClaim } from '@kubernetes/client-node'
import type { Logger } from '@devora/logger'
import {
  buildWorkspacePVC,
  pvcName,
  type WorkspacePVCOptions,
} from '../k8s/workspace-pvc.template.js'
import { SandboxInfrastructureUnavailableError } from '../errors.js'
import { getK8sErrorStatusCode } from './pod.service.js'

function isConnectionRefused(error: unknown): boolean {
  const value = error as {
    code?: string
    cause?: { code?: string }
    originalError?: { code?: string }
  }

  return (
    value?.code === 'ECONNREFUSED'
    || value?.cause?.code === 'ECONNREFUSED'
    || value?.originalError?.code === 'ECONNREFUSED'
  )
}

function wrapK8sUnavailable(error: unknown): never {
  if (isConnectionRefused(error)) {
    throw new SandboxInfrastructureUnavailableError(
      'Sandbox infrastructure is unavailable. Kubernetes API is not reachable.',
    )
  }

  throw error
}

export class VolumeService {
  constructor(
    private readonly coreV1Api: CoreV1Api,
    private readonly namespace: string,
    private readonly logger: Logger,
  ) {}

  async create(opts: WorkspacePVCOptions): Promise<V1PersistentVolumeClaim> {
    try {
      const response = await this.coreV1Api.createNamespacedPersistentVolumeClaim(
        this.namespace,
        buildWorkspacePVC(opts),
      )
      return response.body
    } catch (error) {
      wrapK8sUnavailable(error)
    }
  }

  async get(workspaceId: string): Promise<V1PersistentVolumeClaim | null> {
    try {
      const response = await this.coreV1Api.readNamespacedPersistentVolumeClaim(
        pvcName(workspaceId),
        this.namespace,
      )
      return response.body
    } catch (error) {
      if (getK8sErrorStatusCode(error) === 404) {
        return null
      }
      wrapK8sUnavailable(error)
    }
  }

  async delete(workspaceId: string): Promise<void> {
    this.logger.warn({ workspaceId }, 'Deleting workspace persistent volume claim; data will be lost')

    try {
      await this.coreV1Api.deleteNamespacedPersistentVolumeClaim(
        pvcName(workspaceId),
        this.namespace,
      )
    } catch (error) {
      if (getK8sErrorStatusCode(error) === 404) {
        return
      }
      wrapK8sUnavailable(error)
    }
  }

  async exists(workspaceId: string): Promise<boolean> {
    const pvc = await this.get(workspaceId)
    return pvc !== null
  }
}