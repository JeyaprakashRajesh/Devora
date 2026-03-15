import { FormEvent, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Eye, PenLine, Pencil, Shield, Trash2 } from 'lucide-react'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Input from '../../components/ui/Input'
import Spinner from '../../components/ui/Spinner'
import { api } from '../../lib/api'
import { useAuthStore } from '../../store/auth'

type Permission = {
  id: string
  org_id: string
  name: string
  description?: string
  project_id?: string | null
  project_name?: string | null
  access_level: 'read' | 'write' | 'full'
  user_count?: number
  group_count?: number
}

type PermissionResponse = {
  all: Permission[]
  by_project: Record<string, { project_name: string; permissions: Permission[] }>
  org_wide: Permission[]
}

type ProjectItem = {
  id: string
  name: string
}

function unwrapData<T>(payload: unknown): T {
  const wrapped = payload as { data?: T }
  return (wrapped?.data ?? payload) as T
}

function LevelBadge({ level }: { level: Permission['access_level'] }) {
  if (level === 'read') return <Badge variant="info">Read</Badge>
  if (level === 'write') return <Badge variant="warning">Write</Badge>
  return <Badge variant="error">Full Access</Badge>
}

export default function PermissionsPage() {
  const can = useAuthStore((s) => s.can)
  const queryClient = useQueryClient()

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Permission | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [projectId, setProjectId] = useState('')
  const [accessLevel, setAccessLevel] = useState<Permission['access_level']>('read')
  const [error, setError] = useState('')

  if (!can('org', 'read')) {
    return <Navigate to="/dashboard" replace />
  }

  const permissionsQuery = useQuery({
    queryKey: ['project-permissions'],
    queryFn: async () => {
      const res = await api.get('/permissions/project')
      return unwrapData<PermissionResponse>(res.data)
    },
  })

  const projectsQuery = useQuery({
    queryKey: ['projects-for-permissions'],
    queryFn: async () => {
      const res = await api.get('/projects')
      return unwrapData<ProjectItem[]>(res.data)
    },
    enabled: open,
  })

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name,
        description: description || null,
        project_id: projectId || null,
        access_level: accessLevel,
      }
      if (editing) {
        await api.patch(`/permissions/project/${editing.id}`, payload)
      } else {
        await api.post('/permissions/project', payload)
      }
    },
    onSuccess: () => {
      closeModal()
      queryClient.invalidateQueries({ queryKey: ['project-permissions'] })
    },
    onError: (err: unknown) => {
      const maybeErr = err as { response?: { data?: { error?: string } }; message?: string }
      setError(maybeErr.response?.data?.error ?? maybeErr.message ?? 'Failed to save permission')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/permissions/project/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-permissions'] })
    },
  })

  const grouped = useMemo(() => {
    if (!permissionsQuery.data) return [] as Array<{ key: string; title: string; permissions: Permission[] }>
    const groups: Array<{ key: string; title: string; permissions: Permission[] }> = []
    groups.push({ key: 'org-wide', title: 'Org-Wide', permissions: permissionsQuery.data.org_wide ?? [] })
    Object.entries(permissionsQuery.data.by_project ?? {}).forEach(([pid, bucket]) => {
      groups.push({ key: pid, title: bucket.project_name, permissions: bucket.permissions ?? [] })
    })
    return groups
  }, [permissionsQuery.data])

  const openCreate = () => {
    setEditing(null)
    setName('')
    setDescription('')
    setProjectId('')
    setAccessLevel('read')
    setError('')
    setOpen(true)
  }

  const openEdit = (perm: Permission) => {
    setEditing(perm)
    setName(perm.name)
    setDescription(perm.description ?? '')
    setProjectId(perm.project_id ?? '')
    setAccessLevel(perm.access_level)
    setError('')
    setOpen(true)
  }

  const closeModal = () => {
    setOpen(false)
    setEditing(null)
    setError('')
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setError('Permission name is required')
      return
    }
    setError('')
    createMutation.mutate()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-text-primary">Permissions</h1>
          <p className="text-sm text-text-muted mt-0.5">Project-based access controls</p>
        </div>
        {can('org', 'manage') ? (
          <Button variant="primary" size="sm" onClick={openCreate}>
            New Permission
          </Button>
        ) : null}
      </div>

      {permissionsQuery.isLoading ? (
        <div className="py-16 flex justify-center">
          <Spinner size="lg" />
        </div>
      ) : permissionsQuery.isError ? (
        <div className="text-sm text-accent-red">Failed to load permissions.</div>
      ) : (
        <div className="space-y-4">
          {grouped.map((group) => (
            <Card key={group.key} header={group.title} padding="none">
              {group.permissions.length === 0 ? (
                <div className="py-10 text-center text-sm text-text-muted">No permissions for this project</div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left text-[11px] uppercase tracking-wide text-text-muted font-medium px-4 py-3">Name</th>
                      <th className="text-left text-[11px] uppercase tracking-wide text-text-muted font-medium px-4 py-3">Access Level</th>
                      <th className="text-left text-[11px] uppercase tracking-wide text-text-muted font-medium px-4 py-3">Description</th>
                      <th className="text-left text-[11px] uppercase tracking-wide text-text-muted font-medium px-4 py-3">In Use</th>
                      <th className="text-right text-[11px] uppercase tracking-wide text-text-muted font-medium px-4 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.permissions.map((perm) => (
                      <tr key={perm.id} className="border-b border-border last:border-0">
                        <td className="px-4 py-3 text-sm font-medium text-text-primary">{perm.name}</td>
                        <td className="px-4 py-3 text-sm text-text-secondary"><LevelBadge level={perm.access_level} /></td>
                        <td className="px-4 py-3 text-xs text-text-muted">{perm.description || '—'}</td>
                        <td className="px-4 py-3 text-xs text-text-muted">{perm.group_count ?? 0} groups, {perm.user_count ?? 0} users</td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex gap-2">
                            {can('org', 'manage') ? (
                              <Button variant="ghost" size="sm" onClick={() => openEdit(perm)}>
                                <Pencil className="w-4 h-4" />
                              </Button>
                            ) : null}
                            {can('org', 'manage') ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  if (window.confirm('Delete this permission?')) {
                                    deleteMutation.mutate(perm.id)
                                  }
                                }}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          ))}
        </div>
      )}

      {open ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-bg-base/70 p-4">
          <Card className="w-full max-w-[400px]" padding="md">
            <h2 className="text-base font-semibold text-text-primary">{editing ? 'Edit Permission' : 'Create Permission'}</h2>
            <form className="mt-4 space-y-3" onSubmit={submit}>
              <Input
                label="Permission Name"
                placeholder="e.g. Frontend Team - Write"
                helper="Give it a descriptive name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />

              <Input
                label="Description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />

              <div className="flex flex-col gap-1">
                <label className="text-xs text-text-secondary font-medium">Project</label>
                <select
                  className="bg-bg-subtle border border-border rounded px-3 py-2 text-text-primary text-sm"
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                >
                  <option value="">Org-Wide (all projects)</option>
                  {(projectsQuery.data ?? []).map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs text-text-secondary font-medium">Access Level</label>
                <select
                  className="bg-bg-subtle border border-border rounded px-3 py-2 text-text-primary text-sm"
                  value={accessLevel}
                  onChange={(e) => setAccessLevel(e.target.value as Permission['access_level'])}
                >
                  <option value="read">Read - Can view project, issues, code, pipelines</option>
                  <option value="write">Write - Can create issues, push code, trigger pipelines</option>
                  <option value="full">Full - Full access including settings and deployments</option>
                </select>
                <p className="text-xs text-text-muted inline-flex items-center gap-2">
                  {accessLevel === 'read' ? <Eye className="w-3 h-3 text-accent-blue" /> : null}
                  {accessLevel === 'write' ? <PenLine className="w-3 h-3 text-accent-amber" /> : null}
                  {accessLevel === 'full' ? <Shield className="w-3 h-3 text-accent-red" /> : null}
                  {accessLevel === 'read' ? 'Read access' : accessLevel === 'write' ? 'Write access' : 'Full access'}
                </p>
              </div>

              {error ? <p className="text-sm text-accent-red">{error}</p> : null}

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" onClick={closeModal} type="button">Cancel</Button>
                <Button type="submit" variant="primary" loading={createMutation.isPending}>
                  {editing ? 'Save' : 'Create'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      ) : null}
    </div>
  )
}
