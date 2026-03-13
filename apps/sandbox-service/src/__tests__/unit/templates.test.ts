import { describe, expect, it } from 'vitest'
import {
  agentServiceName,
  buildWorkspacePod,
  podName,
  pvcName,
  type WorkspacePodOptions,
} from '../../k8s/workspace-pod.template.js'
import {
  buildWorkspacePVC,
  type WorkspacePVCOptions,
} from '../../k8s/workspace-pvc.template.js'

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

const basePvcOpts: WorkspacePVCOptions = {
  pvcName: pvcName('abc123'),
  workspaceId: 'abc123',
  userId: 'user-456',
  orgId: 'org-789',
  namespace: 'devora-sandboxes',
  storageSize: '10Gi',
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
  })

  it('annotation created-at is a valid ISO 8601 timestamp', () => {
    const result = buildWorkspacePod(baseOpts)
    const ts = result.metadata?.annotations?.['devora.io/created-at']
    expect(ts).toBeDefined()
    expect(new Date(ts!).toISOString()).toBe(ts)
  })

  it('sets restartPolicy to Never not Always or OnFailure', () => {
    const result = buildWorkspacePod(baseOpts)
    expect(result.spec?.restartPolicy).toBe('Never')
  })

  it('terminationGracePeriodSeconds is exactly 30', () => {
    const result = buildWorkspacePod(baseOpts)
    expect(result.spec?.terminationGracePeriodSeconds).toBe(30)
  })

  it('does not set hostNetwork, hostPID, or hostIPC', () => {
    const result = buildWorkspacePod(baseOpts)
    expect(result.spec?.hostNetwork).toBeFalsy()
    expect(result.spec?.hostPID).toBeFalsy()
    expect(result.spec?.hostIPC).toBeFalsy()
  })

  it('nodeSelector targets devora.io/role === sandbox', () => {
    const result = buildWorkspacePod(baseOpts)
    expect(result.spec?.nodeSelector?.['devora.io/role']).toBe('sandbox')
    expect(result.spec?.nodeSelector?.['kubernetes.io/role']).toBeUndefined()
  })

  it('sets correct pod-level security context', () => {
    const result = buildWorkspacePod(baseOpts)
    expect(result.spec?.securityContext?.runAsUser).toBe(1000)
    expect(result.spec?.securityContext?.runAsGroup).toBe(1000)
    expect(result.spec?.securityContext?.fsGroup).toBe(1000)
    expect(result.spec?.securityContext?.runAsNonRoot).toBe(true)
  })

  it('drops ALL linux capabilities', () => {
    const result = buildWorkspacePod(baseOpts)
    const caps = result.spec?.containers?.[0]?.securityContext?.capabilities
    expect(caps?.drop).toEqual(['ALL'])
    expect(caps?.add).toBeUndefined()
  })

  it('imagePullPolicy is IfNotPresent', () => {
    const result = buildWorkspacePod(baseOpts)
    expect(result.spec?.containers?.[0]?.imagePullPolicy).toBe('IfNotPresent')
  })

  it('livenessProbe initialDelaySeconds is greater than readinessProbe', () => {
    const result = buildWorkspacePod(baseOpts)
    const container = result.spec?.containers?.[0]
    const readinessDelay = container?.readinessProbe?.initialDelaySeconds ?? 0
    const livenessDelay = container?.livenessProbe?.initialDelaySeconds ?? 0
    expect(livenessDelay).toBeGreaterThan(readinessDelay)
  })

  it('both probes target port 8080', () => {
    const result = buildWorkspacePod(baseOpts)
    const container = result.spec?.containers?.[0]
    expect(container?.readinessProbe?.httpGet?.port).toBe(8080)
    expect(container?.livenessProbe?.httpGet?.port).toBe(8080)
  })

  it('volume mount for workspace-data is not readOnly', () => {
    const result = buildWorkspacePod(baseOpts)
    const mount = result.spec?.containers?.[0]?.volumeMounts?.find(
      (m) => m.name === 'workspace-data',
    )
    expect(mount).toBeDefined()
    expect(mount?.readOnly).not.toBe(true)
  })

  it('tmp volume uses emptyDir not hostPath', () => {
    const result = buildWorkspacePod(baseOpts)
    const vol = result.spec?.volumes?.find((v) => v.name === 'tmp')
    expect(vol?.emptyDir).toBeDefined()
    expect(vol?.hostPath).toBeUndefined()
  })

  it('sets correct image', () => {
    const result = buildWorkspacePod(baseOpts)
    expect(result.spec?.containers?.[0]?.image).toBe(baseOpts.image)
  })

  it('sets correct cpu and memory resources', () => {
    const result = buildWorkspacePod(baseOpts)
    const resources = result.spec?.containers?.[0]?.resources
    expect(resources?.limits?.cpu).toBe(baseOpts.cpuLimit)
    expect(resources?.limits?.memory).toBe(baseOpts.memoryLimit)
    expect(resources?.requests?.cpu).toBe(baseOpts.cpuRequest)
    expect(resources?.requests?.memory).toBe(baseOpts.memoryRequest)
  })

  it('injects correct env vars for workspace identity', () => {
    const result = buildWorkspacePod(baseOpts)
    const env = getEnvMap(result.spec?.containers?.[0]?.env)
    expect(env.DEVORA_USER_ID).toBe(baseOpts.userId)
    expect(env.DEVORA_ORG_ID).toBe(baseOpts.orgId)
    expect(env.DEVORA_WORKSPACE_ID).toBe(baseOpts.workspaceId)
    expect(env.OLLAMA_URL).toBe(baseOpts.ollamaUrl)
    expect(env.PLATFORM_API_URL).toBe(baseOpts.platformApiUrl)
  })

  it('container exposes port 8080 for IDE', () => {
    const result = buildWorkspacePod(baseOpts)
    const ports = result.spec?.containers?.[0]?.ports ?? []
    expect(ports.some((p) => p.containerPort === 8080)).toBe(true)
  })

  it('container security context disallows privilege escalation', () => {
    const result = buildWorkspacePod(baseOpts)
    const sc = result.spec?.containers?.[0]?.securityContext
    expect(sc?.allowPrivilegeEscalation).toBe(false)
    expect(sc?.runAsNonRoot).toBe(true)
  })
})

