import { FormEvent, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import ReactDiffViewer from 'react-diff-viewer-continued'
import { GitBranch } from 'lucide-react'
import { useParams } from 'react-router-dom'
import Avatar from '../../../components/ui/Avatar'
import Badge from '../../../components/ui/Badge'
import Button from '../../../components/ui/Button'
import Card from '../../../components/ui/Card'
import Spinner from '../../../components/ui/Spinner'
import { api } from '../../../lib/api'
import { timeAgo } from '../../../lib/format'
import { useAuthStore } from '../../../store/auth'
import { useThemeStore } from '../../../store/theme'
import type { MRComment, MergeRequest } from '../types'
import { unwrapData } from '../utils'

function statusBadge(status: MergeRequest['status']) {
  if (status === 'merged') return <Badge variant="success">Merged</Badge>
  if (status === 'closed') return <Badge variant="default">Closed</Badge>
  if (status === 'draft') return <Badge variant="warning">Draft</Badge>
  return <Badge variant="info">Open</Badge>
}

function parseUnifiedDiffByFile(diffText: string): Array<{ file: string; oldText: string; newText: string }> {
  const files: Array<{ file: string; lines: string[] }> = []
  const lines = diffText.split('\n')

  let current: { file: string; lines: string[] } | null = null

  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      if (current) files.push(current)
      const parts = line.split(' ')
      const file = (parts[3] ?? '').replace('b/', '')
      current = { file: file || 'unknown', lines: [] }
      continue
    }

    if (!current) continue
    current.lines.push(line)
  }

  if (current) files.push(current)

  return files.map((entry) => {
    const oldLines: string[] = []
    const newLines: string[] = []

    for (const line of entry.lines) {
      if (line.startsWith('---') || line.startsWith('+++') || line.startsWith('@@')) continue
      if (line.startsWith('-')) {
        oldLines.push(line.slice(1))
        continue
      }
      if (line.startsWith('+')) {
        newLines.push(line.slice(1))
        continue
      }
      oldLines.push(line.startsWith(' ') ? line.slice(1) : line)
      newLines.push(line.startsWith(' ') ? line.slice(1) : line)
    }

    return {
      file: entry.file,
      oldText: oldLines.join('\n'),
      newText: newLines.join('\n'),
    }
  })
}

