import {
  createElement,
  createContext,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from 'react'
import axios from 'axios'
import { useNavigate } from '@tanstack/react-router'
import { api } from '../lib/api'
import { useAuthStore } from '../store/auth.store'
import {
  normalizeStatus,
  useWorkspaceStore,
  type WorkspaceSession,
  type WorkspaceState,
  type WorkspaceStatus,
} from '../store/workspace.store'

const POLL_INTERVAL_MS = 3_000
const STARTUP_TIMEOUT_MS = 120_000
const HEARTBEAT_INTERVAL_MS = 60_000

type WorkspaceActions = {
  openWorkspace: () => Promise<void>
  stopWorkspace: () => Promise<void>
  restartWorkspace: () => Promise<void>
}

type UseWorkspaceResult = WorkspaceActions & {
  workspaceId: string | null
  status: WorkspaceState['status']
  proxyUrl: string | null
  errorMessage: string | null
  isLoading: boolean
  isRunning: boolean
}

const WorkspaceActionsContext = createContext<WorkspaceActions | null>(null)

function buildProxyPath(workspaceId: string): string {
  return `/api/sandbox/workspaces/${workspaceId}/connect`
}

function extractErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const apiMessage = typeof error.response?.data?.message === 'string'
      ? error.response.data.message
      : null

    return apiMessage ?? fallback
  }

  if (error instanceof Error && error.message) {
    return error.message
  }

  return fallback
}

function applyWorkspaceStatus(workspaceStatus: WorkspaceStatus): void {
  const store = useWorkspaceStore.getState()
  const nextStatus = normalizeStatus(workspaceStatus.status)

  store.setStatus(workspaceStatus)

  if (workspaceStatus.podPhase === 'Failed') {
    store.setError('Workspace failed to start. Please try again.')
    return
  }

  if (workspaceStatus.containersReady || nextStatus === 'running') {
    useWorkspaceStore.setState({
      status: 'running',
      podPhase: workspaceStatus.podPhase,
      containersReady: true,
      proxyPath: buildProxyPath(workspaceStatus.workspaceId),
      errorMessage: null,
    })
    return
  }

  if (nextStatus === 'stopped') {
    useWorkspaceStore.setState({ proxyPath: null, errorMessage: null })
    return
  }

  if (!useWorkspaceStore.getState().proxyPath && nextStatus !== 'error') {
    useWorkspaceStore.setState({ proxyPath: buildProxyPath(workspaceStatus.workspaceId) })
  }
}

export function WorkspaceActionsProvider({
  value,
  children,
}: {
  value: WorkspaceActions
  children: ReactNode
}) {
  return createElement(WorkspaceActionsContext.Provider, { value }, children)
}

export function useWorkspaceActions(): WorkspaceActions {
  const context = useContext(WorkspaceActionsContext)

  if (!context) {
    throw new Error('useWorkspaceActions must be used within WorkspaceActionsProvider')
  }

  return context
}

