import { useWorkspaceStore } from '../../store/workspace.store'
import { ResourceUsage } from './ResourceUsage'
import { WorkspaceControls } from './WorkspaceControls'

type StatusAppearance = {
  label: string
  dotClassName: string
}

function getStatusAppearance(status: string): StatusAppearance {
  switch (status) {
    case 'running':
      return { label: 'Running', dotClassName: 'bg-accent-emerald animate-pulse' }
    case 'starting':
    case 'provisioning':
      return { label: 'Starting...', dotClassName: 'bg-accent-amber animate-pulse' }
    case 'stopped':
      return { label: 'Stopped', dotClassName: 'bg-text-muted' }
    case 'error':
      return { label: 'Error', dotClassName: 'bg-accent-rose' }
    default:
      return { label: 'Idle', dotClassName: 'bg-text-muted' }
  }
}

export function WorkspaceStatusBar() {
  const workspaceId = useWorkspaceStore((state) => state.workspaceId)
  const status = useWorkspaceStore((state) => state.status)
  const appearance = getStatusAppearance(status)

  return (
    <div className="flex h-9 items-center justify-between gap-4 border-b border-border-default bg-bg-surface px-4">
      <div className="flex min-w-0 items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${appearance.dotClassName}`} />
        <span className="text-xs font-medium text-text-secondary">{appearance.label}</span>
      </div>

      <div className="hidden min-w-0 flex-1 justify-center md:flex">
        <span className="truncate font-mono text-[11px] uppercase tracking-[0.14em] text-text-muted">
          {workspaceId ? `ws · ${workspaceId.slice(0, 8)}` : 'ws · pending'}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <ResourceUsage />
        <WorkspaceControls />
      </div>
    </div>
  )
}