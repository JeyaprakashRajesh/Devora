import { FormEvent, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Play } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import Button from '../../../components/ui/Button'
import Card from '../../../components/ui/Card'
import Spinner from '../../../components/ui/Spinner'
import { api } from '../../../lib/api'
import { timeAgo } from '../../../lib/format'
import { useAuthStore } from '../../../store/auth'
import type { Pipeline, PipelineRun } from '../types'
import { unwrapData } from '../utils'

function runStatusClass(status: PipelineRun['status']) {
  if (status === 'passed') return 'text-accent-green'
  if (status === 'failed') return 'text-accent-red'
  if (status === 'running') return 'text-accent-blue'
  return 'text-text-muted'
}

function duration(run: PipelineRun): string {
  if (!run.started_at || !run.finished_at) return '--'
  const ms = new Date(run.finished_at).getTime() - new Date(run.started_at).getTime()
  if (ms < 1000) return '<1s'
  return `${Math.floor(ms / 1000)}s`
}

function PipelineRuns({ projectId, pipelineId }: { projectId: string; pipelineId: string }) {
  const navigate = useNavigate()

  const runsQuery = useQuery({
    queryKey: ['pipeline-runs', projectId, pipelineId],
    queryFn: async () => {
      const res = await api.get(`/projects/${projectId}/pipelines/${pipelineId}/runs?limit=5`)
      return unwrapData<{ runs: PipelineRun[] }>(res.data)
    },
  })

  const runs = runsQuery.data?.runs ?? []

  return (
    <div className="px-4 pb-4">
      {runs.map((run) => (
        <button
          key={run.id}
          type="button"
          onClick={() => navigate(`/projects/${projectId}/runs/${run.id}`)}
          className="w-full mt-2 text-left bg-bg-elevated border border-border rounded px-3 py-2 flex items-center justify-between hover:border-accent-amber/40"
        >
          <div>
            <p className="text-xs text-text-primary font-mono">
              {run.branch ?? 'branch'} · {(run.commit_sha ?? '').slice(0, 7) || 'manual'}
            </p>
            <p className="text-xs text-text-muted mt-0.5">{timeAgo(run.created_at)}</p>
          </div>
          <div className="text-right">
            <p className={`text-xs capitalize ${runStatusClass(run.status)}`}>{run.status}</p>
            <p className="text-xs text-text-muted">{duration(run)}</p>
          </div>
        </button>
      ))}

      {runs.length === 0 ? <p className="text-xs text-text-muted mt-2">No runs yet.</p> : null}
    </div>
  )
}

export default function PipelinesPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const can = useAuthStore((s) => s.can)

  const [showModal, setShowModal] = useState(false)
  const [name, setName] = useState('')
  const [definition, setDefinition] = useState('{\n  "jobs": {\n    "build": {\n      "steps": ["echo hello"]\n    }\n  }\n}')
  const [trigger, setTrigger] = useState('{ "on": { "push": { "branches": ["main"] } } }')
  const [error, setError] = useState('')

  const pipelinesQuery = useQuery({
    queryKey: ['pipelines', projectId],
    queryFn: async () => {
      const res = await api.get(`/projects/${projectId}/pipelines`)
      return unwrapData<Pipeline[]>(res.data)
    },
    enabled: Boolean(projectId),
  })

  const createMutation = useMutation({
    mutationFn: async () => {
      const definitionJson = JSON.parse(definition)
      const triggerJson = JSON.parse(trigger)
      await api.post(`/projects/${projectId}/pipelines`, {
        name: name.trim(),
        definition: definitionJson,
        trigger: triggerJson,
      })
    },
    onSuccess: () => {
      setShowModal(false)
      setName('')
      queryClient.invalidateQueries({ queryKey: ['pipelines', projectId] })
    },
    onError: (err: unknown) => {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Failed to create pipeline'
      setError(message)
    },
  })

  const triggerMutation = useMutation({
    mutationFn: async (pipelineId: string) => {
      const res = await api.post(`/projects/${projectId}/pipelines/${pipelineId}/trigger`)
      return unwrapData<{ run_id: string }>(res.data)
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['pipelines', projectId] })
      navigate(`/projects/${projectId}/runs/${data.run_id}`)
    },
  })

  const pipelines = pipelinesQuery.data ?? []

  const submitCreate = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')
    if (!name.trim()) {
      setError('Name is required')
      return
    }

    try {
      JSON.parse(definition)
      JSON.parse(trigger)
    } catch {
      setError('Definition and Trigger must be valid JSON')
      return
    }

    createMutation.mutate()
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-text-primary">Pipelines</h1>
        {can('pipeline', 'create') ? (
          <Button size="sm" onClick={() => setShowModal(true)}>
            New Pipeline
          </Button>
        ) : null}
      </div>

      <Card className="mt-4" padding="none">
        {pipelinesQuery.isLoading ? (
          <div className="py-12 flex justify-center">
            <Spinner size="lg" />
          </div>
        ) : null}

        {pipelines.map((pipeline) => (
          <div key={pipeline.id} className="border-b border-border last:border-0">
            <div className="px-4 py-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-text-primary">{pipeline.name}</p>
                <p className="text-xs text-text-muted">{pipeline.run_count} runs</p>
                <p className="text-xs font-mono text-text-muted mt-0.5">
                  {JSON.stringify(pipeline.trigger)}
                </p>
              </div>
              <Button
                size="sm"
                variant="secondary"
                className="gap-2"
                onClick={() => triggerMutation.mutate(pipeline.id)}
                loading={triggerMutation.isPending}
              >
                <Play className="w-4 h-4" />
                Trigger
              </Button>
            </div>
            <PipelineRuns projectId={projectId ?? ''} pipelineId={pipeline.id} />
          </div>
        ))}
      </Card>

      {showModal ? (
        <div className="fixed inset-0 bg-bg-base/70 flex items-center justify-center z-20 p-4">
          <Card className="w-full max-w-2xl" padding="md" header="Create Pipeline">
            <form className="space-y-3" onSubmit={submitCreate}>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-text-secondary font-medium">Name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="bg-bg-subtle border border-border rounded px-3 py-2 text-sm text-text-primary"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs text-text-secondary font-medium">Definition (JSON)</label>
                <textarea
                  rows={10}
                  value={definition}
                  onChange={(e) => setDefinition(e.target.value)}
                  className="bg-bg-subtle border border-border rounded px-3 py-2 text-xs text-text-primary font-mono"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs text-text-secondary font-medium">Trigger (JSON)</label>
                <textarea
                  rows={4}
                  value={trigger}
                  onChange={(e) => setTrigger(e.target.value)}
                  className="bg-bg-subtle border border-border rounded px-3 py-2 text-xs text-text-primary font-mono"
                />
              </div>

              {error ? <p className="text-sm text-accent-red">{error}</p> : null}

              <div className="flex items-center justify-end gap-2">
                <Button variant="ghost" onClick={() => setShowModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" loading={createMutation.isPending}>
                  Create
                </Button>
              </div>
            </form>
          </Card>
        </div>
      ) : null}
    </div>
  )
}