export default function MrDetailPage() {
  const { projectId, number } = useParams<{ projectId: string; number: string }>()
  const queryClient = useQueryClient()
  const can = useAuthStore((s) => s.can)
  const token = useAuthStore((s) => s.token)
  const theme = useThemeStore((s) => s.theme)

  const [mergeMethod, setMergeMethod] = useState<'merge' | 'squash' | 'rebase'>('merge')
  const [commentBody, setCommentBody] = useState('')

  const mrQuery = useQuery({
    queryKey: ['mr', projectId, number],
    queryFn: async () => {
      const res = await api.get(`/projects/${projectId}/mrs/${number}`)
      return unwrapData<MergeRequest>(res.data)
    },
    enabled: Boolean(projectId && number),
  })

  const diffQuery = useQuery({
    queryKey: ['mr-diff', projectId, number],
    queryFn: async () => {
      const res = await api.get(`/projects/${projectId}/mrs/${number}/diff`)
      return unwrapData<{ diff: string }>(res.data).diff
    },
    enabled: Boolean(projectId && number),
  })

  const commentsQuery = useQuery({
    queryKey: ['mr-comments', projectId, number],
    queryFn: async () => {
      const res = await api.get(`/projects/${projectId}/mrs/${number}/comments`)
      return unwrapData<MRComment[]>(res.data)
    },
    enabled: Boolean(projectId && number),
  })

  const mergeMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/projects/${projectId}/mrs/${number}/merge`, { method: mergeMethod })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mr', projectId, number] })
      queryClient.invalidateQueries({ queryKey: ['mrs', projectId] })
    },
  })

  const closeMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/projects/${projectId}/mrs/${number}/close`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mr', projectId, number] })
      queryClient.invalidateQueries({ queryKey: ['mrs', projectId] })
    },
  })

  const addCommentMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/projects/${projectId}/mrs/${number}/comments`, { body: commentBody.trim() })
    },
    onSuccess: () => {
      setCommentBody('')
      queryClient.invalidateQueries({ queryKey: ['mr-comments', projectId, number] })
    },
  })

  const parsedDiff = useMemo(() => parseUnifiedDiffByFile(diffQuery.data ?? ''), [diffQuery.data])

  const mr = mrQuery.data

  if (mrQuery.isLoading) {
    return (
      <div className="py-16 flex justify-center">
        <Spinner size="lg" />
      </div>
    )
  }

  if (!mr || mrQuery.isError) {
    return <div className="text-sm text-accent-red">Failed to load merge request.</div>
  }

  const canMerge = can('repository', 'manage')
  const canClose = can('repository', 'update')

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">{mr.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {statusBadge(mr.status)}
            <span className="text-xs text-text-muted">#{mr.number}</span>
            <span className="text-xs text-text-muted">
              {mr.author?.display_name ?? mr.author?.username ?? mr.author_display ?? mr.author_name ?? 'Unknown'}
            </span>
            <span className="text-xs text-text-muted">{timeAgo(mr.created_at)}</span>
          </div>
          <div className="mt-2 inline-flex items-center gap-2 text-sm font-mono text-text-muted">
            <GitBranch className="w-4 h-4" />
            <span>
              {mr.source_branch} → {mr.target_branch}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {mr.status === 'open' && canMerge ? (
            <>
              <select
                value={mergeMethod}
                onChange={(e) => setMergeMethod(e.target.value as 'merge' | 'squash' | 'rebase')}
                className="bg-bg-subtle border border-border rounded px-2 py-1 text-xs text-text-primary"
              >
                <option value="merge">Merge commit</option>
                <option value="squash">Squash</option>
                <option value="rebase">Rebase</option>
              </select>
              <Button loading={mergeMutation.isPending} onClick={() => mergeMutation.mutate()}>
                Merge
              </Button>
            </>
          ) : null}

          {mr.status === 'open' && canClose ? (
            <Button
              variant="destructive"
              size="sm"
              loading={closeMutation.isPending}
              onClick={() => closeMutation.mutate()}
            >
              Close
            </Button>
          ) : null}

          {mr.status === 'open' && !canMerge ? (
            <Button variant="secondary" size="sm" disabled title="Insufficient permissions">
              Merge
            </Button>
          ) : null}
        </div>
      </div>

      <Card className="mt-6" header="Changes" padding="none">
        {diffQuery.isLoading ? (
          <div className="py-12 flex justify-center">
            <Spinner size="lg" />
          </div>
        ) : null}

        {diffQuery.isError ? (
          <div className="px-4 py-8 text-sm text-accent-red">Could not load diff</div>
        ) : null}

        {!diffQuery.isLoading && !diffQuery.isError && parsedDiff.length === 0 ? (
          <div className="px-4 py-8 text-sm text-text-muted">No changes</div>
        ) : null}

        {parsedDiff.map((fileSection) => (
          <div key={fileSection.file} className="border-b border-border last:border-0">
            <div className="px-4 py-2 text-xs font-mono text-text-secondary bg-bg-elevated">
              {fileSection.file}
            </div>
            <ReactDiffViewer
              oldValue={fileSection.oldText}
              newValue={fileSection.newText}
              splitView={false}
              hideLineNumbers={false}
              useDarkTheme={theme === 'dark'}
              styles={{
                variables: {
                  dark: {
                    diffViewerBackground: 'var(--bg-surface)',
                    addedBackground: 'var(--accent-green-subtle)',
                    removedBackground: 'var(--accent-red-subtle)',
                    wordAddedBackground: 'var(--accent-green)',
                    wordRemovedBackground: 'var(--accent-red)',
                    addedGutterBackground: 'var(--bg-elevated)',
                    removedGutterBackground: 'var(--bg-elevated)',
                    gutterBackground: 'var(--bg-elevated)',
                    gutterColor: 'var(--text-muted)',
                    addedColor: 'var(--text-primary)',
                    removedColor: 'var(--text-primary)',
                  },
                  light: {
                    diffViewerBackground: 'var(--bg-surface)',
                    addedBackground: 'var(--accent-green-subtle)',
                    removedBackground: 'var(--accent-red-subtle)',
                    wordAddedBackground: 'var(--accent-green)',
                    wordRemovedBackground: 'var(--accent-red)',
                    addedGutterBackground: 'var(--bg-elevated)',
                    removedGutterBackground: 'var(--bg-elevated)',
                    gutterBackground: 'var(--bg-elevated)',
                    gutterColor: 'var(--text-muted)',
                    addedColor: 'var(--text-primary)',
                    removedColor: 'var(--text-primary)',
                  },
                },
              }}
            />
          </div>
        ))}
      </Card>

      <Card className="mt-6" header={`Comments (${(commentsQuery.data ?? []).length})`} padding="none">
        {(commentsQuery.data ?? []).map((comment) => (
          <div key={comment.id} className="flex gap-3 px-4 py-4 border-b border-border last:border-0">
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

        <form
          className="p-4 border-t border-border"
          onSubmit={(e: FormEvent<HTMLFormElement>) => {
            e.preventDefault()
            if (!commentBody.trim() || !token) return
            addCommentMutation.mutate()
          }}
        >
          <textarea
            rows={3}
            placeholder="Add a comment..."
            value={commentBody}
            onChange={(e) => setCommentBody(e.target.value)}
            className="w-full bg-bg-subtle border border-border rounded px-3 py-2 text-sm text-text-primary"
          />
          <Button size="sm" className="mt-2" loading={addCommentMutation.isPending}>
            Comment
          </Button>
        </form>
      </Card>
    </div>
  )
}
