import { FormEvent, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { GitPullRequest } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import Avatar from '../../../components/ui/Avatar'
import Badge from '../../../components/ui/Badge'
import Button from '../../../components/ui/Button'
import Card from '../../../components/ui/Card'
import Input from '../../../components/ui/Input'
import Spinner from '../../../components/ui/Spinner'
import { api } from '../../../lib/api'
import { timeAgo } from '../../../lib/format'
import { useAuthStore } from '../../../store/auth'
import type { MergeRequest } from '../types'
import { unwrapData } from '../utils'
import { useProject } from './ProjectLayout'

type StatusFilter = 'open' | 'merged' | 'closed' | 'all'

function statusBadge(status: MergeRequest['status']) {
  if (status === 'merged') return <Badge variant="info">Merged</Badge>
  if (status === 'closed') return <Badge variant="default">Closed</Badge>
  if (status === 'draft') return <Badge variant="warning">Draft</Badge>
  return <Badge variant="success">Open</Badge>
}

function iconColor(status: MergeRequest['status']) {
  if (status === 'merged') return 'text-accent-violet'
  if (status === 'closed') return 'text-text-muted'
  return 'text-accent-green'
}

export default function MergeRequestsPage() {
  const navigate = useNavigate()
  const { projectId } = useParams<{ projectId: string }>()
  const { project } = useProject()
  const queryClient = useQueryClient()
  const can = useAuthStore((s) => s.can)

  const [status, setStatus] = useState<StatusFilter>('open')
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [sourceBranch, setSourceBranch] = useState('')
  const [targetBranch, setTargetBranch] = useState(project.default_branch)
  const [error, setError] = useState('')

  const listQuery = useQuery({
    queryKey: ['mrs', projectId, status],
    queryFn: async () => {
      const query = status === 'all' ? '' : `?status=${status}`
      const res = await api.get(`/projects/${projectId}/mrs${query}`)
      return unwrapData<{ mrs: MergeRequest[] }>(res.data)
    },
    enabled: Boolean(projectId),
  })

  const branchesQuery = useQuery({
    queryKey: ['project-branches', projectId],
    queryFn: async () => {
      const res = await api.get(`/projects/${projectId}/branches`)
      return unwrapData<string[]>(res.data)
    },
    enabled: Boolean(projectId) && showForm,
  })

  const branches = branchesQuery.data ?? []

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post(`/projects/${projectId}/mrs`, {
        title: title.trim(),
        body: body.trim() || null,
        source_branch: sourceBranch,
        target_branch: targetBranch,
      })
      return unwrapData<MergeRequest>(res.data)
    },
    onSuccess: (mr) => {
      queryClient.invalidateQueries({ queryKey: ['mrs', projectId] })
      navigate(`/projects/${projectId}/mrs/${mr.number}`)
    },
    onError: (err: unknown) => {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Failed to create merge request'
      setError(message)
    },
  })

  const mrs = useMemo(() => listQuery.data?.mrs ?? [], [listQuery.data?.mrs])

  const submitNewMR = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')
    if (!title.trim() || !sourceBranch || !targetBranch) {
      setError('Title, source branch and target branch are required')
      return
    }
    createMutation.mutate()
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-text-primary">Merge Requests</h1>
        {can('repository', 'create') ? (
          <Button size="sm" onClick={() => setShowForm((s) => !s)}>
            New MR
          </Button>
        ) : null}
      </div>

      <div className="mt-3 flex items-center gap-2">
        {(['open', 'merged', 'closed', 'all'] as StatusFilter[]).map((item) => (
          <button
            key={item}
            type="button"
            className={[
              'px-3 py-1.5 rounded text-xs border',
              status === item
                ? 'bg-amber-subtle border-accent-amber text-accent-amber'
                : 'border-border text-text-secondary',
            ].join(' ')}
            onClick={() => setStatus(item)}
          >
            {item[0].toUpperCase() + item.slice(1)}
          </button>
        ))}
      </div>

      {showForm ? (
        <Card className="mt-4" padding="md">
          <form className="space-y-3" onSubmit={submitNewMR}>
            <Input
              label="Title"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />

            <div className="flex flex-col gap-1">
              <label className="text-xs text-text-secondary font-medium">Description</label>
              <textarea
                rows={4}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="bg-bg-subtle border border-border rounded px-3 py-2 text-sm text-text-primary"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-text-secondary font-medium">Source Branch</label>
                <select
                  value={sourceBranch}
                  onChange={(e) => setSourceBranch(e.target.value)}
                  className="bg-bg-subtle border border-border rounded px-3 py-2 text-sm text-text-primary"
                >
                  <option value="">Select source</option>
                  {branches.map((branch) => (
                    <option key={branch} value={branch}>
                      {branch}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs text-text-secondary font-medium">Target Branch</label>
                <select
                  value={targetBranch}
                  onChange={(e) => setTargetBranch(e.target.value)}
                  className="bg-bg-subtle border border-border rounded px-3 py-2 text-sm text-text-primary"
                >
                  {(branches.length > 0 ? branches : [project.default_branch]).map((branch) => (
                    <option key={branch} value={branch}>
                      {branch}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {error ? <p className="text-sm text-accent-red">{error}</p> : null}

            <Button type="submit" loading={createMutation.isPending}>
              Open Merge Request
            </Button>
          </form>
        </Card>
      ) : null}

      <Card className="mt-4" padding="none">
        {listQuery.isLoading ? (
          <div className="py-12 flex justify-center">
            <Spinner size="lg" />
          </div>
        ) : null}

        {mrs.map((mr) => (
          <button
            key={mr.id}
            type="button"
            onClick={() => navigate(`/projects/${projectId}/mrs/${mr.number}`)}
            className="w-full text-left flex items-center gap-3 px-4 py-3 border-b border-border last:border-0 hover:bg-bg-subtle"
          >
            <GitPullRequest className={`w-4 h-4 ${iconColor(mr.status)}`} />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-text-primary font-medium truncate">
                {mr.title} <span className="text-text-muted">#{mr.number}</span>
              </p>
              <p className="text-xs text-text-muted font-mono">
                {mr.source_branch} → {mr.target_branch}
              </p>
            </div>
            <div className="hidden md:flex items-center gap-2">
              <Avatar size="sm" name={mr.author?.display_name ?? mr.author?.username ?? mr.author_display ?? mr.author_name ?? 'User'} />
              <span className="text-xs text-text-muted">
                {mr.author?.display_name ?? mr.author?.username ?? mr.author_display ?? mr.author_name ?? 'Unknown'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {statusBadge(mr.status)}
              <span className="text-xs text-text-muted">{timeAgo(mr.created_at)}</span>
            </div>
          </button>
        ))}
      </Card>
    </div>
  )
}