describe('buildWorkspacePVC()', () => {
  it('returns a PVC with correct name and namespace', () => {
    const result = buildWorkspacePVC(basePvcOpts)
    expect(result.metadata?.name).toBe(basePvcOpts.pvcName)
    expect(result.metadata?.namespace).toBe(basePvcOpts.namespace)
  })

  it('sets storage request from options', () => {
    const result = buildWorkspacePVC(basePvcOpts)
    expect(result.spec?.resources?.requests?.storage).toBe(basePvcOpts.storageSize)
  })

  it('accessModes contains exactly one entry', () => {
    const result = buildWorkspacePVC(basePvcOpts)
    expect(result.spec?.accessModes?.length).toBe(1)
  })

  it('does not set volumeMode (defaults to Filesystem)', () => {
    const result = buildWorkspacePVC(basePvcOpts)
    expect(result.spec?.volumeMode).toBeUndefined()
  })

  it('sets storageClassName from options', () => {
    const result = buildWorkspacePVC(basePvcOpts)
    expect(result.spec?.storageClassName).toBe(basePvcOpts.storageClass)
  })

  it('labels match pod labels for same workspaceId', () => {
    const pod = buildWorkspacePod(baseOpts)
    const pvc = buildWorkspacePVC(basePvcOpts)
    expect(pod.metadata?.labels?.['devora.io/workspace-id']).toBe(
      pvc.metadata?.labels?.['devora.io/workspace-id'],
    )
  })

  it('sets devora labels', () => {
    const result = buildWorkspacePVC(basePvcOpts)
    expect(result.metadata?.labels?.['devora.io/workspace-id']).toBe(basePvcOpts.workspaceId)
    expect(result.metadata?.labels?.['devora.io/user-id']).toBe(basePvcOpts.userId)
    expect(result.metadata?.labels?.['devora.io/org-id']).toBe(basePvcOpts.orgId)
  })
})

describe('naming helpers', () => {
  it('podName output always starts with ws-', () => {
    expect(podName('any-id')).toMatch(/^ws-/)
  })

  it('pvcName output always starts with pvc-', () => {
    expect(pvcName('any-id')).toMatch(/^pvc-/)
  })

  it('agentServiceName output always starts with agent-', () => {
    expect(agentServiceName('any-id')).toMatch(/^agent-/)
  })

  it('podName is deterministic — same input same output', () => {
    expect(podName('abc')).toBe(podName('abc'))
  })

  it('pvcName uses same workspaceId as podName input', () => {
    const id = 'test-workspace-id'
    expect(pvcName(id)).toBe(`pvc-${id}`)
    expect(podName(id)).toBe(`ws-${id}`)
  })

  it('different workspaceIds produce different podNames', () => {
    expect(podName('id-1')).not.toBe(podName('id-2'))
  })
})
