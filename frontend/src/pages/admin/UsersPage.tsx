import { useMemo, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MoreHorizontal, Users2 } from 'lucide-react'
import Avatar from '../../components/ui/Avatar'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Input from '../../components/ui/Input'
import Spinner from '../../components/ui/Spinner'
import { api } from '../../lib/api'
import { useAuthStore } from '../../store/auth'

type UserRow = {
  id: string
  org_id: string
  email: string
  username: string
  display_name?: string
  status: 'active' | 'suspended' | 'invited'
  is_org_owner: boolean
  must_change_password?: boolean
  onboarding_complete?: boolean
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
  access_level: 'read' | 'write' | 'full'
}

type PermissionList = {
  all: PermissionOption[]
}

function unwrapData<T>(payload: unknown): T {
  const wrapped = payload as { data?: T }
  return (wrapped?.data ?? payload) as T
}

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 30) return `${days} days ago`
  const months = Math.floor(days / 30)
  return `${months} month${months > 1 ? 's' : ''} ago`
}

function StatusBadge({ status }: { status: UserRow['status'] }) {
  if (status === 'active') return <Badge variant="success">Active</Badge>
  if (status === 'suspended') return <Badge variant="warning">Suspended</Badge>
  return <Badge variant="info">Invited</Badge>
}

function AccessBadge({ level }: { level: 'read' | 'write' | 'full' }) {
  if (level === 'read') return <Badge variant="info">Read</Badge>
  if (level === 'write') return <Badge variant="warning">Write</Badge>
  return <Badge variant="error">Full</Badge>
}

