import { FormEvent, useMemo, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Input from '../../components/ui/Input'
import { api } from '../../lib/api'
import { slugify } from '../../lib/format'
import { useAuthStore } from '../../store/auth'
import type { Project } from './types'
import { unwrapData } from './utils'

const slugPattern = /^[a-z0-9-]+$/

export default function NewProjectPage() {
  const navigate = useNavigate()
  const can = useAuthStore((s) => s.can)

  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [description, setDescription] = useState('')
  const [visibility, setVisibility] = useState<'private' | 'internal' | 'public'>('private')
  const [error, setError] = useState('')

  const normalizedSlug = useMemo(() => (slugTouched ? slug : slugify(name)), [name, slug, slugTouched])

  if (!can('project', 'create')) {
    return <Navigate to="/projects" replace />
  }

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/projects', {
        name: name.trim(),
        slug: normalizedSlug,
        description: description.trim() || null,
        visibility,
      })
      return unwrapData<Project>(res.data)
    },
    onSuccess: (project) => {
      navigate(`/projects/${project.id}`)
    },
    onError: (err: unknown) => {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Failed to create project'
      setError(message)
    },
  })

  const slugError =
    normalizedSlug.length < 2
      ? 'Slug must be at least 2 characters'
      : !slugPattern.test(normalizedSlug)
        ? 'Slug must match /^[a-z0-9-]+$/'
        : ''

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')

    if (!name.trim()) {
      setError('Project name is required')
      return
    }
    if (slugError) {
      setError(slugError)
      return
    }

    createMutation.mutate()
  }

  return (
    <div className="max-w-lg mx-auto">
      <Card padding="md">
        <h1 className="text-lg font-semibold text-text-primary">Create Project</h1>

        <form className="mt-4 space-y-3" onSubmit={onSubmit}>
          <Input
            label="Project Name"
            required
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <Input
            label="Slug"
            value={normalizedSlug}
            onChange={(e) => {
              setSlugTouched(true)
              setSlug(e.target.value)
            }}
            error={slugError || undefined}
            helper="Used in URLs and Git repository name"
          />

          <div className="flex flex-col gap-1">
            <label className="text-xs text-text-secondary font-medium">Description</label>
            <textarea
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="bg-bg-subtle border border-border rounded px-3 py-2 text-text-primary text-sm outline-none focus:border-accent-amber focus:ring-2 focus:ring-amber-glow"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-text-secondary font-medium">Visibility</label>
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as 'private' | 'internal' | 'public')}
              className="bg-bg-subtle border border-border rounded px-3 py-2 text-text-primary text-sm outline-none focus:border-accent-amber focus:ring-2 focus:ring-amber-glow"
            >
              <option value="private">private</option>
              <option value="internal">internal</option>
              <option value="public">public</option>
            </select>
          </div>

          <Button type="submit" className="w-full" loading={createMutation.isPending}>
            Create Project
          </Button>

          {error ? <p className="text-sm text-accent-red">{error}</p> : null}
        </form>
      </Card>
    </div>
  )
}
