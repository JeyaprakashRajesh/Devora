import type { V1Pod } from '@kubernetes/client-node'

export interface WorkspacePodOptions {
  podName: string
  workspaceId: string
  userId: string
  orgId: string
  volumeName: string
  cpuLimit: string
  cpuRequest: string
  memoryLimit: string
  memoryRequest: string
  image: string
  namespace: string
  ollamaUrl: string
  platformApiUrl: string
  storageClass: string
}

export function podName(workspaceId: string): string {
  return `ws-${workspaceId}`
}

export function pvcName(workspaceId: string): string {
  return `pvc-${workspaceId}`
}

export function agentServiceName(workspaceId: string): string {
  return `agent-${workspaceId}`
}

export function buildWorkspacePod(opts: WorkspacePodOptions): V1Pod {
  return {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: {
      name: opts.podName,
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
      restartPolicy: 'Never',
      nodeSelector: {
        'devora.io/role': 'sandbox',
      },
      terminationGracePeriodSeconds: 30,
      securityContext: {
        runAsUser: 1000,
        runAsGroup: 1000,
        fsGroup: 1000,
        runAsNonRoot: true,
      },
      containers: [
        {
          name: 'workspace',
          image: opts.image,
          imagePullPolicy: 'IfNotPresent',
          ports: [
            {
              containerPort: 8080,
              name: 'ide',
              protocol: 'TCP',
            },
            {
              containerPort: 9090,
              name: 'agent',
              protocol: 'TCP',
            },
          ],
          resources: {
            limits: {
              cpu: opts.cpuLimit,
              memory: opts.memoryLimit,
            },
            requests: {
              cpu: opts.cpuRequest,
              memory: opts.memoryRequest,
            },
          },
          securityContext: {
            allowPrivilegeEscalation: false,
            runAsNonRoot: true,
            readOnlyRootFilesystem: false,
            seccompProfile: {
              type: 'RuntimeDefault',
            },
            capabilities: {
              drop: ['ALL'],
            },
          },
          env: [
            {
              name: 'OLLAMA_URL',
              value: opts.ollamaUrl,
            },
            {
              name: 'PLATFORM_API_URL',
              value: opts.platformApiUrl,
            },
            {
              name: 'DEVORA_USER_ID',
              value: opts.userId,
            },
            {
              name: 'DEVORA_ORG_ID',
              value: opts.orgId,
            },
            {
              name: 'DEVORA_WORKSPACE_ID',
              value: opts.workspaceId,
            },
          ],
          volumeMounts: [
            {
              name: 'workspace-data',
              mountPath: '/workspace',
            },
            {
              name: 'tmp',
              mountPath: '/tmp',
            },
          ],
          readinessProbe: {
            httpGet: {
              path: '/healthz',
              port: 8080,
            },
            initialDelaySeconds: 5,
            periodSeconds: 5,
            failureThreshold: 6,
            successThreshold: 1,
          },
          livenessProbe: {
            httpGet: {
              path: '/healthz',
              port: 8080,
            },
            initialDelaySeconds: 30,
            periodSeconds: 15,
            failureThreshold: 3,
          },
        },
      ],
      volumes: [
        {
          name: 'workspace-data',
          persistentVolumeClaim: {
            claimName: opts.volumeName,
            readOnly: false,
          },
        },
        {
          name: 'tmp',
          emptyDir: {},
        },
      ],
    },
  }
}