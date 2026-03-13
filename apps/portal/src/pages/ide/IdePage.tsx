import { useEffect, useState } from 'react'
import axios from 'axios'
import { PauseCircle } from 'lucide-react'
import { useNavigate, useParams, useRouterState } from '@tanstack/react-router'
import { Button } from '../../components/ui/Button'
import { api } from '../../lib/api'
import {
  WorkspaceActionsProvider,
  useWorkspace,
} from '../../hooks/useWorkspace'
import {
  normalizeStatus,
  useWorkspaceStore,
  type WorkspaceStatus,
} from '../../store/workspace.store'
import { WorkspaceStatusBar } from '../../components/workspace/WorkspaceStatusBar'
import { WorkspaceLoader } from './WorkspaceLoader'
import { IdeFrame } from './IdeFrame'
import { WorkspaceError } from './WorkspaceError'

function buildProxyPath(workspaceId: string): string {
  return `/api/sandbox/workspaces/${workspaceId}/connect`
}

function WorkspaceWelcome({
  onOpen,
  isLoading,
}: {
  onOpen: () => Promise<void>
  isLoading: boolean
}) {
  return (
    <div className="flex h-full items-center justify-center bg-bg-base px-6">
      <div className="w-full max-w-xl text-center">
        <div className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-2xl border border-border-strong bg-bg-surface text-lg font-semibold text-text-primary shadow-sm">
          D
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-text-primary">
          Your workspace is ready to start
        </h1>
        <p className="mt-3 text-sm text-text-secondary">
          A personal cloud development environment - your code, tools, and AI assistant
        </p>
        <div className="mt-8">
          <Button
            variant="primary"
            size="lg"
            onClick={() => {
              void onOpen()
            }}
            disabled={isLoading}
          >
            Open Workspace
          </Button>
        </div>
        <p className="mt-4 text-xs uppercase tracking-[0.14em] text-text-muted">
          2 vCPU · 2 GB RAM · 10 GB storage
        </p>
      </div>
    </div>
  )
}

function WorkspaceStopped({
  onRestart,
  isLoading,
}: {
  onRestart: () => Promise<void>
  isLoading: boolean
}) {
  return (
    <div className="flex h-full items-center justify-center bg-bg-base px-6">
      <div className="w-full max-w-lg text-center">
        <PauseCircle className="mx-auto h-14 w-14 text-text-secondary" />
        <h1 className="mt-5 text-3xl font-semibold tracking-tight text-text-primary">
          Workspace stopped
        </h1>
        <p className="mt-3 text-sm text-text-secondary">
          Your files are preserved. Start your workspace to continue.
        </p>
        <div className="mt-8">
          <Button
            variant="primary"
            size="lg"
            onClick={() => {
              void onRestart()
            }}
            disabled={isLoading}
          >
            Restart Workspace
          </Button>
        </div>
      </div>
    </div>
  )
}

export function IdePage() {
  const navigate = useNavigate()
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const params = useParams({ strict: false }) as { workspaceId?: string }
  const routeWorkspaceId = params.workspaceId ?? null
  const {
    workspaceId,
    status,
    proxyUrl,
    errorMessage,
    isLoading,
    openWorkspace,
    restartWorkspace,
    stopWorkspace,
  } = useWorkspace()
  const podPhase = useWorkspaceStore((state) => state.podPhase)
  const [isResolvingExistingWorkspace, setIsResolvingExistingWorkspace] = useState(
    routeWorkspaceId !== null,
  )

  useEffect(() => {
    let isCancelled = false

    if (!routeWorkspaceId) {
      setIsResolvingExistingWorkspace(false)
      return () => {
        isCancelled = true
      }
    }

    const loadWorkspace = async () => {
      setIsResolvingExistingWorkspace(true)

      try {
        const response = await api.get<WorkspaceStatus>(
          `/api/sandbox/workspaces/${routeWorkspaceId}`,
        )

        if (isCancelled) {
          return
        }

        const nextStatus = normalizeStatus(response.data.status)

        useWorkspaceStore.setState({
          workspaceId: response.data.workspaceId,
          proxyPath: nextStatus === 'stopped' ? null : buildProxyPath(response.data.workspaceId),
          errorMessage: null,
        })
        useWorkspaceStore.getState().setStatus(response.data)

        if (response.data.containersReady || nextStatus === 'running') {
          useWorkspaceStore.setState({
            status: 'running',
            containersReady: true,
            podPhase: response.data.podPhase,
            proxyPath: buildProxyPath(response.data.workspaceId),
          })
        }

        if (nextStatus === 'error') {
          useWorkspaceStore.getState().setError('Workspace is unavailable.')
        }
      } catch (error) {
        if (isCancelled) {
          return
        }

        useWorkspaceStore.setState({ workspaceId: routeWorkspaceId, proxyPath: null })

        if (axios.isAxiosError(error) && error.response?.status === 404) {
          useWorkspaceStore.getState().setError('Workspace not found.')
        } else {
          useWorkspaceStore.getState().setError('Unable to load workspace state.')
        }
      } finally {
        if (!isCancelled) {
          setIsResolvingExistingWorkspace(false)
        }
      }
    }

    void loadWorkspace()

    return () => {
      isCancelled = true
    }
  }, [routeWorkspaceId])

  useEffect(() => {
    if (!workspaceId || routeWorkspaceId || pathname !== '/ide' || status === 'idle') {
      return
    }

    void navigate({
      to: '/ide/$workspaceId',
      params: { workspaceId },
      replace: true,
    })
  }, [navigate, pathname, routeWorkspaceId, status, workspaceId])

  const showLoader = isResolvingExistingWorkspace || status === 'provisioning' || status === 'starting'

  return (
    <WorkspaceActionsProvider
      value={{ openWorkspace, stopWorkspace, restartWorkspace }}
    >
      <div className="flex h-full min-h-0 flex-col bg-bg-base">
        <WorkspaceStatusBar />
        <main className="relative flex-1 overflow-hidden">
          {showLoader ? <WorkspaceLoader status={status === 'provisioning' ? 'provisioning' : 'starting'} podPhase={podPhase} /> : null}
          {!showLoader && status === 'idle' ? (
            <WorkspaceWelcome onOpen={openWorkspace} isLoading={isLoading} />
          ) : null}
          {!showLoader && status === 'running' && proxyUrl ? (
            <IdeFrame proxyUrl={proxyUrl} />
          ) : null}
          {!showLoader && status === 'stopped' ? (
            <WorkspaceStopped onRestart={restartWorkspace} isLoading={isLoading} />
          ) : null}
          {!showLoader && status === 'error' ? (
            <WorkspaceError
              message={errorMessage ?? 'Unable to connect to your workspace.'}
              onRetry={() => {
                void openWorkspace()
              }}
            />
          ) : null}
        </main>
      </div>
    </WorkspaceActionsProvider>
  )
}