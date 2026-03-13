import type { V1PersistentVolumeClaim } from '@kubernetes/client-node'

export { pvcName } from './workspace-pod.template.js'

export interface WorkspacePVCOptions {
  pvcName: string
  workspaceId: string
  userId: string
  orgId: string
  namespace: string
  storageSize: string
  storageClass: string
}

export function buildWorkspacePVC(
  opts: WorkspacePVCOptions,
): V1PersistentVolumeClaim {
  return {
    apiVersion: 'v1',
    kind: 'PersistentVolumeClaim',
    metadata: {
      name: opts.pvcName,
      namespace: opts.namespace,
      labels: {
        app: 'devora-workspace',
        'devora.io/workspace-id': opts.workspaceId,
        'devora.io/user-id': opts.userId,
        'devora.io/org-id': opts.orgId,
      },
      annotations: {
        'devora.io/created-at': new Date().toISOString(),
      },
    },
    spec: {
      accessModes: ['ReadWriteOnce'],
      storageClassName: opts.storageClass,
      resources: {
        requests: {
          storage: opts.storageSize,
        },
      },
    },
  }
}