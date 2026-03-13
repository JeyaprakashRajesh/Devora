import { useEffect, useState } from 'react'
import { Check, Circle } from 'lucide-react'
import { Spinner } from '../../components/ui/Spinner'
import { useWorkspaceActions } from '../../hooks/useWorkspace'
import { useWorkspaceStore } from '../../store/workspace.store'

type WorkspaceLoaderProps = {
  status: 'provisioning' | 'starting'
  podPhase: string | null
}

type StepState = 'pending' | 'active' | 'complete'

function StepIcon({ state }: { state: StepState }) {
  if (state === 'complete') {
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent-emerald-subtle text-accent-emerald">
        <Check className="h-3 w-3" />
      </span>
    )
  }

  if (state === 'active') {
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full border border-border-strong bg-bg-surface">
        <Spinner size="sm" />
      </span>
    )
  }

  return <Circle className="h-4 w-4 text-text-muted" fill="currentColor" />
}

function StepRow({
  label,
  sublabel,
  state,
}: {
  label: string
  sublabel: string
  state: StepState
}) {
  const textClassName =
    state === 'complete'
      ? 'text-text-secondary'
      : state === 'active'
        ? 'text-text-primary'
        : 'text-text-muted'

  return (
    <div className="flex items-start gap-3 rounded-lg border border-border-default bg-bg-surface px-4 py-3">
      <div className="mt-0.5 shrink-0">
        <StepIcon state={state} />
      </div>
      <div>
        <p className={`text-sm font-medium ${textClassName}`}>{label}</p>
        <p className="mt-1 text-xs text-text-muted">{sublabel}</p>
      </div>
    </div>
  )
}

export function WorkspaceLoader({ status, podPhase }: WorkspaceLoaderProps) {
  const containersReady = useWorkspaceStore((state) => state.containersReady)
  const { stopWorkspace } = useWorkspaceActions()
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  useEffect(() => {
    setElapsedSeconds(0)

    const intervalId = window.setInterval(() => {
      setElapsedSeconds((current) => current + 1)
    }, 1_000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [status, podPhase])

  const storageState: StepState = status === 'provisioning' ? 'active' : 'complete'
  const containerState: StepState =
    podPhase === 'Running'
      ? 'complete'
      : status === 'starting'
        ? 'active'
        : 'pending'
  const ideState: StepState = containersReady
    ? 'complete'
    : podPhase === 'Running'
      ? 'active'
      : 'pending'

  const heading =
    status === 'provisioning'
      ? 'Setting up your workspace...'
      : status === 'starting' && podPhase === 'Pending'
        ? 'Starting your workspace...'
        : status === 'starting' && podPhase === 'Running'
          ? 'Almost ready...'
          : 'Preparing environment...'

  return (
    <div className="flex h-full items-center justify-center bg-bg-base px-6">
      <div className="w-full max-w-xl text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-border-strong bg-bg-surface">
          <Spinner size="lg" />
        </div>
        <h2 className="mt-6 text-3xl font-semibold tracking-tight text-text-primary">
          {heading}
        </h2>

        <div className="mt-8 space-y-3 text-left">
          <StepRow
            label="Allocating storage"
            sublabel="Mounting your persistent workspace volume"
            state={storageState}
          />
          <StepRow
            label="Starting container"
            sublabel="Launching your development environment"
            state={containerState}
          />
          <StepRow
            label="Loading IDE"
            sublabel="Starting code-server and AI agent"
            state={ideState}
          />
        </div>

        {status === 'starting' && elapsedSeconds > 10 ? (
          <p className="mt-5 text-xs text-text-muted">
            This usually takes 15-30 seconds on first launch
          </p>
        ) : null}

        <button
          type="button"
          className="mt-8 text-xs text-text-muted transition hover:text-text-secondary"
          onClick={() => {
            void stopWorkspace()
          }}
        >
          Taking too long? Stop and try again
        </button>
      </div>
    </div>
  )
}