import { useMemo, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Avatar from '../../components/ui/Avatar'
import Spinner from '../../components/ui/Spinner'
import Button from '../../components/ui/Button'
import { api } from '../../lib/api'
import { useAuthStore } from '../../store/auth'

type UserDetail = {
  id: string
  email: string
  username: string
  display_name?: string
  status: 'active' | 'suspended' | 'invited'
  is_org_owner: boolean
  last_seen_at?: string
  created_at: string
}

type UserRoleAssignment = {
  assignment_id: string
  role_id: string
  name: string
  is_system: boolean
  resource_type?: string
  resource_id?: string
  expires_at?: string
}

type RoleOption = {
  id: string
  name: string
}

function unwrapData<T>(payload: unknown): T {
  const wrapped = payload as { data?: T }
  return (wrapped?.data ?? payload) as T
}

function fmtDate(value?: string) {
  if (!value) return '—'
  return new Date(value).toLocaleString()
}

function StatusBadge({ status }: { status: UserDetail['status'] }) {
  if (status === 'active') return <Badge variant="success">Active</Badge>
  if (status === 'suspended') return <Badge variant="warning">Suspended</Badge>
  return <Badge variant="info">Invited</Badge>
}

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()
  const can = useAuthStore((s) => s.can)
  const [selectedRoleId, setSelectedRoleId] = useState('')
  const [showAssignForm, setShowAssignForm] = useState(false)

  if (!can('user', 'read')) {
    return <Navigate to="/dashboard" replace />
  }

  const userQuery = useQuery({
    queryKey: ['user', id],
    queryFn: async () => {
      const res = await api.get(`/users/${id}`)
      return unwrapData<UserDetail>(res.data)
    },
    enabled: Boolean(id),
  })

  const userRolesQuery = useQuery({
    queryKey: ['user-roles', id],
    queryFn: async () => {
      const res = await api.get(`/users/${id}/roles`)
      return unwrapData<UserRoleAssignment[]>(res.data)
    },
    enabled: Boolean(id),
  })

  const rolesQuery = useQuery({
    queryKey: ['roles-options'],
    queryFn: async () => {
      const res = await api.get('/roles')
      const roles = unwrapData<RoleOption[]>(res.data)
      return roles
    },
    enabled: can('role', 'manage'),
  })

  const assignMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/users/${id}/roles`, { role_id: selectedRoleId })
    },
    onSuccess: () => {
      setSelectedRoleId('')
      queryClient.invalidateQueries({ queryKey: ['user-roles', id] })
    },
  })

  const revokeMutation = useMutation({
    mutationFn: async (roleId: string) => {
      await api.delete(`/users/${id}/roles/${roleId}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-roles', id] })
    },
  })

  const assignedRoleIds = useMemo(
    () => new Set((userRolesQuery.data ?? []).map((r) => r.role_id)),
    [userRolesQuery.data]
  )

  const assignableRoles = (rolesQuery.data ?? []).filter((r) => !assignedRoleIds.has(r.id))

  if (userQuery.isLoading || userRolesQuery.isLoading) {
    return (
      <div className="py-16 flex justify-center">
        <Spinner size="lg" />
      </div>
    )
  }

  if (userQuery.isError || !userQuery.data) {
    return <div className="text-sm text-accent-red">Failed to load user details.</div>
  }

  const user = userQuery.data
  const assignments = userRolesQuery.data ?? []

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      <div className="xl:col-span-1">
        <Card padding="md">
          <div className="flex flex-col items-center text-center">
            <Avatar size="lg" name={user.display_name ?? user.username} />
            <p className="text-base font-semibold text-text-primary mt-3">{user.display_name ?? user.username}</p>
            <p className="text-sm text-text-muted">{user.email}</p>
            <div className="mt-3">
              <StatusBadge status={user.status} />
            </div>
            {user.is_org_owner ? (
              <div className="mt-2">
                <Badge variant="warning">Organization Owner</Badge>
              </div>
            ) : null}
            <p className="text-xs text-text-muted mt-4">Joined: {fmtDate(user.created_at)}</p>
            <p className="text-xs text-text-muted mt-1">Last seen: {fmtDate(user.last_seen_at)}</p>
          </div>
        </Card>
      </div>

      <div className="xl:col-span-2">
        <Card
          header={
            <div className="flex items-center justify-between">
              <span>Assigned Roles</span>
              {can('role', 'manage') ? (
                <Button variant="secondary" size="sm" onClick={() => setShowAssignForm((v) => !v)}>
                  Assign Role
                </Button>
              ) : null}
            </div>
          }
          padding="none"
        >
          {assignments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <p className="text-sm font-medium text-text-secondary">No roles assigned</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left text-[11px] uppercase tracking-wide text-text-muted font-medium px-4 py-3">Role name</th>
                  <th className="text-left text-[11px] uppercase tracking-wide text-text-muted font-medium px-4 py-3">Scope</th>
                  <th className="text-left text-[11px] uppercase tracking-wide text-text-muted font-medium px-4 py-3">Expires</th>
                  <th className="text-right text-[11px] uppercase tracking-wide text-text-muted font-medium px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {assignments.map((assignment) => (
                  <tr key={assignment.assignment_id} className="border-b border-border last:border-0 hover:bg-bg-subtle transition-colors">
                    <td className="px-4 py-3 text-sm text-text-primary font-medium">{assignment.name}</td>
                    <td className="px-4 py-3 text-sm text-text-secondary">
                      {assignment.resource_type ? assignment.resource_type : 'Organization'}
                    </td>
                    <td className="px-4 py-3 text-sm text-text-secondary">
                      {assignment.expires_at ? fmtDate(assignment.expires_at) : 'Never'}
                    </td>
                    <td className="px-4 py-3 text-sm text-text-primary text-right">
                      {can('role', 'manage') ? (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => revokeMutation.mutate(assignment.role_id)}
                          loading={revokeMutation.isPending}
                        >
                          Revoke
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {can('role', 'manage') && showAssignForm ? (
            <div className="border-t border-border p-4 flex flex-col sm:flex-row gap-2">
              <select
                value={selectedRoleId}
                onChange={(e) => setSelectedRoleId(e.target.value)}
                className="bg-bg-subtle border border-border rounded px-3 py-2 text-text-primary text-sm w-full"
              >
                <option value="">Select role</option>
                {assignableRoles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
              <Button
                variant="primary"
                disabled={!selectedRoleId}
                loading={assignMutation.isPending}
                onClick={() => assignMutation.mutate()}
              >
                Assign
              </Button>
            </div>
          ) : null}
        </Card>
      </div>
    </div>
  )
}
