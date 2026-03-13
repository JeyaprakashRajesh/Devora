import { describe, expect, it } from 'vitest'
import {
  agentServiceName,
  buildWorkspacePod,
  podName,
  pvcName,
  type WorkspacePodOptions,
} from '../workspace-pod.template.js'
import {
  buildWorkspacePVC,
  type WorkspacePVCOptions,
} from '../workspace-pvc.template.js'

const baseOpts: WorkspacePodOptions = {
  podName: podName('abc123'),
  workspaceId: 'abc123',
  userId: 'user-456',
  orgId: 'org-789',
  volumeName: pvcName('abc123'),
  cpuLimit: '2',
  cpuRequest: '100m',
  memoryLimit: '2Gi',
  memoryRequest: '256Mi',
  image: 'devora/workspace:latest',
  namespace: 'devora-sandboxes',
  ollamaUrl: 'http://ollama:11434',
  platformApiUrl: 'http://gateway:4000',
  storageClass: 'standard',
}

function getEnvMap(env: { name?: string; value?: string }[] = []) {
  return Object.fromEntries(env.map((entry) => [entry.name, entry.value]))
}

describe('buildWorkspacePod()', () => {
  it('returns a valid V1Pod object', () => {
    const result = buildWorkspacePod(baseOpts)

    expect(result.apiVersion).toBe('v1')
    expect(result.kind).toBe('Pod')
    expect(result.metadata).toBeDefined()
  })

  it('sets correct metadata', () => {
    const result = buildWorkspacePod(baseOpts)

    expect(result.metadata?.name).toBe(baseOpts.podName)
    expect(result.metadata?.namespace).toBe(baseOpts.namespace)
    expect(result.metadata?.labels?.['devora.io/workspace-id']).toBe(baseOpts.workspaceId)
    expect(result.metadata?.labels?.['devora.io/user-id']).toBe(baseOpts.userId)
    expect(result.metadata?.labels?.['devora.io/org-id']).toBe(baseOpts.orgId)
    expect(result.metadata?.labels?.app).toBe('devora-workspace')

    const createdAt = result.metadata?.annotations?.['devora.io/created-at']
    expect(createdAt).toBeDefined()
    expect(Number.isNaN(Date.parse(createdAt ?? ''))).toBe(false)
    expect(new Date(createdAt ?? '').toISOString()).toBe(createdAt)
  })

  it('sets restartPolicy to Never', () => {
    const result = buildWorkspacePod(baseOpts)

    expect(result.spec?.restartPolicy).toBe('Never')
  })

  it('schedules only on sandbox nodes', () => {
    const result = buildWorkspacePod(baseOpts)

    expect(result.spec?.nodeSelector?.['devora.io/role']).toBe('sandbox')
  })

  it('sets correct security context', () => {
    const result = buildWorkspacePod(baseOpts)

    expect(result.spec?.securityContext?.runAsUser).toBe(1000)
    expect(result.spec?.securityContext?.runAsGroup).toBe(1000)
    expect(result.spec?.securityContext?.fsGroup).toBe(1000)
    expect(result.spec?.securityContext?.runAsNonRoot).toBe(true)
  })

  it('has exactly one container named workspace', () => {
    const result = buildWorkspacePod(baseOpts)

    expect(result.spec?.containers).toHaveLength(1)
    expect(result.spec?.containers?.[0]?.name).toBe('workspace')
  })

  it('sets correct container image', () => {
    const result = buildWorkspacePod(baseOpts)

    expect(result.spec?.containers?.[0]?.image).toBe(baseOpts.image)
  })

  it('exposes correct ports', () => {
    const result = buildWorkspacePod(baseOpts)
    const ports = result.spec?.containers?.[0]?.ports ?? []

    expect(ports).toContainEqual({ containerPort: 8080, name: 'ide', protocol: 'TCP' })
    expect(ports).toContainEqual({ containerPort: 9090, name: 'agent', protocol: 'TCP' })
  })

  it('sets resource limits and requests correctly', () => {
    const result = buildWorkspacePod(baseOpts)
    const resources = result.spec?.containers?.[0]?.resources

    expect(resources?.limits?.cpu).toBe(baseOpts.cpuLimit)
    expect(resources?.limits?.memory).toBe(baseOpts.memoryLimit)
    expect(resources?.requests?.cpu).toBe(baseOpts.cpuRequest)
    expect(resources?.requests?.memory).toBe(baseOpts.memoryRequest)
  })

  it('sets all required environment variables', () => {
    const result = buildWorkspacePod(baseOpts)
    const env = getEnvMap(result.spec?.containers?.[0]?.env)

    expect(env.OLLAMA_URL).toBe(baseOpts.ollamaUrl)
    expect(env.PLATFORM_API_URL).toBe(baseOpts.platformApiUrl)
    expect(env.DEVORA_USER_ID).toBe(baseOpts.userId)
    expect(env.DEVORA_ORG_ID).toBe(baseOpts.orgId)
    expect(env.DEVORA_WORKSPACE_ID).toBe(baseOpts.workspaceId)
  })

  it('mounts workspace-data volume to /workspace', () => {
    const result = buildWorkspacePod(baseOpts)
    const container = result.spec?.containers?.[0]
    const volumes = result.spec?.volumes ?? []

    expect(container?.volumeMounts).toContainEqual({
      name: 'workspace-data',
      mountPath: '/workspace',
    })
    expect(volumes).toContainEqual({
      name: 'workspace-data',
      persistentVolumeClaim: {
        claimName: baseOpts.volumeName,
        readOnly: false,
      },
    })
  })

  it('mounts ephemeral tmp volume', () => {
    const result = buildWorkspacePod(baseOpts)
    const container = result.spec?.containers?.[0]
    const volumes = result.spec?.volumes ?? []

    expect(container?.volumeMounts).toContainEqual({
      name: 'tmp',
      mountPath: '/tmp',
    })
    expect(volumes).toContainEqual({
      name: 'tmp',
      emptyDir: {},
    })
  })

  it('has readinessProbe on /healthz port 8080', () => {
    const result = buildWorkspacePod(baseOpts)
    const readinessProbe = result.spec?.containers?.[0]?.readinessProbe

    expect(readinessProbe?.httpGet?.path).toBe('/healthz')
    expect(readinessProbe?.httpGet?.port).toBe(8080)
    expect(readinessProbe?.initialDelaySeconds).toBe(5)
  })

  it('has livenessProbe on /healthz port 8080', () => {
    const result = buildWorkspacePod(baseOpts)
    const livenessProbe = result.spec?.containers?.[0]?.livenessProbe

    expect(livenessProbe?.httpGet?.path).toBe('/healthz')
    expect(livenessProbe?.httpGet?.port).toBe(8080)
    expect(livenessProbe?.initialDelaySeconds).toBe(30)
  })

  it('drops ALL capabilities', () => {
    const result = buildWorkspacePod(baseOpts)
    const securityContext = result.spec?.containers?.[0]?.securityContext

    expect(securityContext?.capabilities?.drop).toContain('ALL')
  })

  it('does not set readOnlyRootFilesystem to true', () => {
    const result = buildWorkspacePod(baseOpts)
    const securityContext = result.spec?.containers?.[0]?.securityContext

    expect(securityContext?.readOnlyRootFilesystem).toBe(false)
  })

  it('sets terminationGracePeriodSeconds to 30', () => {
    const result = buildWorkspacePod(baseOpts)

    expect(result.spec?.terminationGracePeriodSeconds).toBe(30)
  })
})

