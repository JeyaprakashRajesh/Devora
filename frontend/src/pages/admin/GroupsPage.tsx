import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { UsersRound } from 'lucide-react'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Input from '../../components/ui/Input'
import Spinner from '../../components/ui/Spinner'
import { api } from '../../lib/api'
import { useAuthStore } from '../../store/auth'

type GroupListItem = {
  id: string
  name: string
  description?: string
  member_count: number
  created_at: string
}

type GroupDetail = {
  roles: Array<{ id: string; name: string }>
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

export default function GroupsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const can = useAuthStore((s) => s.can)

  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  if (!can('group', 'read')) {
    return <Navigate to="/dashboard" replace />
  }

  const groupsQuery = useQuery({
    queryKey: ['groups'],
    queryFn: async () => {
      const res = await api.get('/groups')
      return unwrapData<GroupListItem[]>(res.data)
    },
  })

  const groupRolesQuery = useQuery({
    queryKey: ['groups-role-overview', groupsQuery.data?.map((g) => g.id).join(',')],
    queryFn: async () => {
      const groups = groupsQuery.data ?? []
      const results = await Promise.all(
        groups.map(async (group) => {
          const res = await api.get(`/groups/${group.id}`)
          return { groupId: group.id, detail: unwrapData<GroupDetail>(res.data) }
        })
      )
      const map = new Map<string, string[]>()
      results.forEach(({ groupId, detail }) => {
        map.set(groupId, detail.roles.map((r) => r.name))
      })
      return map
    },
    enabled: Boolean(groupsQuery.data && groupsQuery.data.length > 0),
  })

  const createMutation = useMutation({
    mutationFn: async () => {
      await api.post('/groups', { name, description: description || null })
    },
    onSuccess: () => {
      setName('')
      setDescription('')
      setShowCreate(false)
      queryClient.invalidateQueries({ queryKey: ['groups'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/groups/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] })
    },
  })

  const groups = groupsQuery.data ?? []

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-text-primary">Groups</h1>
          <p className="text-sm text-text-muted mt-0.5">{groups.length} groups</p>
        </div>
        {can('group', 'create') ? (
          <Button variant="primary" size="sm" onClick={() => setShowCreate((v) => !v)}>
            Create Group
          </Button>
        ) : null}
      </div>

      {showCreate ? (
        <Card className="mb-4" padding="md">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
            <Input label="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
            <div className="flex items-end">
              <Button variant="primary" loading={createMutation.isPending} onClick={() => createMutation.mutate()}>
                Save
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      <Card padding="none">
        {groupsQuery.isLoading ? (
          <div className="py-16 flex justify-center"><Spinner size="lg" /></div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <UsersRound className="w-10 h-10 text-text-muted mb-3" />
            <p className="text-sm font-medium text-text-secondary">No groups yet</p>
            <p className="text-xs text-text-muted mt-1">Create a group to organize member access.</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left text-[11px] uppercase tracking-wide text-text-muted font-medium px-4 py-3">Group</th>
                <th className="text-left text-[11px] uppercase tracking-wide text-text-muted font-medium px-4 py-3">Members</th>
                <th className="text-left text-[11px] uppercase tracking-wide text-text-muted font-medium px-4 py-3">Roles</th>
                <th className="text-left text-[11px] uppercase tracking-wide text-text-muted font-medium px-4 py-3">Created</th>
                <th className="text-right text-[11px] uppercase tracking-wide text-text-muted font-medium px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => {
                const roleNames = groupRolesQuery.data?.get(group.id) ?? []
                const preview = roleNames.slice(0, 2)
                const more = roleNames.length - preview.length

                return (
                  <tr key={group.id} className="border-b border-border last:border-0 hover:bg-bg-subtle transition-colors">
                    <td className="px-4 py-3 text-sm text-text-primary">
                      <p className="font-medium">{group.name}</p>
                      <p className="text-xs text-text-muted">{group.description || '—'}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-text-muted">{group.member_count} members</td>
                    <td className="px-4 py-3 text-sm text-text-muted">
                      {preview.join(', ')}
                      {more > 0 ? ` +${more} more` : ''}
                      {roleNames.length === 0 ? 'No roles' : ''}
                    </td>
                    <td className="px-4 py-3 text-sm text-text-muted">{timeAgo(group.created_at)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex gap-2">
                        <Button variant="ghost" size="sm" onClick={() => navigate(`/admin/groups/${group.id}`)}>
                          View
                        </Button>
                        {can('group', 'delete') ? (
                          <Button
                            variant="destructive"
                            size="sm"
                            loading={deleteMutation.isPending}
                            onClick={() => {
                              if (window.confirm('Delete this group?')) {
                                deleteMutation.mutate(group.id)
                              }
                            }}
                          >
                            Delete
                          </Button>
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
