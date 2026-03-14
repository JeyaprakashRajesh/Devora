import { useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { ChevronLeft, Info } from 'lucide-react'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Spinner from '../../components/ui/Spinner'
import { api } from '../../lib/api'
import { useAuthStore } from '../../store/auth'

type Role = {
  id: string
  name: string
  is_system: boolean
}

type PermissionGroup = {
  resource: { id: string; name: string; label: string }
  permissions: Array<{ id: string; action: string; label: string }>
}

type RoleTogglePermission = {
  id: string
  resource: string
  action: 'create' | 'read' | 'update' | 'delete' | 'manage'
  enabled: boolean
}

type ToggleSwitchProps = {
  enabled: boolean
  onChange: () => void
  disabled?: boolean
}

function ToggleSwitch({ enabled, onChange, disabled }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      onClick={onChange}
      disabled={disabled}
      className={[
        'w-9 h-5 rounded-full transition-colors',
        enabled ? (disabled ? 'bg-accent-green/40' : 'bg-accent-green') : 'bg-bg-subtle border border-border',
        disabled ? 'cursor-not-allowed opacity-70' : 'cursor-pointer',
      ].join(' ')}
    >
      <span
        className={[
          'block w-3.5 h-3.5 rounded-full bg-text-primary transition-transform',
          enabled ? 'translate-x-4' : 'translate-x-0.5',
        ].join(' ')}
      />
    </button>
  )
}

function unwrapData<T>(payload: unknown): T {
  const wrapped = payload as { data?: T }
  return (wrapped?.data ?? payload) as T
}

