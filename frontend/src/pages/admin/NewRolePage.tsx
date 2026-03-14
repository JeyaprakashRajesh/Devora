import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Input from '../../components/ui/Input'
import { api } from '../../lib/api'
import { useAuthStore } from '../../store/auth'

type RoleResponse = {
  id: string
}

function unwrapData<T>(payload: unknown): T {
  const wrapped = payload as { data?: T }
  return (wrapped?.data ?? payload) as T
}

export default function NewRolePage() {
  const navigate = useNavigate()
  const can = useAuthStore((s) => s.can)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')

  if (!can('role', 'create')) {
    return <Navigate to="/dashboard" replace />
  }

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/roles', { name, description: description || null })
      return unwrapData<RoleResponse>(res.data)
    },
    onSuccess: (role) => {
      navigate(`/admin/roles/${role.id}`)
    },
    onError: (err: unknown) => {
      const maybeErr = err as { response?: { data?: { error?: string } }; message?: string }
      setError(maybeErr.response?.data?.error ?? maybeErr.message ?? 'Failed to create role')
    },
  })

  return (
    <div className="max-w-md mx-auto">
      <Card padding="md">
        <h1 className="text-lg font-semibold text-text-primary mb-4">Create Role</h1>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            setError('')
            createMutation.mutate()
          }}
        >
          <Input label="Role Name" required value={name} onChange={(e) => setName(e.target.value)} />

          <div className="flex flex-col gap-1">
            <label className="text-xs text-text-secondary font-medium">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="bg-bg-subtle border border-border rounded px-3 py-2 text-text-primary text-sm placeholder:text-text-muted focus:border-accent-amber focus:ring-2 focus:ring-amber-glow transition-colors outline-none w-full min-h-[90px]"
            />
          </div>

          <Button type="submit" variant="primary" loading={createMutation.isPending}>
            Create Role
          </Button>
          {error ? <p className="text-sm text-accent-red">{error}</p> : null}
        </form>
      </Card>
    </div>
  )
}