export function useWorkspace(projectId?: string): UseWorkspaceResult {
  const navigate = useNavigate()
  const authToken = useAuthStore((state) => state.token)
  const workspaceId = useWorkspaceStore((state) => state.workspaceId)
  const status = useWorkspaceStore((state) => state.status)
  const proxyPath = useWorkspaceStore((state) => state.proxyPath)
  const errorMessage = useWorkspaceStore((state) => state.errorMessage)
  const pollingIntervalRef = useRef<number | null>(null)
  const heartbeatIntervalRef = useRef<number | null>(null)
  const pollingStartedAtRef = useRef<number | null>(null)
  const pollingRequestInFlightRef = useRef(false)
  const heartbeatRequestInFlightRef = useRef(false)

  const clearPolling = () => {
    if (pollingIntervalRef.current !== null) {
      window.clearInterval(pollingIntervalRef.current)
      pollingIntervalRef.current = null
    }

    pollingStartedAtRef.current = null
    pollingRequestInFlightRef.current = false
  }

  const clearHeartbeat = () => {
    if (heartbeatIntervalRef.current !== null) {
      window.clearInterval(heartbeatIntervalRef.current)
      heartbeatIntervalRef.current = null
    }

    heartbeatRequestInFlightRef.current = false
  }

  const pollWorkspaceStatus = async (nextWorkspaceId: string) => {
    if (pollingRequestInFlightRef.current) {
      return
    }

    if (
      pollingStartedAtRef.current !== null
      && Date.now() - pollingStartedAtRef.current >= STARTUP_TIMEOUT_MS
    ) {
      clearPolling()
      useWorkspaceStore.getState().setError('Workspace is taking too long to start.')
      return
    }

    pollingRequestInFlightRef.current = true

    try {
      const response = await api.get<WorkspaceStatus>(
        `/api/sandbox/workspaces/${nextWorkspaceId}`,
      )

      applyWorkspaceStatus(response.data)

      const resolvedStatus = useWorkspaceStore.getState().status
      if (resolvedStatus === 'running' || resolvedStatus === 'error') {
        clearPolling()
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 404) {
          clearPolling()
          useWorkspaceStore.getState().setError('Workspace no longer exists.')
          return
        }

        if (error.response?.status === 401) {
          clearPolling()
          clearHeartbeat()
          await navigate({ to: '/login' })
          return
        }
      }

      clearPolling()
      useWorkspaceStore.getState().setError(
        extractErrorMessage(error, 'Unable to check workspace status.'),
      )
    } finally {
      pollingRequestInFlightRef.current = false
    }
  }

  const startPolling = (nextWorkspaceId: string) => {
    if (pollingIntervalRef.current !== null) {
      return
    }

    if (pollingStartedAtRef.current === null) {
      pollingStartedAtRef.current = Date.now()
    }

    void pollWorkspaceStatus(nextWorkspaceId)

    pollingIntervalRef.current = window.setInterval(() => {
      void pollWorkspaceStatus(nextWorkspaceId)
    }, POLL_INTERVAL_MS)
  }

  const sendHeartbeat = async (nextWorkspaceId: string) => {
    if (heartbeatRequestInFlightRef.current) {
      return
    }

    heartbeatRequestInFlightRef.current = true

    try {
      await api.post(`/api/sandbox/workspaces/${nextWorkspaceId}/heartbeat`)
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 404) {
          clearHeartbeat()
          useWorkspaceStore.getState().setError('Workspace no longer exists.')
          return
        }

        if (error.response?.status === 401) {
          clearHeartbeat()
          await navigate({ to: '/login' })
          return
        }
      }

      clearHeartbeat()
      useWorkspaceStore.getState().setError(
        extractErrorMessage(error, 'Unable to reach the workspace.'),
      )
    } finally {
      heartbeatRequestInFlightRef.current = false
    }
  }

  const startHeartbeat = (nextWorkspaceId: string) => {
    if (heartbeatIntervalRef.current !== null) {
      return
    }

    heartbeatIntervalRef.current = window.setInterval(() => {
      void sendHeartbeat(nextWorkspaceId)
    }, HEARTBEAT_INTERVAL_MS)
  }

  useEffect(() => {
    if (!workspaceId) {
      clearPolling()
      clearHeartbeat()
      return
    }

    if (status === 'running') {
      clearPolling()
      startHeartbeat(workspaceId)
      return
    }

    if (status === 'provisioning' || status === 'starting') {
      clearHeartbeat()
      startPolling(workspaceId)
      return
    }

    clearPolling()
    clearHeartbeat()
  }, [status, workspaceId])

  useEffect(() => () => {
    clearPolling()
    clearHeartbeat()
  }, [])

  const openWorkspace = async () => {
    clearPolling()
    clearHeartbeat()

    useWorkspaceStore.setState({
      status: 'provisioning',
      podPhase: null,
      containersReady: false,
      proxyPath: null,
      errorMessage: null,
      cpu: null,
      memory: null,
    })

    try {
      const response = await api.post<WorkspaceSession>('/api/sandbox/workspaces', projectId
        ? { projectId }
        : {})

      useWorkspaceStore.getState().setWorkspace(response.data)
      useWorkspaceStore.setState({
        proxyPath: response.data.proxyPath,
        podPhase: response.data.status === 'running' ? 'Running' : 'Pending',
        containersReady: response.data.status === 'running',
      })

      if (response.data.status === 'starting') {
        pollingStartedAtRef.current = Date.now()
      }
    } catch (error) {
      useWorkspaceStore.getState().setError(
        extractErrorMessage(error, 'Unable to open a workspace right now.'),
      )
    }
  }

  const stopWorkspace = async () => {
    const activeWorkspaceId = useWorkspaceStore.getState().workspaceId
    if (!activeWorkspaceId) {
      return
    }

    clearPolling()
    clearHeartbeat()

    try {
      await api.post(`/api/sandbox/workspaces/${activeWorkspaceId}/stop`)
      useWorkspaceStore.setState({
        status: 'stopped',
        podPhase: null,
        containersReady: false,
        proxyPath: null,
        errorMessage: null,
        cpu: null,
        memory: null,
      })
    } catch (error) {
      useWorkspaceStore.getState().setError(
        extractErrorMessage(error, 'Unable to stop the workspace.'),
      )
    }
  }

  const restartWorkspace = async () => {
    await stopWorkspace()
    await new Promise((resolve) => window.setTimeout(resolve, 1_000))
    await openWorkspace()
  }

  return {
    workspaceId,
    status,
    proxyUrl: proxyPath
      ? `${import.meta.env.VITE_API_URL ?? ''}${proxyPath}?token=${encodeURIComponent(authToken ?? '')}`
      : null,
    errorMessage,
    isLoading: status === 'provisioning' || status === 'starting',
    isRunning: status === 'running',
    openWorkspace,
    stopWorkspace,
    restartWorkspace,
  }
}