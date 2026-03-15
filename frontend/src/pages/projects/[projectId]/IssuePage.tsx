import { FormEvent, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import Avatar from '../../../components/ui/Avatar'
import Badge from '../../../components/ui/Badge'
import Button from '../../../components/ui/Button'
import Card from '../../../components/ui/Card'
import Spinner from '../../../components/ui/Spinner'
import { api } from '../../../lib/api'
import { timeAgo } from '../../../lib/format'
import type { Issue, IssueComment } from '../types'
import { unwrapData } from '../utils'

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

function statusBadge(status: Issue['status']) {
  if (status === 'closed') return <Badge variant="default">Closed</Badge>
  if (status === 'in_progress') return <Badge variant="warning">In Progress</Badge>
  return <Badge variant="success">Open</Badge>
}

export default function IssuePage() {
  const { projectId, number } = useParams<{ projectId: string; number: string }>()
  const queryClient = useQueryClient()
  const [commentBody, setCommentBody] = useState('')

  const issueQuery = useQuery({
    queryKey: ['issue', projectId, number],
    queryFn: async () => {
      const res = await api.get(`/projects/${projectId}/issues/${number}`)
      return unwrapData<Issue>(res.data)
    },
    enabled: Boolean(projectId && number),
  })

  const commentsQuery = useQuery({
    queryKey: ['issue-comments', projectId, number],
    queryFn: async () => {
      const res = await api.get(`/projects/${projectId}/issues/${number}/comments`)
      return unwrapData<IssueComment[]>(res.data)
    },
    enabled: Boolean(projectId && number),
  })

  const updateMutation = useMutation({
    mutationFn: async (payload: Partial<Issue>) => {
      await api.patch(`/projects/${projectId}/issues/${number}`, payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['issue', projectId, number] })
      queryClient.invalidateQueries({ queryKey: ['issues', projectId] })
    },
  })

  const closeMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/projects/${projectId}/issues/${number}/close`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['issue', projectId, number] })
      queryClient.invalidateQueries({ queryKey: ['issues', projectId] })
    },
  })

  const reopenMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/projects/${projectId}/issues/${number}/reopen`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['issue', projectId, number] })
      queryClient.invalidateQueries({ queryKey: ['issues', projectId] })
    },
  })

  const addCommentMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/projects/${projectId}/issues/${number}/comments`, { body: commentBody.trim() })
    },
    onSuccess: () => {
      setCommentBody('')
      queryClient.invalidateQueries({ queryKey: ['issue-comments', projectId, number] })
    },
  })

  const issue = issueQuery.data
  const comments = commentsQuery.data ?? []

  const bodyText = useMemo(() => {
    const body = issue?.body?.trim()
    return body && body.length > 0 ? body : ''
  }, [issue?.body])

  if (issueQuery.isLoading) {
    return (
      <div className="py-16 flex justify-center">
        <Spinner size="lg" />
      </div>
    )
  }

  if (!issue || issueQuery.isError) {
    return <div className="text-sm text-accent-red">Failed to load issue.</div>
  }

  const isClosed = issue.status === 'closed'

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      <div className="xl:col-span-2">
        <h1 className="text-xl font-semibold text-text-primary">{issue.title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {statusBadge(issue.status)}
          {priorityBadge(issue.priority)}
          {typeBadge(issue.type)}
          <span className="text-xs text-text-muted">#{issue.number}</span>
          <span className="text-xs text-text-muted">{timeAgo(issue.created_at)}</span>
        </div>

        <div className="mt-4">
          {bodyText ? (
            <p className="text-sm text-text-secondary whitespace-pre-wrap">{bodyText}</p>
          ) : (
            <p className="text-sm text-text-muted italic">No description</p>
          )}
        </div>

        <div className="mt-6">
          <h2 className="text-sm font-semibold text-text-primary">Comments ({comments.length})</h2>

          <div className="mt-2">
            {comments.map((comment) => (
              <div key={comment.id} className="flex gap-3 py-4 border-b border-border">
                <Avatar size="sm" name={comment.author?.display_name ?? comment.author?.username ?? 'User'} />
                <div>
                  <p className="text-sm text-text-primary">
                    <span className="font-medium">{comment.author?.display_name ?? comment.author?.username ?? 'User'}</span>
                    <span className="text-text-muted ml-2">{timeAgo(comment.created_at)}</span>
                  </p>
                  <p className="text-sm text-text-secondary mt-1 whitespace-pre-wrap">{comment.body}</p>
                </div>
              </div>
            ))}
          </div>

          <form
            className="mt-4"
            onSubmit={(e: FormEvent<HTMLFormElement>) => {
              e.preventDefault()
              if (!commentBody.trim()) return
              addCommentMutation.mutate()
            }}
          >
            <textarea
              rows={3}
              placeholder="Add a comment..."
              value={commentBody}
              onChange={(e) => setCommentBody(e.target.value)}
              className="w-full bg-bg-subtle border border-border rounded px-3 py-2 text-sm text-text-primary outline-none focus:border-accent-amber focus:ring-2 focus:ring-amber-glow"
            />
            <Button size="sm" className="mt-2" loading={addCommentMutation.isPending}>
              Comment
            </Button>
          </form>
        </div>
      </div>

      <div>
        <Card padding="md">
          <div>
            <p className="text-xs text-text-muted uppercase tracking-wide">Status</p>
            <select
              value={issue.status}
              onChange={(e) => {
                updateMutation.mutate({ status: e.target.value as Issue['status'] })
              }}
              className="mt-1 w-full bg-bg-subtle border border-border rounded px-3 py-2 text-sm text-text-primary"
            >
              <option value="open">open</option>
              <option value="in_progress">in_progress</option>
              <option value="closed">closed</option>
            </select>
            {isClosed ? (
              <Button
                size="sm"
                variant="secondary"
                className="mt-2 w-full"
                loading={reopenMutation.isPending}
                onClick={() => reopenMutation.mutate()}
              >
                Reopen
              </Button>
            ) : null}
          </div>

          <div className="mt-4">
            <p className="text-xs text-text-muted uppercase tracking-wide">Priority</p>
            <select
              value={issue.priority}
              onChange={(e) => {
                updateMutation.mutate({ priority: e.target.value as Issue['priority'] })
              }}
              className="mt-1 w-full bg-bg-subtle border border-border rounded px-3 py-2 text-sm text-text-primary"
            >
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
              <option value="critical">critical</option>
            </select>
          </div>

          <div className="mt-4">
            <p className="text-xs text-text-muted uppercase tracking-wide">Actions</p>
            {!isClosed ? (
              <Button
                variant="destructive"
                size="sm"
                className="w-full mt-1"
                loading={closeMutation.isPending}
                onClick={() => closeMutation.mutate()}
              >
                Close Issue
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                className="w-full mt-1"
                loading={reopenMutation.isPending}
                onClick={() => reopenMutation.mutate()}
              >
                Reopen Issue
              </Button>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}
