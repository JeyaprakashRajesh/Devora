import { useMemo, useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
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
  created_at: string
}

type UserRole = {
  role_id: string
  name: string
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

export default function UsersPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const can = useAuthStore((s) => s.can)
  const [search, setSearch] = useState('')
  const [openMenuFor, setOpenMenuFor] = useState<string | null>(null)

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

  const users = usersQuery.data ?? []

  const rolesQueries = useQueries({
    queries: users.map((user) => ({
      queryKey: ['user-roles', user.id],
      queryFn: async () => {
        const res = await api.get(`/users/${user.id}/roles`)
        return unwrapData<UserRole[]>(res.data)
      },
      enabled: users.length > 0,
      staleTime: 30000,
    })),
  })

  const rolesByUserId = useMemo(() => {
    const map = new Map<string, string[]>()
    users.forEach((u, idx) => {
      const names = (rolesQueries[idx]?.data ?? []).map((r) => r.name)
      map.set(u.id, names)
    })
    return map
  }, [rolesQueries, users])

  const filteredUsers = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return users
    return users.filter((u) => {
      const display = (u.display_name ?? '').toLowerCase()
      return (
        display.includes(needle) ||
        u.username.toLowerCase().includes(needle) ||
        u.email.toLowerCase().includes(needle)
      )
    })
  }, [search, users])

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
        <Input
          placeholder="Search by name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <Card padding="none">
        {usersQuery.isLoading ? (
          <div className="py-16 flex justify-center">
            <Spinner size="lg" />
          </div>
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
                <th className="text-left text-[11px] uppercase tracking-wide text-text-muted font-medium px-4 py-3">Roles</th>
                <th className="text-left text-[11px] uppercase tracking-wide text-text-muted font-medium px-4 py-3">Joined</th>
                <th className="text-right text-[11px] uppercase tracking-wide text-text-muted font-medium px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => {
                const roles = rolesByUserId.get(user.id) ?? []
                const firstTwo = roles.slice(0, 2)
                const more = roles.length - firstTwo.length

                return (
                  <tr key={user.id} className="border-b border-border last:border-0 hover:bg-bg-subtle transition-colors">
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
                      <StatusBadge status={user.status} />
                    </td>
                    <td className="px-4 py-3 text-sm text-text-primary">
                      <div className="flex flex-wrap items-center gap-1">
                        {firstTwo.map((role) => (
                          <span key={role} className="px-1.5 py-0.5 rounded text-xs text-text-muted border border-border bg-bg-elevated">
                            {role}
                          </span>
                        ))}
                        {more > 0 ? <span className="text-xs text-text-muted">+{more} more</span> : null}
                        {roles.length === 0 ? <span className="text-xs text-text-muted">No roles</span> : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-text-primary">{timeAgo(user.created_at)}</td>
                    <td className="px-4 py-3 text-sm text-text-primary text-right">
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
                )
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}
