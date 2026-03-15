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
  job_title?: string
  status: 'active' | 'suspended' | 'invited'
  is_org_owner: boolean
  onboarding_complete?: boolean
  last_seen_at?: string
  created_at: string
}

type GroupListItem = {
  id: string
  name: string
  description?: string
  member_count: number
}

type GroupDetail = {
  id: string
  members: Array<{ id: string }>
}

type EffectivePermission = {
  id: string
  name: string
  access_level: 'read' | 'write' | 'full'
  source_name: string
  source_type: 'group' | 'direct'
}

type EffectiveResponse = {
  group_permissions: EffectivePermission[]
  direct_permissions: EffectivePermission[]
  all: EffectivePermission[]
}

type PermissionOption = {
  id: string
  name: string
}

type PermissionList = {
  all: PermissionOption[]
}

type RoleItem = {
  id: string
  name: string
  description?: string
  is_system: boolean
}

type RoleAssignment = {
  assignment_id: string
  role_id: string
  name: string
  description?: string
  is_system: boolean
  resource_type?: string
  resource_id?: string
  expires_at?: string
  created_at: string
}

type ProjectItem = {
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

function AccessBadge({ level }: { level: 'read' | 'write' | 'full' }) {
  if (level === 'read') return <Badge variant="info">Read</Badge>
  if (level === 'write') return <Badge variant="warning">Write</Badge>
  return <Badge variant="error">Full</Badge>
}

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()
  const can = useAuthStore((s) => s.can)
  const [tab, setTab] = useState<'groups' | 'permissions' | 'roles'>('groups')
  const [selectedGroup, setSelectedGroup] = useState('')
  const [selectedPermission, setSelectedPermission] = useState('')
  const [selectedRole, setSelectedRole] = useState('')
  const [roleScope, setRoleScope] = useState<'org' | 'project'>('org')
  const [selectedProject, setSelectedProject] = useState('')

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

  const groupsQuery = useQuery({
    queryKey: ['groups-for-user-detail'],
    queryFn: async () => {
      const res = await api.get('/groups')
      return unwrapData<GroupListItem[]>(res.data)
    },
  })

  const groupDetailsQuery = useQuery({
    queryKey: ['group-detail-map-user-page', groupsQuery.data?.map((g) => g.id).join(',')],
    queryFn: async () => {
      const groups = groupsQuery.data ?? []
      const details = await Promise.all(
        groups.map(async (g) => {
          const res = await api.get(`/groups/${g.id}`)
          return unwrapData<GroupDetail>(res.data)
        })
      )
      return details
    },
    enabled: Boolean(groupsQuery.data && groupsQuery.data.length > 0),
  })

  const effectivePermissionsQuery = useQuery({
    queryKey: ['user-effective-permissions-detail', id],
    queryFn: async () => {
      const res = await api.get(`/users/${id}/effective-permissions`)
      return unwrapData<EffectiveResponse>(res.data)
    },
    enabled: Boolean(id),
  })

  const permissionsQuery = useQuery({
    queryKey: ['permissions-for-user-detail'],
    queryFn: async () => {
      const res = await api.get('/permissions/project')
      return unwrapData<PermissionList>(res.data)
    },
  })

  const rolesQuery = useQuery({
    queryKey: ['roles-for-user-detail'],
    queryFn: async () => {
      const res = await api.get('/roles')
      return unwrapData<RoleItem[]>(res.data)
    },
    enabled: can('role', 'read'),
  })

  const userRolesQuery = useQuery({
    queryKey: ['user-role-assignments', id],
    queryFn: async () => {
      const res = await api.get(`/users/${id}/roles`)
      return unwrapData<RoleAssignment[]>(res.data)
    },
    enabled: Boolean(id) && can('role', 'read'),
  })

  const projectsQuery = useQuery({
    queryKey: ['projects-for-user-role-scope'],
    queryFn: async () => {
      const res = await api.get('/projects')
      return unwrapData<ProjectItem[]>(res.data)
    },
    enabled: can('role', 'manage') && roleScope === 'project',
  })

  const removeFromGroupMutation = useMutation({
    mutationFn: async (groupId: string) => {
      await api.delete(`/groups/${groupId}/members/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group-detail-map-user-page'] })
    },
  })

  const addToGroupMutation = useMutation({
    mutationFn: async (groupId: string) => {
      await api.post(`/groups/${groupId}/members`, { user_id: id })
    },
    onSuccess: () => {
      setSelectedGroup('')
      queryClient.invalidateQueries({ queryKey: ['group-detail-map-user-page'] })
    },
  })

  const removeDirectPermissionMutation = useMutation({
    mutationFn: async (permissionId: string) => {
      await api.delete(`/users/${id}/permissions/${permissionId}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-effective-permissions-detail', id] })
    },
  })

  const addDirectPermissionMutation = useMutation({
    mutationFn: async (permissionId: string) => {
      await api.post(`/users/${id}/permissions`, { permission_id: permissionId })
    },
    onSuccess: () => {
      setSelectedPermission('')
      queryClient.invalidateQueries({ queryKey: ['user-effective-permissions-detail', id] })
    },
    onError: (err: unknown) => {
      const maybeErr = err as { response?: { data?: { error?: string } } }
      if ((maybeErr.response?.data?.error ?? '').toLowerCase().includes('through a group')) {
        window.alert('Already granted via a group')
      }
    },
  })

  const assignRoleMutation = useMutation({
    mutationFn: async () => {
      const payload: {
        role_id: string
        resource_type?: string
        resource_id?: string
      } = {
        role_id: selectedRole,
      }

      if (roleScope === 'project') {
        payload.resource_type = 'project'
        payload.resource_id = selectedProject
      }

      await api.post(`/users/${id}/roles`, payload)
    },
    onSuccess: () => {
      setSelectedRole('')
      setSelectedProject('')
      queryClient.invalidateQueries({ queryKey: ['user-role-assignments', id] })
    },
  })

  const revokeRoleMutation = useMutation({
    mutationFn: async (assignment: RoleAssignment) => {
      const params = new URLSearchParams()
      if (assignment.resource_type && assignment.resource_id) {
        params.set('resource_type', assignment.resource_type)
        params.set('resource_id', assignment.resource_id)
      }

      const suffix = params.toString() ? `?${params.toString()}` : ''
      await api.delete(`/users/${id}/roles/${assignment.role_id}${suffix}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-role-assignments', id] })
    },
  })

  const userGroups = useMemo(() => {
    const uid = id ?? ''
    const details = groupDetailsQuery.data ?? []
    const groups = groupsQuery.data ?? []
    const inGroups: GroupListItem[] = []
    details.forEach((d) => {
      if (d.members.some((m) => m.id === uid)) {
        const match = groups.find((g) => g.id === d.id)
        if (match) inGroups.push(match)
      }
    })
    return inGroups
  }, [id, groupDetailsQuery.data, groupsQuery.data])

  const assignableGroups = useMemo(() => {
    const currentIds = new Set(userGroups.map((g) => g.id))
    return (groupsQuery.data ?? []).filter((g) => !currentIds.has(g.id))
  }, [groupsQuery.data, userGroups])

  const groupPerms = effectivePermissionsQuery.data?.group_permissions ?? []
  const directPerms = effectivePermissionsQuery.data?.direct_permissions ?? []
  const viaGroupIds = new Set(groupPerms.map((p) => p.id))
  const assignablePermissions = (permissionsQuery.data?.all ?? []).filter((p) => !viaGroupIds.has(p.id))
  const assignments = userRolesQuery.data ?? []
  const assignableRoles = rolesQuery.data ?? []

  if (userQuery.isLoading) {
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

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      <div className="xl:col-span-1">
        <Card padding="md">
          <div className="flex flex-col items-center text-center">
            <Avatar size="lg" name={user.display_name ?? user.username} />
            <p className="text-base font-semibold text-text-primary mt-3">{user.display_name ?? user.username}</p>
            <p className="text-sm text-text-muted">{user.email}</p>
            {user.job_title ? <p className="text-sm text-text-muted mt-1">{user.job_title}</p> : null}
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              <StatusBadge status={user.status} />
              {!user.onboarding_complete ? <Badge variant="warning">Pending Setup</Badge> : null}
              {user.is_org_owner ? <Badge variant="warning">Org Owner</Badge> : null}
            </div>
            <p className="text-xs text-text-muted mt-4">Joined: {fmtDate(user.created_at)}</p>
            <p className="text-xs text-text-muted mt-1">Last seen: {fmtDate(user.last_seen_at)}</p>
          </div>
        </Card>
      </div>

      <div className="xl:col-span-2">
        <Card
          header={
            <div className="flex items-center gap-2">
              <button
                className={`text-xs px-2 py-1 rounded ${tab === 'groups' ? 'bg-bg-elevated text-text-primary' : 'text-text-muted'}`}
                onClick={() => setTab('groups')}
              >
                Groups
              </button>
              <button
                className={`text-xs px-2 py-1 rounded ${tab === 'permissions' ? 'bg-bg-elevated text-text-primary' : 'text-text-muted'}`}
                onClick={() => setTab('permissions')}
              >
                Permissions
              </button>
              <button
                className={`text-xs px-2 py-1 rounded ${tab === 'roles' ? 'bg-bg-elevated text-text-primary' : 'text-text-muted'}`}
                onClick={() => setTab('roles')}
              >
                Roles
              </button>
            </div>
          }
          padding="md"
        >
          {tab === 'groups' ? (
            <div className="space-y-2">
              {userGroups.length === 0 ? <p className="text-xs text-text-muted">No group memberships</p> : null}
              {userGroups.map((group) => (
                <div key={group.id} className="flex items-center justify-between border border-border rounded px-3 py-2">
                  <div>
                    <p className="text-sm text-text-primary">{group.name}</p>
                    <p className="text-xs text-text-muted">{group.description ?? 'No description'} • {group.member_count} members</p>
                  </div>
                  {can('group', 'manage') ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      loading={removeFromGroupMutation.isPending}
                      onClick={() => removeFromGroupMutation.mutate(group.id)}
                    >
                      Remove from group
                    </Button>
                  ) : null}
                </div>
              ))}

              {can('group', 'manage') ? (
                <div className="pt-3 border-t border-border">
                  <p className="text-xs text-text-muted mb-2">Add to Group</p>
                  <div className="flex gap-2">
                    <select
                      value={selectedGroup}
                      onChange={(e) => setSelectedGroup(e.target.value)}
                      className="bg-bg-subtle border border-border rounded px-3 py-2 text-text-primary text-sm w-full"
                    >
                      <option value="">Select group</option>
                      {assignableGroups.map((group) => (
                        <option key={group.id} value={group.id}>{group.name}</option>
                      ))}
                    </select>
                    <Button
                      variant="primary"
                      disabled={!selectedGroup}
                      loading={addToGroupMutation.isPending}
                      onClick={() => addToGroupMutation.mutate(selectedGroup)}
                    >
                      Add
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : tab === 'permissions' ? (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium text-text-primary mb-2">Via Groups</p>
                <div className="space-y-2">
                  {groupPerms.length === 0 ? <p className="text-xs text-text-muted">No inherited permissions</p> : null}
                  {groupPerms.map((perm) => (
                    <div key={`${perm.id}-${perm.source_name}`} className="flex items-center justify-between border border-border rounded px-3 py-2">
                      <div>
                        <p className="text-sm text-text-primary">{perm.name}</p>
                        <p className="text-xs text-text-muted">via {perm.source_name}</p>
                      </div>
                      <AccessBadge level={perm.access_level} />
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-sm font-medium text-text-primary mb-2">Direct Assignments</p>
                <div className="space-y-2">
                  {directPerms.length === 0 ? <p className="text-xs text-text-muted">No direct permissions</p> : null}
                  {directPerms.map((perm) => (
                    <div key={perm.id} className="flex items-center justify-between border border-border rounded px-3 py-2">
                      <div>
                        <p className="text-sm text-text-primary">{perm.name}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <AccessBadge level={perm.access_level} />
                        {can('org', 'manage') ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            loading={removeDirectPermissionMutation.isPending}
                            onClick={() => removeDirectPermissionMutation.mutate(perm.id)}
                          >
                            Remove
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>

                {can('org', 'manage') ? (
                  <div className="pt-3 border-t border-border mt-3">
                    <p className="text-xs text-text-muted mb-2">Add Permission</p>
                    <div className="flex gap-2">
                      <select
                        value={selectedPermission}
                        onChange={(e) => setSelectedPermission(e.target.value)}
                        className="bg-bg-subtle border border-border rounded px-3 py-2 text-text-primary text-sm w-full"
                      >
                        <option value="">Select permission</option>
                        {assignablePermissions.map((perm) => (
                          <option key={perm.id} value={perm.id}>{perm.name}</option>
                        ))}
                      </select>
                      <Button
                        variant="primary"
                        disabled={!selectedPermission}
                        loading={addDirectPermissionMutation.isPending}
                        onClick={() => addDirectPermissionMutation.mutate(selectedPermission)}
                      >
                        Add
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium text-text-primary mb-2">Assigned Roles</p>
                <div className="space-y-2">
                  {assignments.length === 0 ? <p className="text-xs text-text-muted">No roles assigned</p> : null}
                  {assignments.map((assignment) => {
                    const scoped = assignment.resource_type === 'project' && assignment.resource_id
                    const projectName = (projectsQuery.data ?? []).find((p) => p.id === assignment.resource_id)?.name
                    return (
                      <div key={assignment.assignment_id} className="flex items-center justify-between border border-border rounded px-3 py-2">
                        <div>
                          <p className="text-sm text-text-primary">{assignment.name}</p>
                          <p className="text-xs text-text-muted">
                            {scoped ? `Project scope${projectName ? `: ${projectName}` : ''}` : 'Org-wide'}
                          </p>
                        </div>
                        {can('role', 'manage') ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            loading={revokeRoleMutation.isPending}
                            onClick={() => revokeRoleMutation.mutate(assignment)}
                          >
                            Remove
                          </Button>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              </div>

              {can('role', 'manage') ? (
                <div className="pt-3 border-t border-border">
                  <p className="text-xs text-text-muted mb-2">Assign Role</p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <select
                      value={selectedRole}
                      onChange={(e) => setSelectedRole(e.target.value)}
                      className="bg-bg-subtle border border-border rounded px-3 py-2 text-text-primary text-sm w-full"
                    >
                      <option value="">Select role</option>
                      {assignableRoles.map((role) => (
                        <option key={role.id} value={role.id}>{role.name}</option>
                      ))}
                    </select>

                    <select
                      value={roleScope}
                      onChange={(e) => setRoleScope(e.target.value as 'org' | 'project')}
                      className="bg-bg-subtle border border-border rounded px-3 py-2 text-text-primary text-sm w-full"
                    >
                      <option value="org">Org-wide</option>
                      <option value="project">Project scoped</option>
                    </select>

                    <select
                      value={selectedProject}
                      onChange={(e) => setSelectedProject(e.target.value)}
                      disabled={roleScope !== 'project'}
                      className="bg-bg-subtle border border-border rounded px-3 py-2 text-text-primary text-sm w-full disabled:opacity-50"
                    >
                      <option value="">Select project</option>
                      {(projectsQuery.data ?? []).map((project) => (
                        <option key={project.id} value={project.id}>{project.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="mt-2">
                    <Button
                      variant="primary"
                      disabled={!selectedRole || (roleScope === 'project' && !selectedProject)}
                      loading={assignRoleMutation.isPending}
                      onClick={() => assignRoleMutation.mutate()}
                    >
                      Assign Role
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
