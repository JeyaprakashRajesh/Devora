import { useMemo, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft } from 'lucide-react'
import Avatar from '../../components/ui/Avatar'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Input from '../../components/ui/Input'
import Spinner from '../../components/ui/Spinner'
import { api } from '../../lib/api'
import { useAuthStore } from '../../store/auth'

type GroupUser = {
  id: string
  email: string
  username: string
  display_name?: string
  status: string
}

type GroupPermission = {
  id: string
  name: string
  project_id?: string
  project_name?: string
  access_level: 'read' | 'write' | 'full'
}

type GroupDetail = {
  id: string
  name: string
  description?: string
  members: GroupUser[]
  permissions: GroupPermission[]
  member_count: number
}

type UserItem = {
  id: string
  email: string
  username: string
  display_name?: string
}

type PermissionItem = {
  id: string
  name: string
  project_id?: string
  project_name?: string
  access_level: 'read' | 'write' | 'full'
}

type PermissionListResponse = {
  all: PermissionItem[]
}

function unwrapData<T>(payload: unknown): T {
  const wrapped = payload as { data?: T }
  return (wrapped?.data ?? payload) as T
}

function AccessBadge({ level }: { level: 'read' | 'write' | 'full' }) {
  if (level === 'read') return <Badge variant="info">Read</Badge>
  if (level === 'write') return <Badge variant="warning">Write</Badge>
  return <Badge variant="error">Full</Badge>
}

