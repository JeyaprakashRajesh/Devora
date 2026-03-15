import { isAxiosError } from 'axios'
import { useCallback, useEffect, useRef, useState } from 'react'
import { XCircle } from 'lucide-react'
import Button from '../ui/Button'
import { api } from '../../lib/api'
import { useProject } from '../../pages/projects/[projectId]/ProjectLayout'

type WorkspaceStatus = 'idle' | 'creating' | 'cloning' | 'ready' | 'error'

interface WorkspaceLoaderProps {
  projectId: string
  onReady: (ideUrl: string, workspaceId: string) => void
  onError: (message: string) => void
}

interface WorkspaceCreateResponse {
  workspace_id: string
  status: 'cloning' | 'ready' | 'error'
  ide_url?: string
  message?: string
}

interface WorkspaceStatusResponse {
  status: 'cloning' | 'ready' | 'error'
  ide_url?: string
  message?: string
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (isAxiosError(error)) {
    const message = (error.response?.data as { error?: string; message?: string } | undefined)
      ?.error
      ?? (error.response?.data as { error?: string; message?: string } | undefined)?.message
      ?? error.message
    return message || fallback
  }

  if (error instanceof Error && error.message) {
    return error.message
  }

  return fallback
}

export default function WorkspaceLoader({ projectId, onReady, onError }: WorkspaceLoaderProps) {
  const [status, setStatus] = useState<WorkspaceStatus>('idle')
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const pollInterval = useRef<ReturnType<typeof setInterval> | null>(null)
  const { project } = useProject()

  const clearPolling = useCallback(() => {
    if (pollInterval.current) {
      clearInterval(pollInterval.current)
      pollInterval.current = null
    }
  }, [])

  const startPolling = useCallback(
    (id: string) => {
      clearPolling()
      pollInterval.current = setInterval(async () => {
        try {
          const res = await api.get<{ data: WorkspaceStatusResponse }>(`/workspaces/${id}/status`)
          const data = res.data.data
          setMessage(data.message ?? '')

          if (data.status === 'ready' && data.ide_url) {
            clearPolling()
            setStatus('ready')
            onReady(data.ide_url, id)
          }

          if (data.status === 'error') {
            clearPolling()
            setStatus('error')
            onError(data.message ?? 'Workspace setup failed.')
          }
        } catch (error) {
          clearPolling()
          setStatus('error')
          onError(getErrorMessage(error, 'Failed to poll workspace status.'))
        }
      }, 2000)
    },
    [clearPolling, onError, onReady]
  )

  const initWorkspace = useCallback(async () => {
    clearPolling()
    setStatus('creating')
    setMessage('')

    try {
      const res = await api.post<{ data: WorkspaceCreateResponse }>('/workspaces', {
        project_id: projectId,
      })
      const data = res.data.data
      const id = data.workspace_id

      setWorkspaceId(id)
      setMessage(data.message ?? '')

      if (data.status === 'ready' && data.ide_url) {
        setStatus('ready')
        onReady(data.ide_url, id)
        return
      }

      if (data.status === 'cloning') {
        setStatus('cloning')
        startPolling(id)
        return
      }

      setStatus('error')
      onError(data.message ?? 'Workspace setup failed.')
    } catch (error) {
      const errorMessage = getErrorMessage(error, 'Failed to create workspace.')
      setStatus('error')
      onError(errorMessage)
    }
  }, [clearPolling, onError, onReady, projectId, startPolling])

  useEffect(() => {
    void initWorkspace()
    return () => {
      clearPolling()
    }
  }, [clearPolling, initWorkspace])

  if (status === 'creating') {
    return (
      <div className="h-full w-full bg-bg-base flex items-center justify-center">
        <div className="text-center">
          <span
            className="w-8 h-8 border-2 inline-block border-accent-violet border-t-transparent rounded-full animate-spin"
            aria-hidden="true"
          />
          <p className="mt-4 text-text-secondary">Preparing your workspace...</p>
          <p className="mt-1 text-sm text-text-muted">This only takes a moment</p>
        </div>
      </div>
    )
  }

  if (status === 'cloning') {
    return (
      <div className="h-full w-full bg-bg-base flex items-center justify-center">
        <div className="text-center flex flex-col items-center">
          <div className="w-64 h-1 bg-bg-subtle rounded-full overflow-hidden">
            <div
              className="h-full bg-accent-violet rounded-full animate-loading"
              style={{ width: '60%' }}
            />
          </div>
          <p className="mt-4 text-text-secondary">Cloning repository...</p>
          <p className="mt-1 text-sm text-text-muted">{message || 'Syncing repository contents.'}</p>
          <span className="font-mono text-xs text-accent-violet bg-accent-violet/10 px-2 py-1 rounded mt-2">
            git clone {project.slug}
          </span>
        </div>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="h-full w-full bg-bg-base flex items-center justify-center">
        <div className="text-center">
          <XCircle className="w-12 h-12 text-accent-red mx-auto" />
          <p className="mt-3 font-medium text-text-primary">Workspace setup failed</p>
          <p className="mt-1 text-sm text-text-muted">{message || 'Please try again.'}</p>
          <Button
            variant="primary"
            className="mt-4"
            onClick={() => {
              clearPolling()
              setStatus('idle')
              setWorkspaceId(null)
              setMessage('')
              void initWorkspace()
            }}
          >
            Try Again
          </Button>
          {workspaceId ? <p className="mt-2 text-xs text-text-muted">Workspace: {workspaceId}</p> : null}
        </div>
      </div>
    )
  }

  return <div className="h-full w-full bg-bg-base" />
}
