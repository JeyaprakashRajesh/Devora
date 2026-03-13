import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertCircle, FileText, X } from 'lucide-react'
import { useNavigate } from '@tanstack/react-router'
import { Button } from '../../components/ui/Button'
import { Spinner } from '../../components/ui/Spinner'
import { api } from '../../lib/api'
import { useWorkspaceStore } from '../../store/workspace.store'

type WorkspaceErrorProps = {
  message: string
  onRetry: () => void
}

type WorkspaceLogsModalProps = {
  open: boolean
  workspaceId: string | null
  onClose: () => void
}

export function WorkspaceLogsModal({
  open,
  workspaceId,
  onClose,
}: WorkspaceLogsModalProps) {
  const [logs, setLogs] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      return
    }

    let isCancelled = false

    const loadLogs = async () => {
      if (!workspaceId) {
        setErrorMessage('No workspace selected.')
        setLogs('')
        return
      }

      setIsLoading(true)
      setErrorMessage(null)

      try {
        const response = await api.get(`/api/sandbox/workspaces/${workspaceId}/logs`, {
          responseType: 'text',
        })

        if (!isCancelled) {
          setLogs(typeof response.data === 'string' ? response.data : '')
        }
      } catch {
        if (!isCancelled) {
          setErrorMessage('Unable to load workspace logs.')
          setLogs('')
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false)
        }
      }
    }

    void loadLogs()

    return () => {
      isCancelled = true
    }
  }, [open, workspaceId])

  if (!open) {
    return null
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg-base/75 px-4 py-6 backdrop-blur-sm">
      <div className="flex h-full max-h-[720px] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-border-strong bg-bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-border-default px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-text-primary">Workspace logs</h2>
            <p className="mt-1 text-xs text-text-muted">Last 100 lines from the sandbox pod</p>
          </div>
          <button
            type="button"
            className="rounded p-1 text-text-secondary transition hover:bg-bg-subtle hover:text-text-primary"
            onClick={onClose}
            aria-label="Close logs"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-auto bg-bg-base p-5">
          {isLoading ? (
            <div className="flex h-full items-center justify-center gap-3 text-sm text-text-secondary">
              <Spinner size="sm" />
              Loading logs
            </div>
          ) : null}

          {!isLoading && errorMessage ? (
            <div className="rounded-lg border border-accent-rose bg-accent-rose-subtle px-4 py-3 text-sm text-accent-rose">
              {errorMessage}
            </div>
          ) : null}

          {!isLoading && !errorMessage ? (
            <pre className="font-['JetBrains_Mono',ui-monospace,SFMono-Regular,Menlo,monospace] text-[12px] leading-6 text-text-secondary whitespace-pre-wrap">
              {logs || 'No log output available.'}
            </pre>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  )
}

export function WorkspaceError({ message, onRetry }: WorkspaceErrorProps) {
  const navigate = useNavigate()
  const workspaceId = useWorkspaceStore((state) => state.workspaceId)
  const [isLogsOpen, setIsLogsOpen] = useState(false)

  return (
    <>
      <div className="flex h-full items-center justify-center bg-bg-base px-6">
        <div className="w-full max-w-lg text-center">
          <AlertCircle className="mx-auto h-12 w-12 text-accent-rose" />
          <h1 className="mt-5 text-3xl font-semibold tracking-tight text-text-primary">
            Something went wrong
          </h1>
          <p className="mt-3 text-sm text-text-secondary">{message}</p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Button variant="primary" size="lg" onClick={onRetry}>
              Try Again
            </Button>
            <Button
              variant="secondary"
              size="lg"
              onClick={() => {
                void navigate({ to: '/dashboard' })
              }}
            >
              Go to Dashboard
            </Button>
          </div>
          <button
            type="button"
            className="mt-5 inline-flex items-center gap-2 text-xs text-text-muted transition hover:text-text-secondary"
            onClick={() => setIsLogsOpen(true)}
          >
            <FileText className="h-3.5 w-3.5" />
            View workspace logs
          </button>
        </div>
      </div>

      <WorkspaceLogsModal
        open={isLogsOpen}
        workspaceId={workspaceId}
        onClose={() => setIsLogsOpen(false)}
      />
    </>
  )
}