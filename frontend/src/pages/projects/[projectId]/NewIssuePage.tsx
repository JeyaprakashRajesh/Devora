import { FormEvent, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import Button from '../../../components/ui/Button'
import Card from '../../../components/ui/Card'
import Input from '../../../components/ui/Input'
import { api } from '../../../lib/api'
import type { Issue } from '../types'
import { unwrapData } from '../utils'

export default function NewIssuePage() {
  const navigate = useNavigate()
  const { projectId } = useParams<{ projectId: string }>()

  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'critical'>('medium')
  const [type, setType] = useState<'task' | 'bug' | 'feature'>('task')
  const [status, setStatus] = useState<'open' | 'in_progress'>('open')
  const [error, setError] = useState('')

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post(`/projects/${projectId}/issues`, {
        title: title.trim(),
        body: body.trim() || null,
        priority,
        type,
        status,
      })
      return unwrapData<Issue>(res.data)
    },
    onSuccess: (issue) => {
      navigate(`/projects/${projectId}/issues/${issue.number}`)
    },
    onError: (err: unknown) => {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Failed to create issue'
      setError(message)
    },
  })

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')
    if (!title.trim()) {
      setError('Title is required')
      return
    }
    createMutation.mutate()
  }

  return (
    <div className="max-w-2xl mx-auto">
      <Card padding="md">
        <h1 className="text-lg font-semibold text-text-primary">New Issue</h1>

        <form className="mt-4 space-y-3" onSubmit={onSubmit}>
          <Input
            label="Title"
            required
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />

          <div className="flex flex-col gap-1">
            <label className="text-xs text-text-secondary font-medium">Description</label>
            <textarea
              rows={6}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="bg-bg-subtle border border-border rounded px-3 py-2 text-text-primary text-sm outline-none focus:border-accent-amber focus:ring-2 focus:ring-amber-glow"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-text-secondary font-medium">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as 'low' | 'medium' | 'high' | 'critical')}
                className="bg-bg-subtle border border-border rounded px-3 py-2 text-text-primary text-sm"
              >
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
                <option value="critical">critical</option>
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-text-secondary font-medium">Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as 'task' | 'bug' | 'feature')}
                className="bg-bg-subtle border border-border rounded px-3 py-2 text-text-primary text-sm"
              >
                <option value="task">task</option>
                <option value="bug">bug</option>
                <option value="feature">feature</option>
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-text-secondary font-medium">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as 'open' | 'in_progress')}
                className="bg-bg-subtle border border-border rounded px-3 py-2 text-text-primary text-sm"
              >
                <option value="open">open</option>
                <option value="in_progress">in_progress</option>
              </select>
            </div>
          </div>

          <Button type="submit" loading={createMutation.isPending}>
            Create Issue
          </Button>

          {error ? <p className="text-sm text-accent-red">{error}</p> : null}
        </form>
      </Card>
    </div>
  )
}