describe('buildWorkspacePVC()', () => {
  const pvcOpts: WorkspacePVCOptions = {
    pvcName: pvcName('abc123'),
    workspaceId: 'abc123',
    userId: 'user-456',
    orgId: 'org-789',
    namespace: 'devora-sandboxes',
    storageSize: '10Gi',
    storageClass: 'standard',
  }

  it('returns a valid V1PersistentVolumeClaim', () => {
    const result = buildWorkspacePVC(pvcOpts)

    expect(result.apiVersion).toBe('v1')
    expect(result.kind).toBe('PersistentVolumeClaim')
  })

  it('sets correct metadata labels', () => {
    const result = buildWorkspacePVC(pvcOpts)

    expect(result.metadata?.labels?.['devora.io/workspace-id']).toBe(pvcOpts.workspaceId)
    expect(result.metadata?.labels?.['devora.io/user-id']).toBe(pvcOpts.userId)
  })

  it('sets accessMode to ReadWriteOnce', () => {
    const result = buildWorkspacePVC(pvcOpts)

    expect(result.spec?.accessModes).toContain('ReadWriteOnce')
    expect(result.spec?.accessModes).toHaveLength(1)
  })

  it('sets correct storageClassName', () => {
    const result = buildWorkspacePVC(pvcOpts)

    expect(result.spec?.storageClassName).toBe(pvcOpts.storageClass)
  })

  it('requests correct storage size', () => {
    const result = buildWorkspacePVC(pvcOpts)

    expect(result.spec?.resources?.requests?.storage).toBe(pvcOpts.storageSize)
  })

  it('uses namespace from opts', () => {
    const result = buildWorkspacePVC(pvcOpts)

    expect(result.metadata?.namespace).toBe(pvcOpts.namespace)
  })
})

describe('naming helpers', () => {
  it('podName() returns ws-{id}', () => {
    expect(podName('abc123')).toBe('ws-abc123')
  })

  it('pvcName() returns pvc-{id}', () => {
    expect(pvcName('abc123')).toBe('pvc-abc123')
  })

  it('agentServiceName() returns agent-{id}', () => {
    expect(agentServiceName('abc123')).toBe('agent-abc123')
  })
})