export default function UsersPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const can = useAuthStore((s) => s.can)
  const [search, setSearch] = useState('')
  const [openMenuFor, setOpenMenuFor] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [activePermTab, setActivePermTab] = useState<'group' | 'direct'>('group')
  const [selectedGroup, setSelectedGroup] = useState('')
  const [selectedPermission, setSelectedPermission] = useState('')

  if (!can('user', 'read')) {
    return <Navigate to="/dashboard" replace />
  }

  const usersQuery = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const res = await api.get('/users')
      return unwrapData<UserRow[]>(res.data)
    },
  })

  const groupsQuery = useQuery({
    queryKey: ['groups-for-users-page'],
    queryFn: async () => {
      const res = await api.get('/groups')
      return unwrapData<GroupListItem[]>(res.data)
    },
  })

  const groupDetailsQuery = useQuery({
    queryKey: ['group-membership-map', groupsQuery.data?.map((g) => g.id).join(',')],
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

  const permissionsQuery = useQuery({
    queryKey: ['permissions-for-users-page'],
    queryFn: async () => {
      const res = await api.get('/permissions/project')
      return unwrapData<PermissionList>(res.data)
    },
  })

  const effectivePermissionsQuery = useQuery({
    queryKey: ['user-effective-permissions', expanded],
    queryFn: async () => {
      const res = await api.get(`/users/${expanded}/effective-permissions`)
      return unwrapData<EffectiveResponse>(res.data)
    },
    enabled: Boolean(expanded),
  })

  const suspendMutation = useMutation({
    mutationFn: async (userId: string) => {
      await api.patch(`/users/${userId}`, { status: 'suspended' })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
  })

  const removeMutation = useMutation({
    mutationFn: async (userId: string) => {
      await api.delete(`/users/${userId}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
  })

  const addToGroupMutation = useMutation({
    mutationFn: async ({ groupId, userId }: { groupId: string; userId: string }) => {
      await api.post(`/groups/${groupId}/members`, { user_id: userId })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group-membership-map'] })
      queryClient.invalidateQueries({ queryKey: ['groups-for-users-page'] })
    },
  })

  const removeFromGroupMutation = useMutation({
    mutationFn: async ({ groupId, userId }: { groupId: string; userId: string }) => {
      await api.delete(`/groups/${groupId}/members/${userId}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group-membership-map'] })
      queryClient.invalidateQueries({ queryKey: ['groups-for-users-page'] })
    },
  })

  const addDirectPermissionMutation = useMutation({
    mutationFn: async ({ userId, permissionId }: { userId: string; permissionId: string }) => {
      await api.post(`/users/${userId}/permissions`, { permission_id: permissionId })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-effective-permissions', expanded] })
    },
    onError: (err: unknown) => {
      const maybeErr = err as { response?: { data?: { error?: string } } }
      if ((maybeErr.response?.data?.error ?? '').toLowerCase().includes('through a group')) {
        window.alert('Already granted via a group')
      }
    },
  })

  const removeDirectPermissionMutation = useMutation({
    mutationFn: async ({ userId, permissionId }: { userId: string; permissionId: string }) => {
      await api.delete(`/users/${userId}/permissions/${permissionId}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-effective-permissions', expanded] })
    },
  })

  const users = usersQuery.data ?? []
  const groups = groupsQuery.data ?? []

  const membershipMap = useMemo(() => {
    const map = new Map<string, GroupListItem[]>()
    users.forEach((u) => map.set(u.id, []))
    const details = groupDetailsQuery.data ?? []
    details.forEach((detail) => {
      const source = groups.find((g) => g.id === detail.id)
      if (!source) return
      detail.members.forEach((m) => {
        const curr = map.get(m.id) ?? []
        map.set(m.id, [...curr, source])
      })
    })
    return map
  }, [users, groups, groupDetailsQuery.data])

  const filteredUsers = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return users
    return users.filter((u) => {
      const display = (u.display_name ?? '').toLowerCase()
      return display.includes(needle) || u.username.toLowerCase().includes(needle) || u.email.toLowerCase().includes(needle)
    })
  }, [search, users])

  const expandedGroups = membershipMap.get(expanded ?? '') ?? []
  const effective = effectivePermissionsQuery.data
  const groupPerms = effective?.group_permissions ?? []
  const directPerms = effective?.direct_permissions ?? []
  const viaGroupPermIds = new Set(groupPerms.map((p) => p.id))
  const availableDirectPermissions = (permissionsQuery.data?.all ?? []).filter((p) => !viaGroupPermIds.has(p.id))

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-text-primary">Users</h1>
          <p className="text-sm text-text-muted mt-0.5">{users.length} members</p>
        </div>
        {can('user', 'create') ? (
          <Button variant="primary" size="sm" onClick={() => navigate('/admin/users/invite')}>
            Invite User
          </Button>
        ) : null}
      </div>

      <div className="mb-4 max-w-sm">
        <Input placeholder="Search by name or email..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <Card padding="none">
        {usersQuery.isLoading ? (
          <div className="py-16 flex justify-center"><Spinner size="lg" /></div>
        ) : usersQuery.isError ? (
          <div className="py-16 text-center text-sm text-accent-red">Failed to load users.</div>
        ) : filteredUsers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Users2 className="w-10 h-10 text-text-muted mb-3" />
            <p className="text-sm font-medium text-text-secondary">No users found</p>
            <p className="text-xs text-text-muted mt-1">Try a different search query.</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left text-[11px] uppercase tracking-wide text-text-muted font-medium px-4 py-3">User</th>
                <th className="text-left text-[11px] uppercase tracking-wide text-text-muted font-medium px-4 py-3">Status</th>
                <th className="text-left text-[11px] uppercase tracking-wide text-text-muted font-medium px-4 py-3">Groups</th>
                <th className="text-left text-[11px] uppercase tracking-wide text-text-muted font-medium px-4 py-3">Permissions</th>
                <th className="text-left text-[11px] uppercase tracking-wide text-text-muted font-medium px-4 py-3">Joined</th>
                <th className="text-right text-[11px] uppercase tracking-wide text-text-muted font-medium px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => {
                const userGroups = membershipMap.get(user.id) ?? []
                const previewGroups = userGroups.slice(0, 2)
                const moreGroups = userGroups.length - previewGroups.length
                const isExpanded = expanded === user.id

                return (
                  <>
                    <tr
                      key={user.id}
                      className="border-b border-border hover:bg-bg-subtle transition-colors cursor-pointer"
                      onClick={() => {
                        setExpanded((prev) => (prev === user.id ? null : user.id))
                        setOpenMenuFor(null)
                        setSelectedGroup('')
                        setSelectedPermission('')
                        setActivePermTab('group')
                      }}
                    >
                      <td className="px-4 py-3 text-sm text-text-primary">
                        <div className="flex items-center gap-3">
                          <Avatar size="sm" name={user.display_name ?? user.username} />
                          <div>
                            <p className="text-sm text-text-primary">{user.display_name ?? user.username}</p>
                            <p className="text-xs text-text-muted">{user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-text-primary">
                        <div className="flex items-center gap-2">
                          <StatusBadge status={user.status} />
                          {!user.onboarding_complete ? <Badge variant="warning">Pending Setup</Badge> : null}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-text-primary">
                        {userGroups.length === 0 ? (
                          <span className="text-xs text-text-muted">No groups</span>
                        ) : (
                          <div className="flex items-center flex-wrap gap-1">
                            {previewGroups.map((group) => (
                              <span key={group.id} className="px-1.5 py-0.5 rounded text-xs text-text-muted border border-border bg-bg-elevated">
                                {group.name}
                              </span>
                            ))}
                            {moreGroups > 0 ? <span className="text-xs text-text-muted">+{moreGroups} more</span> : null}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-text-primary">
                        {isExpanded ? (
                          <Badge variant="info">{(effective?.all ?? []).length} permissions</Badge>
                        ) : (
                          <span className="text-xs text-text-muted">Expand row to view</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-text-primary">{timeAgo(user.created_at)}</td>
                      <td className="px-4 py-3 text-sm text-text-primary text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="relative inline-block">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="px-2"
                            onClick={() => setOpenMenuFor((prev) => (prev === user.id ? null : user.id))}
                          >
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>

                          {openMenuFor === user.id ? (
                            <div className="absolute right-0 mt-1 min-w-[140px] bg-bg-elevated border border-border rounded shadow-lg z-10 p-1">
                              <button
                                className="w-full text-left text-sm text-text-secondary hover:text-text-primary hover:bg-bg-subtle rounded px-2 py-1"
                                onClick={() => {
                                  setOpenMenuFor(null)
                                  navigate(`/admin/users/${user.id}`)
                                }}
                              >
                                View
                              </button>

                              {can('user', 'update') && user.status === 'active' ? (
                                <button
                                  className="w-full text-left text-sm text-text-secondary hover:text-text-primary hover:bg-bg-subtle rounded px-2 py-1"
                                  onClick={() => {
                                    setOpenMenuFor(null)
                                    suspendMutation.mutate(user.id)
                                  }}
                                >
                                  Suspend
                                </button>
                              ) : null}

                              {can('user', 'delete') && !user.is_org_owner ? (
                                <button
                                  className="w-full text-left text-sm text-accent-red hover:bg-bg-subtle rounded px-2 py-1"
                                  onClick={() => {
                                    setOpenMenuFor(null)
                                    if (window.confirm('Remove this user?')) {
                                      removeMutation.mutate(user.id)
                                    }
                                  }}
                                >
                                  Remove
                                </button>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </td>
                    </tr>

                    {isExpanded ? (
                      <tr className="border-b border-border bg-bg-subtle/40">
                        <td colSpan={6} className="px-4 py-4">
                          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                            <Card header="Groups" padding="md">
                              {expandedGroups.length === 0 ? (
                                <p className="text-xs text-text-muted">No groups</p>
                              ) : (
                                <div className="space-y-2">
                                  {expandedGroups.map((group) => (
                                    <div key={group.id} className="flex items-center justify-between border border-border rounded px-2 py-2">
                                      <div>
                                        <p className="text-sm text-text-primary">{group.name}</p>
                                        <p className="text-xs text-text-muted">{group.description ?? 'No description'}</p>
                                      </div>
                                      {can('group', 'manage') ? (
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          loading={removeFromGroupMutation.isPending}
                                          onClick={() => removeFromGroupMutation.mutate({ groupId: group.id, userId: user.id })}
                                        >
                                          Remove
                                        </Button>
                                      ) : null}
                                    </div>
                                  ))}
                                </div>
                              )}

                              {can('group', 'manage') ? (
                                <div className="mt-3 border-t border-border pt-3">
                                  <p className="text-xs text-text-muted mb-2">Add to Group</p>
                                  <div className="flex gap-2">
                                    <select
                                      value={selectedGroup}
                                      onChange={(e) => setSelectedGroup(e.target.value)}
                                      className="bg-bg-elevated border border-border rounded px-3 py-2 text-text-primary text-sm w-full"
                                    >
                                      <option value="">Select group</option>
                                      {groups.filter((g) => !expandedGroups.some((ug) => ug.id === g.id)).map((g) => (
                                        <option key={g.id} value={g.id}>{g.name}</option>
                                      ))}
                                    </select>
                                    <Button
                                      variant="primary"
                                      disabled={!selectedGroup}
                                      loading={addToGroupMutation.isPending}
                                      onClick={() => addToGroupMutation.mutate({ groupId: selectedGroup, userId: user.id })}
                                    >
                                      Add
                                    </Button>
                                  </div>
                                </div>
                              ) : null}
                            </Card>

                            <Card
                              header={
                                <div className="flex items-center gap-2">
                                  <button
                                    className={`text-xs px-2 py-1 rounded ${activePermTab === 'group' ? 'bg-bg-elevated text-text-primary' : 'text-text-muted'}`}
                                    onClick={() => setActivePermTab('group')}
                                  >
                                    Via Groups
                                  </button>
                                  <button
                                    className={`text-xs px-2 py-1 rounded ${activePermTab === 'direct' ? 'bg-bg-elevated text-text-primary' : 'text-text-muted'}`}
                                    onClick={() => setActivePermTab('direct')}
                                  >
                                    Direct
                                  </button>
                                </div>
                              }
                              padding="md"
                            >
                              {effectivePermissionsQuery.isLoading ? (
                                <div className="py-6 flex justify-center"><Spinner size="md" /></div>
                              ) : activePermTab === 'group' ? (
                                groupPerms.length === 0 ? (
                                  <p className="text-xs text-text-muted">No permissions via groups</p>
                                ) : (
                                  <div className="space-y-2">
                                    {groupPerms.map((perm) => (
                                      <div key={`${perm.id}-${perm.source_name}`} className="flex items-center justify-between border border-border rounded px-2 py-2">
                                        <div>
                                          <p className="text-sm text-text-primary">{perm.name}</p>
                                          <p className="text-xs text-text-muted">via {perm.source_name}</p>
                                        </div>
                                        <AccessBadge level={perm.access_level} />
                                      </div>
                                    ))}
                                  </div>
                                )
                              ) : (
                                <div className="space-y-2">
                                  {directPerms.length === 0 ? <p className="text-xs text-text-muted">No direct permissions</p> : null}
                                  {directPerms.map((perm) => (
                                    <div key={perm.id} className="flex items-center justify-between border border-border rounded px-2 py-2">
                                      <div>
                                        <p className="text-sm text-text-primary">{perm.name}</p>
                                        <p className="text-xs text-text-muted">direct assignment</p>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <AccessBadge level={perm.access_level} />
                                        {can('org', 'manage') ? (
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            loading={removeDirectPermissionMutation.isPending}
                                            onClick={() => removeDirectPermissionMutation.mutate({ userId: user.id, permissionId: perm.id })}
                                          >
                                            Remove
                                          </Button>
                                        ) : null}
                                      </div>
                                    </div>
                                  ))}

                                  {can('org', 'manage') ? (
                                    <div className="mt-3 border-t border-border pt-3">
                                      <p className="text-xs text-text-muted mb-2">Add Direct Permission</p>
                                      <div className="flex gap-2">
                                        <select
                                          value={selectedPermission}
                                          onChange={(e) => setSelectedPermission(e.target.value)}
                                          className="bg-bg-elevated border border-border rounded px-3 py-2 text-text-primary text-sm w-full"
                                        >
                                          <option value="">Select permission</option>
                                          {availableDirectPermissions.map((perm) => (
                                            <option key={perm.id} value={perm.id}>{perm.name}</option>
                                          ))}
                                        </select>
                                        <Button
                                          variant="primary"
                                          disabled={!selectedPermission}
                                          loading={addDirectPermissionMutation.isPending}
                                          onClick={() => addDirectPermissionMutation.mutate({ userId: user.id, permissionId: selectedPermission })}
                                        >
                                          Add
                                        </Button>
                                      </div>
                                    </div>
                                  ) : null}
                                </div>
                              )}
                            </Card>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </>
                )
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}
