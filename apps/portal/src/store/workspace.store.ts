import { create } from 'zustand'

export type WorkspaceLifecycleState =
  | 'idle'
  | 'provisioning'
  | 'starting'
  | 'running'
  | 'stopped'
  | 'error'

export interface WorkspaceSession {
  workspaceId: string
  status: 'starting' | 'running'
  proxyPath: string
  podName: string
}

export interface WorkspaceStatus {
  workspaceId: string
  status: string
  podPhase: string | null
  containersReady: boolean
  cpu: string | null
  memory: string | null
}

export interface WorkspaceState {
  workspaceId: string | null
  status: WorkspaceLifecycleState
  podPhase: string | null
  containersReady: boolean
  proxyPath: string | null
  errorMessage: string | null
  cpu: string | null
  memory: string | null
  setWorkspace: (session: WorkspaceSession) => void
  setStatus: (status: WorkspaceStatus) => void
  setError: (message: string) => void
  reset: () => void
}

const initialState = {
  workspaceId: null,
  status: 'idle' as WorkspaceLifecycleState,
  podPhase: null,
  containersReady: false,
  proxyPath: null,
  errorMessage: null,
  cpu: null,
  memory: null,
}

function normalizeStatus(status: string): WorkspaceLifecycleState {
  switch (status) {
    case 'provisioning':
    case 'starting':
    case 'running':
    case 'stopped':
      return status
    default:
      return 'error'
  }
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  ...initialState,
  setWorkspace: (session) => {
    set({
      workspaceId: session.workspaceId,
      status: session.status,
      podPhase: session.status === 'running' ? 'Running' : 'Pending',
      containersReady: session.status === 'running',
      proxyPath: session.proxyPath,
      errorMessage: null,
      cpu: null,
      memory: null,
    })
  },
  setStatus: (workspaceStatus) => {
    set((state) => ({
      workspaceId: workspaceStatus.workspaceId,
      status: normalizeStatus(workspaceStatus.status),
      podPhase: workspaceStatus.podPhase,
      containersReady: workspaceStatus.containersReady,
      proxyPath:
        normalizeStatus(workspaceStatus.status) === 'stopped'
          ? null
          : state.proxyPath,
      errorMessage:
        normalizeStatus(workspaceStatus.status) === 'error'
          ? state.errorMessage ?? 'Workspace is unavailable.'
          : null,
      cpu: workspaceStatus.cpu,
      memory: workspaceStatus.memory,
    }))
  },
  setError: (message) => {
    set({
      status: 'error',
      errorMessage: message,
      containersReady: false,
      proxyPath: null,
    })
  },
  reset: () => {
    set(initialState)
  },
}))

export { normalizeStatus }