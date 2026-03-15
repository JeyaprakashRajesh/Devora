import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Ban, CheckCircle, Clock, MinusCircle, XCircle } from 'lucide-react'
import { useParams } from 'react-router-dom'
import Badge from '../../../components/ui/Badge'
import Button from '../../../components/ui/Button'
import Card from '../../../components/ui/Card'
import Spinner from '../../../components/ui/Spinner'
import { api } from '../../../lib/api'
import { timeAgo } from '../../../lib/format'
import { createSSEStream } from '../../../lib/sse'
import { useAuthStore } from '../../../store/auth'
import type { PipelineJob, PipelineRun } from '../types'
import { unwrapData } from '../utils'

function runBadge(status: PipelineRun['status']) {
  if (status === 'running') {
    return (
      <Badge variant="info">
        <span className="inline-flex items-center gap-1">
          <Spinner size="sm" /> Running
        </span>
      </Badge>
    )
  }
  if (status === 'queued') {
    return (
      <Badge variant="default">
        <span className="inline-flex items-center gap-1">
          <Spinner size="sm" /> Queued
        </span>
      </Badge>
    )
  }
  if (status === 'passed') return <Badge variant="success">Passed</Badge>
  if (status === 'failed') return <Badge variant="error">Failed</Badge>
  return <Badge variant="default">Cancelled</Badge>
}

function jobIcon(status: PipelineJob['status']) {
  if (status === 'running') return <Spinner size="sm" />
  if (status === 'passed') return <CheckCircle className="w-4 h-4 text-accent-green" />
  if (status === 'failed') return <XCircle className="w-4 h-4 text-accent-red" />
  if (status === 'skipped') return <MinusCircle className="w-4 h-4 text-text-muted" />
  if (status === 'cancelled') return <Ban className="w-4 h-4 text-text-muted" />
  return <Clock className="w-4 h-4 text-text-muted" />
}

function duration(job: PipelineJob): string {
  if (!job.started_at || !job.finished_at) return '--'
  const ms = new Date(job.finished_at).getTime() - new Date(job.started_at).getTime()
  if (ms < 1000) return '<1s'
  return `${Math.floor(ms / 1000)}s`
}

const doneStatuses: PipelineRun['status'][] = ['passed', 'failed', 'cancelled']

export default function PipelineRunPage() {
  const { projectId, runId } = useParams<{ projectId: string; runId: string }>()
  const token = useAuthStore((s) => s.token)

  const [selectedJobId, setSelectedJobId] = useState<string>('')
  const [logs, setLogs] = useState<Record<string, string>>({})
  const preRef = useRef<HTMLPreElement | null>(null)

  const runQuery = useQuery({
    queryKey: ['run', projectId, runId],
    queryFn: async () => {
      const res = await api.get(`/projects/${projectId}/runs/${runId}`)
      return unwrapData<PipelineRun>(res.data)
    },
    enabled: Boolean(projectId && runId),
    refetchInterval: (query) => {
      const run = query.state.data as PipelineRun | undefined
      if (!run) return 3000
      return doneStatuses.includes(run.status) ? false : 3000
    },
  })

  const run = runQuery.data
  const jobs = run?.jobs ?? []

  useEffect(() => {
    if (!selectedJobId && jobs.length > 0) {
      setSelectedJobId(jobs[0].id)
    }
  }, [jobs, selectedJobId])

  const selectedJob = useMemo(
    () => jobs.find((job) => job.id === selectedJobId),
    [jobs, selectedJobId],
  )

  const cancelMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/projects/${projectId}/runs/${runId}/cancel`)
    },
    onSuccess: () => {
      void runQuery.refetch()
    },
  })

  useEffect(() => {
    if (!selectedJob || !token || !projectId || !runId) return

    const isRunning = run?.status === 'running' || run?.status === 'queued'
    if (!isRunning && logs[selectedJob.id]) {
      return
    }

    const cleanup = createSSEStream(
      `/api/projects/${projectId}/runs/${runId}/jobs/${selectedJob.id}/logs`,
      token,
      (data) => {
        setLogs((prev) => ({
          ...prev,
          [selectedJob.id]: `${prev[selectedJob.id] ?? ''}${data}`,
        }))
      },
    )

    return cleanup
  }, [selectedJob, token, projectId, runId, run?.status, logs])

  useEffect(() => {
    if (preRef.current) {
      preRef.current.scrollTop = preRef.current.scrollHeight
    }
  }, [logs, selectedJobId])

  if (runQuery.isLoading) {
    return (
      <div className="py-16 flex justify-center">
        <Spinner size="lg" />
      </div>
    )
  }

  if (!run || runQuery.isError) {
    return <div className="text-sm text-accent-red">Failed to load pipeline run.</div>
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-text-primary">Pipeline Run</h1>
          <div className="mt-1 flex items-center gap-2">
            {runBadge(run.status)}
            <span className="text-xs font-mono text-text-muted">{run.branch ?? 'branch'}</span>
            <span className="text-xs font-mono text-text-muted">{(run.commit_sha ?? '').slice(0, 7)}</span>
            <span className="text-xs text-text-muted">{timeAgo(run.created_at)}</span>
          </div>
        </div>

        {(run.status === 'queued' || run.status === 'running') ? (
          <Button
            variant="destructive"
            size="sm"
            loading={cancelMutation.isPending}
            onClick={() => cancelMutation.mutate()}
          >
            Cancel
          </Button>
        ) : null}
      </div>

      <div className="mt-6 flex gap-3 overflow-x-auto pb-2">
        {jobs.map((job) => (
          <button
            key={job.id}
            type="button"
            onClick={() => setSelectedJobId(job.id)}
            className={[
              'w-48 border rounded-lg p-3 text-left bg-bg-surface hover:border-accent-amber/40',
              selectedJobId === job.id ? 'border-accent-amber bg-amber-subtle' : 'border-border',
            ].join(' ')}
          >
            <div className="flex items-center gap-2 text-sm text-text-primary">
              {jobIcon(job.status)}
              <span>{job.name}</span>
            </div>
            <p className="text-xs text-text-muted mt-1">{duration(job)}</p>
          </button>
        ))}
      </div>

      <Card className="mt-4" header={selectedJob ? `${selectedJob.name} — Logs` : 'Logs'} padding="none">
        {!selectedJob ? (
          <div className="py-8 text-center text-text-muted">Select a job to view logs</div>
        ) : (
          <pre
            ref={preRef}
            className="font-mono text-xs text-text-primary bg-bg-base p-4 rounded overflow-auto max-h-[500px]"
          >
            {logs[selectedJob.id] ?? ''}
          </pre>
        )}
      </Card>
    </div>
  )
}
