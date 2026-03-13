export interface SandboxCreatedEvent {
  workspaceId: string
  userId: string
  orgId: string
  projectId?: string
  podName: string
  createdAt: string
}

export interface SandboxStartedEvent {
  workspaceId: string
  userId: string
  orgId: string
  podName: string
  startedAt: string
}

export interface SandboxStoppedEvent {
  workspaceId: string
  userId: string
  orgId: string
  reason: 'manual' | 'idle' | 'error' | 'deleted'
  stoppedAt: string
}

export interface SandboxResourceSpikeEvent {
  workspaceId: string
  userId: string
  orgId: string
  cpu: number
  memory: number
  detectedAt: string
}