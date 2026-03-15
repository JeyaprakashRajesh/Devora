import { FormEvent, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Navigate, useNavigate } from 'react-router-dom'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Input from '../../components/ui/Input'
import Spinner from '../../components/ui/Spinner'
import { api } from '../../lib/api'
import { useAuthStore } from '../../store/auth'
import type { DeployContainer, Project } from '../projects/types'
import { unwrapData } from '../projects/utils'

function statusBadge(status: DeployContainer['status']) {
  if (status === 'running') return <Badge variant="success">running</Badge>
  if (status === 'creating') {
    return (
      <Badge variant="info">
        <span className="inline-flex items-center gap-1">
          <Spinner size="sm" /> creating
        </span>
      </Badge>
    )
  }
  if (status === 'error') return <Badge variant="error">error</Badge>
  return <Badge variant="default">stopped</Badge>
}

function parseEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const idx = trimmed.indexOf('=')
    if (idx <= 0) continue
    const key = trimmed.slice(0, idx).trim()
    const value = trimmed.slice(idx + 1).trim()
    if (!key) continue
    out[key] = value
  }
  return out
}

export default function ContainersPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const can = useAuthStore((s) => s.can)

  const [showModal, setShowModal] = useState(false)
  const [name, setName] = useState('')
  const [image, setImage] = useState('')
  const [hostPort, setHostPort] = useState('')
  const [internalPort, setInternalPort] = useState('3000')
  const [envVarsText, setEnvVarsText] = useState('')
  const [projectId, setProjectId] = useState('')
  const [error, setError] = useState('')

  if (!can('deployment', 'read')) {
    return <Navigate to="/dashboard" replace />
  }

  const containersQuery = useQuery({
    queryKey: ['deploy-containers'],
    queryFn: async () => {
      const res = await api.get('/deploy/containers')
      return unwrapData<DeployContainer[]>(res.data)
    },
    refetchInterval: 10000,
  })

  const projectsQuery = useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const res = await api.get('/projects')
      return unwrapData<Project[]>(res.data)
    },
    enabled: showModal,
  })

  const createMutation = useMutation({
    mutationFn: async () => {
      await api.post('/deploy/containers', {
        name,
        image,
        host_port: Number(hostPort),
        internal_port: Number(internalPort),
        env_vars: parseEnv(envVarsText),
        project_id: projectId || null,
      })
    },
    onSuccess: () => {
      setShowModal(false)
      setName('')
      setImage('')
      setHostPort('')
      setInternalPort('3000')
      setEnvVarsText('')
      setProjectId('')
      queryClient.invalidateQueries({ queryKey: ['deploy-containers'] })
    },
    onError: (err: unknown) => {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Failed to allocate container'
      setError(message)
    },
  })

  const startMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.post(`/deploy/containers/${id}/start`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deploy-containers'] })
    },
  })

  const stopMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.post(`/deploy/containers/${id}/stop`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deploy-containers'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/deploy/containers/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deploy-containers'] })
    },
  })

  const containers = useMemo(() => containersQuery.data ?? [], [containersQuery.data])

  const allocateSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')

    if (!name.trim() || !image.trim() || !hostPort.trim()) {
      setError('Name, image and host port are required')
      return
    }

    createMutation.mutate()
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-text-primary">Deployment Containers</h1>
          <p className="text-sm text-text-muted mt-0.5">Docker containers for project deployments</p>
        </div>
        {can('deployment', 'create') ? (
          <Button size="sm" onClick={() => setShowModal(true)}>
            Allocate Container
          </Button>
        ) : null}
      </div>

      <Card className="mt-4" padding="none">
        {containersQuery.isLoading ? (
          <div className="py-12 flex justify-center">
            <Spinner size="lg" />
          </div>
        ) : null}

        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left text-[11px] uppercase tracking-wide text-text-muted font-medium px-4 py-3">Name</th>
              <th className="text-left text-[11px] uppercase tracking-wide text-text-muted font-medium px-4 py-3">Image</th>
              <th className="text-left text-[11px] uppercase tracking-wide text-text-muted font-medium px-4 py-3">Project</th>
              <th className="text-left text-[11px] uppercase tracking-wide text-text-muted font-medium px-4 py-3">Status</th>
              <th className="text-left text-[11px] uppercase tracking-wide text-text-muted font-medium px-4 py-3">Port</th>
              <th className="text-right text-[11px] uppercase tracking-wide text-text-muted font-medium px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {containers.map((container) => (
              <tr key={container.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 text-sm font-mono text-text-primary">devora-{container.name}</td>
                <td className="px-4 py-3 text-xs font-mono text-text-muted">{container.image}</td>
                <td className="px-4 py-3 text-sm text-text-secondary">{container.project_name ?? '—'}</td>
                <td className="px-4 py-3">{statusBadge(container.status)}</td>
                <td className="px-4 py-3 text-xs font-mono text-text-muted">
                  {container.host_port ?? '—'}:{container.internal_port ?? '—'}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex gap-2">
                    {container.status === 'running' ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        loading={stopMutation.isPending}
                        onClick={() => stopMutation.mutate(container.id)}
                      >
                        Stop
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="secondary"
                        loading={startMutation.isPending}
                        onClick={() => startMutation.mutate(container.id)}
                      >
                        Start
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => navigate(`/deploy/containers/${container.id}`)}
                    >
                      View
                    </Button>
                    {can('deployment', 'delete') ? (
                      <Button
                        size="sm"
                        variant="destructive"
                        loading={deleteMutation.isPending}
                        onClick={() => {
                          if (window.confirm('Delete this container?')) {
                            deleteMutation.mutate(container.id)
                          }
                        }}
                      >
                        Delete
                      </Button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {showModal ? (
        <div className="fixed inset-0 bg-bg-base/70 flex items-center justify-center z-20 p-4">
          <Card className="w-full max-w-xl" padding="md" header="Allocate Container">
            <form className="space-y-3" onSubmit={allocateSubmit}>
              <Input
                label="Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                helper="Container will be named devora-{name}"
              />
              <Input
                label="Image"
                value={image}
                onChange={(e) => setImage(e.target.value)}
                placeholder="node:20-alpine"
              />

              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Host Port"
                  type="number"
                  value={hostPort}
                  onChange={(e) => setHostPort(e.target.value)}
                />
                <Input
                  label="Internal Port"
                  type="number"
                  value={internalPort}
                  onChange={(e) => setInternalPort(e.target.value)}
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs text-text-secondary font-medium">Environment Variables</label>
                <textarea
                  rows={4}
                  value={envVarsText}
                  onChange={(e) => setEnvVarsText(e.target.value)}
                  placeholder="KEY=value"
                  className="bg-bg-subtle border border-border rounded px-3 py-2 text-sm text-text-primary font-mono"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs text-text-secondary font-medium">Assign to Project</label>
                <select
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className="bg-bg-subtle border border-border rounded px-3 py-2 text-sm text-text-primary"
                >
                  <option value="">Unassigned</option>
                  {(projectsQuery.data ?? []).map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </div>

              {createMutation.isPending ? (
                <p className="text-xs text-text-muted">Pulling image, please wait...</p>
              ) : null}
              {error ? <p className="text-sm text-accent-red">{error}</p> : null}

              <div className="flex items-center justify-end gap-2">
                <Button variant="ghost" onClick={() => setShowModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" loading={createMutation.isPending}>
                  Allocate
                </Button>
              </div>
            </form>
          </Card>
        </div>
      ) : null}
    </div>
  )
}
