import { useNavigate, Navigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Spinner from '../../components/ui/Spinner'
import { api } from '../../lib/api'
import { useAuthStore } from '../../store/auth'

type RoleListItem = {
  id: string
  name: string
  description?: string
  is_system: boolean
  permission_count: number
}

function unwrapData<T>(payload: unknown): T {
  const wrapped = payload as { data?: T }
  return (wrapped?.data ?? payload) as T
}

export default function RolesPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const can = useAuthStore((s) => s.can)

  if (!can('role', 'read')) {
    return <Navigate to="/dashboard" replace />
  }

  const rolesQuery = useQuery({
    queryKey: ['roles'],
    queryFn: async () => {
      const res = await api.get('/roles')
      return unwrapData<RoleListItem[]>(res.data)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/roles/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] })
    },
  })

  const roles = rolesQuery.data ?? []

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-text-primary">Roles</h1>
          <p className="text-sm text-text-muted mt-0.5">{roles.length} roles</p>
        </div>
        {can('role', 'create') ? (
          <Button variant="primary" size="sm" onClick={() => navigate('/admin/roles/new')}>
            Create Role
          </Button>
        ) : null}
      </div>

      <Card padding="none">
        {rolesQuery.isLoading ? (
          <div className="py-16 flex justify-center">
            <Spinner size="lg" />
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left text-[11px] uppercase tracking-wide text-text-muted font-medium px-4 py-3">Role</th>
                <th className="text-left text-[11px] uppercase tracking-wide text-text-muted font-medium px-4 py-3">Description</th>
                <th className="text-left text-[11px] uppercase tracking-wide text-text-muted font-medium px-4 py-3">Permissions</th>
                <th className="text-right text-[11px] uppercase tracking-wide text-text-muted font-medium px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {roles.map((role) => (
                <tr key={role.id} className="border-b border-border last:border-0 hover:bg-bg-subtle transition-colors">
                  <td className="px-4 py-3 text-sm text-text-primary">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{role.name}</span>
                      {role.is_system ? <Badge variant="default">System</Badge> : null}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-text-muted max-w-[420px] truncate">{role.description || '—'}</td>
                  <td className="px-4 py-3 text-sm text-text-muted">{role.permission_count} permissions</td>
                  <td className="px-4 py-3 text-sm text-text-primary text-right">
                    <div className="inline-flex gap-2">
                      <Button variant="ghost" size="sm" onClick={() => navigate(`/admin/roles/${role.id}`)}>
                        Edit
                      </Button>
                      {can('role', 'delete') ? (
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={role.is_system}
                          title={role.is_system ? 'System roles cannot be deleted' : 'Delete role'}
                          loading={deleteMutation.isPending}
                          onClick={() => {
                            if (window.confirm('Delete this role?')) {
                              deleteMutation.mutate(role.id)
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
        )}
      </Card>
    </div>
  )
}
