import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, Circle, Clock } from 'lucide-react'
import Avatar from '../../../components/ui/Avatar'
import Badge from '../../../components/ui/Badge'
import Button from '../../../components/ui/Button'
import Card from '../../../components/ui/Card'
import Spinner from '../../../components/ui/Spinner'
import { api } from '../../../lib/api'
import { timeAgo } from '../../../lib/format'
import type { Issue } from '../types'
import { unwrapData } from '../utils'

type StatusFilter = 'open' | 'closed' | 'all'

function statusIcon(status: Issue['status']) {
  if (status === 'closed') return <CheckCircle2 className="w-4 h-4 text-text-muted" />
  if (status === 'in_progress') return <Clock className="w-4 h-4 text-accent-amber" />
  return <Circle className="w-4 h-4 text-accent-green" />
}

function priorityBadge(priority: Issue['priority']) {
  if (priority === 'critical') return <Badge variant="error">Critical</Badge>
  if (priority === 'high') return <Badge variant="warning">High</Badge>
  if (priority === 'medium') return <Badge variant="info">Medium</Badge>
  return <Badge variant="default">Low</Badge>
}

function typeBadge(type: Issue['type']) {
  if (type === 'bug') return <Badge variant="error">Bug</Badge>
  if (type === 'feature') return <Badge variant="info">Feature</Badge>
  return <Badge variant="default">Task</Badge>
}

export default function IssuesPage() {
  const navigate = useNavigate()
  const { projectId } = useParams<{ projectId: string }>()

  const [status, setStatus] = useState<StatusFilter>('open')
  const [priority, setPriority] = useState('')
  const [type, setType] = useState('')
  const [page, setPage] = useState(1)

  const filters = useMemo(
    () => ({ status, priority, type, page }),
    [status, priority, type, page],
  )

  const issuesQuery = useQuery({
    queryKey: ['issues', projectId, filters],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (status !== 'all') params.set('status', status)
      if (priority) params.set('priority', priority)
      if (type) params.set('type', type)
      params.set('page', String(page))
      params.set('limit', '20')

      const res = await api.get(`/projects/${projectId}/issues?${params.toString()}`)
      return unwrapData<{ issues: Issue[]; total: number; page: number; limit: number }>(res.data)
    },
    enabled: Boolean(projectId),
  })

  const issues = issuesQuery.data?.issues ?? []
  const total = issuesQuery.data?.total ?? 0
  const limit = issuesQuery.data?.limit ?? 20
  const totalPages = Math.max(1, Math.ceil(total / limit))

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-text-primary">Issues</h1>
        <Button size="sm" onClick={() => navigate(`/projects/${projectId}/issues/new`)}>
          New Issue
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {(['open', 'closed', 'all'] as StatusFilter[]).map((item) => {
          const active = status === item
          return (
            <button
              key={item}
              type="button"
              onClick={() => {
                setStatus(item)
                setPage(1)
              }}
              className={[
                'px-3 py-1.5 rounded text-xs border transition-colors',
                active
                  ? 'bg-amber-subtle border-accent-amber text-accent-amber'
                  : 'border-border text-text-secondary',
              ].join(' ')}
            >
              {item === 'all' ? 'All' : item === 'open' ? 'Open' : 'Closed'}
            </button>
          )
        })}

        <select
          value={priority}
          onChange={(e) => {
            setPriority(e.target.value)
            setPage(1)
          }}
          className="bg-bg-subtle border border-border rounded px-3 py-1.5 text-xs text-text-primary"
        >
          <option value="">All Priorities</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="critical">Critical</option>
        </select>

        <select
          value={type}
          onChange={(e) => {
            setType(e.target.value)
            setPage(1)
          }}
          className="bg-bg-subtle border border-border rounded px-3 py-1.5 text-xs text-text-primary"
        >
          <option value="">All Types</option>
          <option value="task">Task</option>
          <option value="bug">Bug</option>
          <option value="feature">Feature</option>
        </select>
      </div>

      <Card className="mt-4" padding="none">
        {issuesQuery.isLoading ? (
          <div className="py-12 flex justify-center">
            <Spinner size="lg" />
          </div>
        ) : null}

        {issuesQuery.isError ? (
          <div className="py-8 px-4 text-sm text-accent-red">Failed to load issues.</div>
        ) : null}

        {!issuesQuery.isLoading && !issuesQuery.isError && issues.length === 0 ? (
          <div className="py-10 px-4 text-sm text-text-muted">No issues found.</div>
        ) : null}

        {issues.map((issue) => (
          <div
            key={issue.id}
            className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-0 hover:bg-bg-subtle"
          >
            <div>{statusIcon(issue.status)}</div>

            <div className="flex-1 min-w-0">
              <button
                type="button"
                onClick={() => navigate(`/projects/${projectId}/issues/${issue.number}`)}
                className="text-sm font-medium text-text-primary hover:underline"
              >
                {issue.title}
              </button>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                {priorityBadge(issue.priority)}
                {typeBadge(issue.type)}
                <span className="text-xs text-text-muted">#{issue.number}</span>
                <span className="text-xs text-text-muted">{timeAgo(issue.created_at)}</span>
              </div>
            </div>

            <div className="flex items-center">
              {(issue.assignee_ids ?? []).slice(0, 4).map((id, idx) => (
                <div key={id} className={idx > 0 ? '-ml-1' : ''}>
                  <Avatar size="sm" name={id.slice(0, 2).toUpperCase()} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </Card>

      <div className="mt-3 flex items-center justify-between">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page <= 1}
        >
          Previous
        </Button>

        <p className="text-xs text-text-muted">
          Page {page} of {totalPages}
        </p>

        <Button
          variant="secondary"
          size="sm"
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={page >= totalPages}
        >
          Next
        </Button>
      </div>
    </div>
  )
}