export default function RoleDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const can = useAuthStore((s) => s.can)

  const [enabledMap, setEnabledMap] = useState<Map<string, boolean>>(new Map())
  const [saveNotice, setSaveNotice] = useState('')

  if (!can('role', 'read')) {
    return <Navigate to="/dashboard" replace />
  }

  const roleQuery = useQuery({
    queryKey: ['role', id],
    queryFn: async () => {
      const res = await api.get(`/roles/${id}`)
      return unwrapData<Role>(res.data)
    },
    enabled: Boolean(id),
  })

  const allPermissionsQuery = useQuery({
    queryKey: ['permissions-grouped'],
    queryFn: async () => {
      const res = await api.get('/permissions')
      return unwrapData<PermissionGroup[]>(res.data)
    },
  })

  const rolePermissionsQuery = useQuery({
    queryKey: ['role-permission-toggles', id],
    queryFn: async () => {
      const res = await api.get(`/roles/${id}/permissions`)
      return unwrapData<RoleTogglePermission[]>(res.data)
    },
    enabled: Boolean(id),
  })

  useEffect(() => {
    if (!rolePermissionsQuery.data) return
    const map = new Map<string, boolean>()
    rolePermissionsQuery.data.forEach((permission) => map.set(permission.id, permission.enabled))
    setEnabledMap(map)
  }, [rolePermissionsQuery.data])

  const toggleMutation = useMutation({
    mutationFn: async (permissionId: string) => {
      await api.patch(`/roles/${id}/permissions/${permissionId}`)
    },
  })

  const saveAllMutation = useMutation({
    mutationFn: async (permissionIds: string[]) => {
      await api.put(`/roles/${id}/permissions`, { permission_ids: permissionIds })
    },
    onSuccess: () => {
      setSaveNotice('Permissions saved')
      setTimeout(() => setSaveNotice(''), 1200)
    },
  })

  const rows = useMemo(() => {
    const byResourceAction = new Map<string, RoleTogglePermission>()
    ;(rolePermissionsQuery.data ?? []).forEach((item) => {
      byResourceAction.set(`${item.resource}:${item.action}`, item)
    })

    return (allPermissionsQuery.data ?? []).map((group) => {
      const find = (action: RoleTogglePermission['action']) =>
        byResourceAction.get(`${group.resource.name}:${action}`)

      return {
        resourceId: group.resource.id,
        resourceName: group.resource.name,
        resourceLabel: group.resource.label,
        create: find('create'),
        read: find('read'),
        update: find('update'),
        delete: find('delete'),
        manage: find('manage'),
      }
    })
  }, [allPermissionsQuery.data, rolePermissionsQuery.data])

  const isSystem = roleQuery.data?.is_system ?? false
  const canUpdate = can('role', 'update') && !isSystem

  const setEnabledOptimistic = (permissionId: string, next: boolean) => {
    setEnabledMap((prev) => {
      const updated = new Map(prev)
      updated.set(permissionId, next)
      return updated
    })
  }

  const toggleSingle = async (permissionId: string) => {
    const current = enabledMap.get(permissionId) ?? false
    setEnabledOptimistic(permissionId, !current)
    try {
      await toggleMutation.mutateAsync(permissionId)
    } catch {
      setEnabledOptimistic(permissionId, current)
    }
  }

  const toggleManageRow = async (resourceName: string) => {
    const resourcePerms = (rolePermissionsQuery.data ?? []).filter((p) => p.resource === resourceName)
    const manage = resourcePerms.find((p) => p.action === 'manage')
    if (!manage) return

    const manageCurrent = enabledMap.get(manage.id) ?? false
    await toggleSingle(manage.id)

    if (!manageCurrent) {
      const actionPerms = resourcePerms.filter((p) => p.action !== 'manage')
      await Promise.all(
        actionPerms.map(async (perm) => {
          const isEnabled = enabledMap.get(perm.id) ?? false
          if (!isEnabled) {
            await toggleSingle(perm.id)
          }
        })
      )
    }
  }

  if (roleQuery.isLoading || allPermissionsQuery.isLoading || rolePermissionsQuery.isLoading) {
    return (
      <div className="py-16 flex justify-center">
        <Spinner size="lg" />
      </div>
    )
  }

  if (!roleQuery.data || roleQuery.isError) {
    return <div className="text-sm text-accent-red">Failed to load role details.</div>
  }

  const role = roleQuery.data

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/admin/roles')}>
            <ChevronLeft className="w-4 h-4" />
            Back
          </Button>
          <div>
            <h1 className="text-lg font-semibold text-text-primary">{role.name}</h1>
            <p className="text-sm text-text-muted mt-0.5">Role permissions</p>
          </div>
        </div>
      </div>

      {isSystem ? (
        <div className="bg-amber-subtle border border-accent-amber/30 rounded-lg px-4 py-3 mb-6 flex items-center gap-2">
          <Info className="w-4 h-4 text-accent-amber" />
          <p className="text-sm text-text-secondary">System role — permissions cannot be modified</p>
        </div>
      ) : null}

      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="sticky top-0 bg-bg-surface z-10">
              <tr className="border-b border-border">
                <th className="text-left text-[11px] uppercase tracking-wide text-text-muted font-medium px-4 py-3">Resource</th>
                <th className="text-center text-[11px] uppercase tracking-wide text-text-muted font-medium px-4 py-3">Create</th>
                <th className="text-center text-[11px] uppercase tracking-wide text-text-muted font-medium px-4 py-3">Read</th>
                <th className="text-center text-[11px] uppercase tracking-wide text-text-muted font-medium px-4 py-3">Update</th>
                <th className="text-center text-[11px] uppercase tracking-wide text-text-muted font-medium px-4 py-3">Delete</th>
                <th className="text-center text-[11px] uppercase tracking-wide text-text-muted font-medium px-4 py-3">
                  <div className="relative group inline-flex">
                    <span>Manage</span>
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-bg-elevated border border-border rounded px-2 py-1 text-xs text-text-secondary whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                      Grants all actions for this resource
                    </div>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const perms = [row.create, row.read, row.update, row.delete, row.manage]
                return (
                  <tr key={row.resourceId} className="border-b border-border last:border-0 hover:bg-bg-subtle transition-colors">
                    <td className="px-4 py-3 text-sm text-text-primary">
                      <p className="font-medium">{row.resourceLabel}</p>
                    </td>
                    {perms.map((perm, idx) => {
                      if (!perm) {
                        return <td key={`${row.resourceId}-${idx}`} className="px-4 py-3" />
                      }

                      const enabled = enabledMap.get(perm.id) ?? false
                      const isManageColumn = perm.action === 'manage'

                      return (
                        <td key={perm.id} className="px-4 py-3 text-center">
                          <ToggleSwitch
                            enabled={enabled}
                            disabled={!canUpdate || toggleMutation.isPending}
                            onChange={() => {
                              if (!canUpdate || toggleMutation.isPending) return
                              if (isManageColumn) {
                                void toggleManageRow(row.resourceName)
                              } else {
                                void toggleSingle(perm.id)
                              }
                            }}
                          />
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {canUpdate ? (
        <div className="mt-4 flex items-center gap-3">
          <Button
            variant="primary"
            onClick={() => {
              const permissionIds = Array.from(enabledMap.entries())
                .filter(([, enabled]) => enabled)
                .map(([permissionId]) => permissionId)
              saveAllMutation.mutate(permissionIds)
            }}
            loading={saveAllMutation.isPending}
          >
            Save All
          </Button>
          {saveNotice ? <span className="text-sm text-accent-green">{saveNotice}</span> : null}
        </div>
      ) : null}
    </div>
  )
}