export default function GroupDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const can = useAuthStore((s) => s.can)

  const [userSearch, setUserSearch] = useState('')
  const [selectedPermissionId, setSelectedPermissionId] = useState('')

  if (!can('group', 'read')) {
    return <Navigate to="/dashboard" replace />
  }

  const groupQuery = useQuery({
    queryKey: ['group', id],
    queryFn: async () => {
      const res = await api.get(`/groups/${id}`)
      return unwrapData<GroupDetail>(res.data)
    },
    enabled: Boolean(id),
  })

  const usersQuery = useQuery({
    queryKey: ['users-for-group', id],
    queryFn: async () => {
      const res = await api.get('/users')
      return unwrapData<UserItem[]>(res.data)
    },
    enabled: can('group', 'manage'),
  })

  const permissionsQuery = useQuery({
    queryKey: ['permissions-for-group', id],
    queryFn: async () => {
      const res = await api.get('/permissions/project')
      return unwrapData<PermissionListResponse>(res.data)
    },
    enabled: can('org', 'manage'),
  })

  const addMemberMutation = useMutation({
    mutationFn: async (userId: string) => {
      await api.post(`/groups/${id}/members`, { user_id: userId })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group', id] })
    },
  })

  const removeMemberMutation = useMutation({
    mutationFn: async (userId: string) => {
      await api.delete(`/groups/${id}/members/${userId}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group', id] })
    },
  })

  const assignPermissionMutation = useMutation({
    mutationFn: async (permissionId: string) => {
      await api.post(`/groups/${id}/permissions`, { permission_id: permissionId })
    },
    onSuccess: () => {
      setSelectedPermissionId('')
      queryClient.invalidateQueries({ queryKey: ['group', id] })
    },
  })

  const removePermissionMutation = useMutation({
    mutationFn: async (permissionId: string) => {
      await api.delete(`/groups/${id}/permissions/${permissionId}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group', id] })
    },
  })

  const group = groupQuery.data
  const existingMemberIds = useMemo(() => new Set((group?.members ?? []).map((m) => m.id)), [group?.members])
  const existingPermissionIds = useMemo(() => new Set((group?.permissions ?? []).map((p) => p.id)), [group?.permissions])

  const memberCandidates = useMemo(() => {
    const q = userSearch.trim().toLowerCase()
    return (usersQuery.data ?? [])
      .filter((u) => !existingMemberIds.has(u.id))
      .filter((u) => {
        if (!q) return true
        return u.email.toLowerCase().includes(q) || u.username.toLowerCase().includes(q) || (u.display_name ?? '').toLowerCase().includes(q)
      })
      .slice(0, 8)
  }, [usersQuery.data, existingMemberIds, userSearch])

  const assignablePermissions = useMemo(
    () => (permissionsQuery.data?.all ?? []).filter((p) => !existingPermissionIds.has(p.id)),
    [permissionsQuery.data, existingPermissionIds]
  )

  const permissionsByProject = useMemo(() => {
    const map = new Map<string, PermissionItem[]>()
    assignablePermissions.forEach((permission) => {
      const key = permission.project_name ?? 'Org-Wide'
      const curr = map.get(key) ?? []
      map.set(key, [...curr, permission])
    })
    return map
  }, [assignablePermissions])

  if (groupQuery.isLoading) {
    return <div className="py-16 flex justify-center"><Spinner size="lg" /></div>
  }

  if (!group || groupQuery.isError) {
    return <div className="text-sm text-accent-red">Failed to load group details.</div>
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/admin/groups')}>
            <ChevronLeft className="w-4 h-4" />
            Back
          </Button>
          <div>
            <h1 className="text-lg font-semibold text-text-primary">{group.name}</h1>
            <p className="text-sm text-text-muted mt-0.5">{group.description || 'No description'}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card header={`Members (${group.member_count})`} padding="none">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left text-[11px] uppercase tracking-wide text-text-muted font-medium px-4 py-3">User</th>
                <th className="text-left text-[11px] uppercase tracking-wide text-text-muted font-medium px-4 py-3">Status</th>
                <th className="text-right text-[11px] uppercase tracking-wide text-text-muted font-medium px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {group.members.map((member) => (
                <tr key={member.id} className="border-b border-border last:border-0 hover:bg-bg-subtle transition-colors">
                  <td className="px-4 py-3 text-sm text-text-primary">
                    <div className="flex items-center gap-2">
                      <Avatar size="sm" name={member.display_name ?? member.username} />
                      <div>
                        <p>{member.display_name ?? member.username}</p>
                        <p className="text-xs text-text-muted">{member.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{member.status}</td>
                  <td className="px-4 py-3 text-right">
                    {can('group', 'manage') ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        loading={removeMemberMutation.isPending}
                        onClick={() => removeMemberMutation.mutate(member.id)}
                      >
                        Remove
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {group.members.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <p className="text-sm font-medium text-text-secondary">No members yet</p>
            </div>
          ) : null}

          {can('group', 'manage') ? (
            <div className="border-t border-border p-4">
              <p className="text-xs text-text-muted mb-2">Add Member</p>
              <Input placeholder="Search users..." value={userSearch} onChange={(e) => setUserSearch(e.target.value)} />
              <div className="mt-2 border border-border rounded bg-bg-elevated">
                {memberCandidates.length === 0 ? (
                  <p className="text-xs text-text-muted px-3 py-2">No matching users</p>
                ) : (
                  memberCandidates.map((candidate) => (
                    <button
                      key={candidate.id}
                      type="button"
                      onClick={() => addMemberMutation.mutate(candidate.id)}
                      className="w-full text-left px-3 py-2 hover:bg-bg-subtle text-sm text-text-primary border-b border-border last:border-0"
                    >
                      {candidate.display_name ?? candidate.username}
                      <span className="text-xs text-text-muted ml-2">{candidate.email}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          ) : null}
        </Card>

        <Card header="Permissions" padding="none">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left text-[11px] uppercase tracking-wide text-text-muted font-medium px-4 py-3">Permission</th>
                <th className="text-left text-[11px] uppercase tracking-wide text-text-muted font-medium px-4 py-3">Access</th>
                <th className="text-left text-[11px] uppercase tracking-wide text-text-muted font-medium px-4 py-3">Project</th>
                <th className="text-right text-[11px] uppercase tracking-wide text-text-muted font-medium px-4 py-3">Remove</th>
              </tr>
            </thead>
            <tbody>
              {group.permissions.map((permission) => (
                <tr key={permission.id} className="border-b border-border last:border-0 hover:bg-bg-subtle transition-colors">
                  <td className="px-4 py-3 text-sm text-text-primary">{permission.name}</td>
                  <td className="px-4 py-3 text-sm"><AccessBadge level={permission.access_level} /></td>
                  <td className="px-4 py-3 text-xs text-text-muted">{permission.project_name ?? 'Org-Wide'}</td>
                  <td className="px-4 py-3 text-right">
                    {can('org', 'manage') ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        loading={removePermissionMutation.isPending}
                        onClick={() => removePermissionMutation.mutate(permission.id)}
                      >
                        Remove
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {group.permissions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <p className="text-sm font-medium text-text-secondary">No permissions assigned</p>
            </div>
          ) : null}

          {can('org', 'manage') ? (
            <div className="border-t border-border p-4 space-y-3">
              <p className="text-xs text-text-muted">Assign Permission</p>
              <select
                value={selectedPermissionId}
                onChange={(e) => setSelectedPermissionId(e.target.value)}
                className="bg-bg-subtle border border-border rounded px-3 py-2 text-text-primary text-sm w-full"
              >
                <option value="">Select permission</option>
                {Array.from(permissionsByProject.entries()).map(([projectName, items]) => (
                  <optgroup key={projectName} label={projectName}>
                    {items.map((permission) => (
                      <option key={permission.id} value={permission.id}>
                        {permission.name} ({permission.access_level})
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>

              <Button
                variant="primary"
                disabled={!selectedPermissionId}
                loading={assignPermissionMutation.isPending}
                onClick={() => assignPermissionMutation.mutate(selectedPermissionId)}
              >
                Assign
              </Button>

              <p className="text-xs text-text-muted">
                Assigning a permission here will automatically remove it from any group members who have it individually.
              </p>
            </div>
          ) : null}
        </Card>
      </div>
    </div>
  )
}
