import { useEffect, useRef, useState } from 'react'
import { FileText, Play, Square, Trash2 } from 'lucide-react'
import { useNavigate } from '@tanstack/react-router'
import { Tooltip } from '../ui/Tooltip'
import { Button } from '../ui/Button'
import { api } from '../../lib/api'
import { useWorkspaceActions } from '../../hooks/useWorkspace'
import { useWorkspaceStore } from '../../store/workspace.store'
import { WorkspaceLogsModal } from '../../pages/ide/WorkspaceError'

type ConfirmationKind = 'stop' | 'delete' | null

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-7 w-7 items-center justify-center rounded border border-border-default bg-bg-elevated text-text-secondary transition hover:bg-bg-subtle hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  )
}

function ConfirmationPopover({
  message,
  confirmLabel,
  isDestructive,
  isBusy,
  onCancel,
  onConfirm,
}: {
  message: string
  confirmLabel: string
  isDestructive?: boolean
  isBusy?: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div className="absolute right-0 top-full z-30 mt-2 w-72 rounded-md border border-border-strong bg-bg-elevated p-3 shadow-2xl">
      <div className="absolute -top-1.5 right-3 h-3 w-3 rotate-45 border-l border-t border-border-strong bg-bg-elevated" />
      <p className="text-xs leading-5 text-text-secondary">{message}</p>
      <div className="mt-3 flex items-center justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          variant={isDestructive ? 'destructive' : 'primary'}
          onClick={onConfirm}
          disabled={isBusy}
        >
          {confirmLabel}
        </Button>
      </div>
    </div>
  )
}

export function WorkspaceControls() {
  const navigate = useNavigate()
  const { stopWorkspace, restartWorkspace } = useWorkspaceActions()
  const workspaceId = useWorkspaceStore((state) => state.workspaceId)
  const status = useWorkspaceStore((state) => state.status)
  const [confirmationKind, setConfirmationKind] = useState<ConfirmationKind>(null)
  const [isLogsOpen, setIsLogsOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const popoverRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!confirmationKind) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setConfirmationKind(null)
      }
    }

    const handleMouseDown = (event: MouseEvent) => {
      if (!popoverRef.current?.contains(event.target as Node)) {
        setConfirmationKind(null)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('mousedown', handleMouseDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('mousedown', handleMouseDown)
    }
  }, [confirmationKind])

  const handleDelete = async () => {
    if (!workspaceId) {
      return
    }

    setIsDeleting(true)

    try {
      await api.delete(`/api/sandbox/workspaces/${workspaceId}`)
      useWorkspaceStore.getState().reset()
      setConfirmationKind(null)
      await navigate({ to: '/ide' })
    } catch {
      useWorkspaceStore.getState().setError('Unable to delete the workspace.')
    } finally {
      setIsDeleting(false)
    }
  }

  const renderConfirmation = () => {
    if (confirmationKind === 'stop') {
      return (
        <ConfirmationPopover
          message="Your files will be preserved. Stop workspace?"
          confirmLabel="Stop"
          onCancel={() => setConfirmationKind(null)}
          onConfirm={() => {
            void stopWorkspace()
            setConfirmationKind(null)
          }}
        />
      )
    }

    if (confirmationKind === 'delete') {
      return (
        <ConfirmationPopover
          message="This will permanently delete your workspace and all files. This cannot be undone."
          confirmLabel="Delete permanently"
          isDestructive
          isBusy={isDeleting}
          onCancel={() => setConfirmationKind(null)}
          onConfirm={() => {
            void handleDelete()
          }}
        />
      )
    }

    return null
  }

  return (
    <>
      <div className="flex items-center gap-2">
        {status === 'running' ? (
          <div className="relative" ref={confirmationKind === 'stop' ? popoverRef : null}>
            <Tooltip content="Stop workspace">
              <span>
                <IconButton
                  label="Stop workspace"
                  onClick={() => setConfirmationKind((current) => current === 'stop' ? null : 'stop')}
                  disabled={!workspaceId}
                >
                  <Square className="h-3.5 w-3.5" />
                </IconButton>
              </span>
            </Tooltip>
            {confirmationKind === 'stop' ? renderConfirmation() : null}
          </div>
        ) : null}

        {status === 'stopped' ? (
          <Tooltip content="Start workspace">
            <span>
              <IconButton
                label="Start workspace"
                onClick={() => {
                  void restartWorkspace()
                }}
                disabled={!workspaceId}
              >
                <Play className="h-3.5 w-3.5" />
              </IconButton>
            </span>
          </Tooltip>
        ) : null}

        <Tooltip content="View logs">
          <span>
            <IconButton
              label="View logs"
              onClick={() => setIsLogsOpen(true)}
              disabled={!workspaceId}
            >
              <FileText className="h-3.5 w-3.5" />
            </IconButton>
          </span>
        </Tooltip>

        <div className="relative" ref={confirmationKind === 'delete' ? popoverRef : null}>
          <Tooltip content="Delete workspace">
            <span>
              <IconButton
                label="Delete workspace"
                onClick={() => setConfirmationKind((current) => current === 'delete' ? null : 'delete')}
                disabled={!workspaceId}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </IconButton>
            </span>
          </Tooltip>
          {confirmationKind === 'delete' ? renderConfirmation() : null}
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