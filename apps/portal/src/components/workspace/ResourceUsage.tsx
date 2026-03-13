import { useEffect } from 'react'
import { Cpu, MemoryStick } from 'lucide-react'
import { api } from '../../lib/api'
import { useWorkspaceStore, type WorkspaceStatus } from '../../store/workspace.store'

const RESOURCE_REFRESH_MS = 15_000

function parseMetricValue(value: string | null): number | null {
  if (!value) {
    return null
  }

  const parsed = Number.parseFloat(value.replace(/[^\d.]/g, ''))
  return Number.isFinite(parsed) ? parsed : null
}

function getMetricClassName(value: number | null): string {
  if (value === null) {
    return 'text-text-secondary'
  }

  if (value > 80) {
    return 'text-accent-rose'
  }

  if (value >= 60) {
    return 'text-accent-amber'
  }

  return 'text-text-secondary'
}

function MetricPill({
  icon,
  label,
  className,
}: {
  icon: React.ReactNode
  label: string
  className: string
}) {
  return (
    <div className={`inline-flex h-6 items-center gap-1 rounded-full border border-border-default bg-bg-elevated px-2 text-[11px] ${className}`}>
      {icon}
      <span>{label}</span>
    </div>
  )
}

export function ResourceUsage() {
  const workspaceId = useWorkspaceStore((state) => state.workspaceId)
  const status = useWorkspaceStore((state) => state.status)
  const cpu = useWorkspaceStore((state) => state.cpu)
  const memory = useWorkspaceStore((state) => state.memory)

  useEffect(() => {
    if (!workspaceId || status !== 'running') {
      return
    }

    let isCancelled = false

    const refreshUsage = async () => {
      try {
        const response = await api.get<WorkspaceStatus>(
          `/api/sandbox/workspaces/${workspaceId}`,
        )

        if (!isCancelled) {
          useWorkspaceStore.getState().setStatus(response.data)
        }
      } catch {
        if (!isCancelled) {
          useWorkspaceStore.getState().setError('Unable to refresh workspace usage.')
        }
      }
    }

    void refreshUsage()

    const intervalId = window.setInterval(() => {
      void refreshUsage()
    }, RESOURCE_REFRESH_MS)

    return () => {
      isCancelled = true
      window.clearInterval(intervalId)
    }
  }, [status, workspaceId])

  const cpuValue = parseMetricValue(cpu)
  const memoryValue = parseMetricValue(memory)

  return (
    <div className="hidden items-center gap-2 sm:flex">
      <MetricPill
        icon={<Cpu className="h-3 w-3" />}
        label={cpu ? `${cpu}%` : '—'}
        className={getMetricClassName(cpuValue)}
      />
      <MetricPill
        icon={<MemoryStick className="h-3 w-3" />}
        label={memory ? `${memory} MB` : '—'}
        className={getMetricClassName(memoryValue)}
      />
    </div>
  )
}