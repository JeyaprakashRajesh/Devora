import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Spinner from '../../components/ui/Spinner'
import { api } from '../../lib/api'
import { createSSEStream } from '../../lib/sse'
import { useAuthStore } from '../../store/auth'
import type { DeployContainer, Project } from '../projects/types'
import { unwrapData } from '../projects/utils'

function statusBadge(status: DeployContainer['status']) {
  if (status === 'running') return <Badge variant="success">running</Badge>
  if (status === 'error') return <Badge variant="error">error</Badge>
  if (status === 'creating') return <Badge variant="info">creating</Badge>
  return <Badge variant="default">stopped</Badge>
}

export default function ContainerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const token = useAuthStore((s) => s.token)
  const can = useAuthStore((s) => s.can)

  const [logs, setLogs] = useState('')
  const [showAssign, setShowAssign] = useState(false)
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const preRef = useRef<HTMLPreElement | null>(null)

  const containerQuery = useQuery({
    queryKey: ['deploy-container', id],
    queryFn: async () => {
      const res = await api.get(`/deploy/containers/${id}`)
      return unwrapData<DeployContainer>(res.data)
    },
    enabled: Boolean(id),
    refetchInterval: 5000,
  })

  const projectsQuery = useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const res = await api.get('/projects')
      return unwrapData<Project[]>(res.data)
    },
    enabled: showAssign,
  })

  const startMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/deploy/containers/${id}/start`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deploy-container', id] })
      queryClient.invalidateQueries({ queryKey: ['deploy-containers'] })
    },
  })

  const stopMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/deploy/containers/${id}/stop`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deploy-container', id] })
      queryClient.invalidateQueries({ queryKey: ['deploy-containers'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await api.delete(`/deploy/containers/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deploy-containers'] })
      navigate('/deploy/containers')
    },
  })

  const assignMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/deploy/containers/${id}/assign`, {
        project_id: selectedProjectId || null,
      })
    },
    onSuccess: () => {
      setShowAssign(false)
      queryClient.invalidateQueries({ queryKey: ['deploy-container', id] })
      queryClient.invalidateQueries({ queryKey: ['deploy-containers'] })
    },
  })

  const container = containerQuery.data

  useEffect(() => {
    if (!container || container.status !== 'running' || !token || !id) return

    const cleanup = createSSEStream(`/api/deploy/containers/${id}/logs`, token, (data) => {
      setLogs((prev) => `${prev}${data.replace(/\\n/g, '\n')}`)
    })

    return cleanup
  }, [container, token, id])

  useEffect(() => {
    if (preRef.current) {
      preRef.current.scrollTop = preRef.current.scrollHeight
    }
  }, [logs])

  const projectName = useMemo(() => {
    const projects = projectsQuery.data ?? []
    return projects.find((p) => p.id === container?.project_id)?.name ?? container?.project_name ?? 'Unassigned'
  }, [projectsQuery.data, container?.project_id, container?.project_name])

  if (containerQuery.isLoading) {
    return (
      <div className="py-16 flex justify-center">
        <Spinner size="lg" />
      </div>
    )
  }

  if (!container || containerQuery.isError) {
    return <div className="text-sm text-accent-red">Failed to load container.</div>
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div>
          <Button variant="ghost" size="sm" onClick={() => navigate('/deploy/containers')}>
            Back
          </Button>
          <h1 className="text-lg font-semibold font-mono text-text-primary mt-2">devora-{container.name}</h1>
          <div className="mt-1 flex items-center gap-2">
            {statusBadge(container.status)}
            <span className="text-sm text-text-muted font-mono">{container.image}</span>
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2 flex-wrap">
        {container.status === 'stopped' ? (
          <Button loading={startMutation.isPending} onClick={() => startMutation.mutate()}>
            Start
          </Button>
        ) : null}

        {container.status === 'running' ? (
          <Button variant="destructive" loading={stopMutation.isPending} onClick={() => stopMutation.mutate()}>
            Stop
          </Button>
        ) : null}

        {can('deployment', 'delete') ? (
          <Button
            variant="destructive"
            className="bg-transparent text-accent-red"
            loading={deleteMutation.isPending}
            onClick={() => {
              if (window.confirm('Delete this container?')) {
                deleteMutation.mutate()
              }
            }}
          >
            Delete
          </Button>
        ) : null}

        {can('deployment', 'manage') ? (
          <Button variant="secondary" onClick={() => setShowAssign(true)}>
            Assign to Project
          </Button>
        ) : null}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
        <Card header="Image" padding="md">
          <p className="font-mono text-sm text-text-secondary">{container.image}</p>
        </Card>
        <Card header="Port" padding="md">
          <p className="font-mono text-sm text-text-secondary">
            {container.host_port ?? '—'} → {container.internal_port ?? '—'}
          </p>
        </Card>
        <Card header="Project" padding="md">
          <p className="text-sm text-text-secondary">{projectName}</p>
        </Card>
      </div>

      <Card className="mt-6" header="Container Logs" padding="none">
        {container.status !== 'running' ? (
          <p className="px-4 py-4 text-sm text-text-muted">Container is stopped — start it to see live logs</p>
        ) : (
          <pre
            ref={preRef}
            className="max-h-[400px] overflow-auto bg-bg-base p-4 font-mono text-xs text-text-primary"
          >
            {logs}
          </pre>
        )}
      </Card>

      {showAssign ? (
        <div className="fixed inset-0 bg-bg-base/70 flex items-center justify-center z-20 p-4">
          <Card className="w-full max-w-md" padding="md" header="Assign to Project">
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="w-full bg-bg-subtle border border-border rounded px-3 py-2 text-sm text-text-primary"
            >
              <option value="">Unassigned</option>
              {(projectsQuery.data ?? []).map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>

            <div className="mt-3 flex items-center justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowAssign(false)}>
                Cancel
              </Button>
              <Button loading={assignMutation.isPending} onClick={() => assignMutation.mutate()}>
                Assign
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  )
}
