import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import { api } from '../../lib/api'
import { useAuthStore } from '../../store/auth'

type InviteResponse = {
  user: {
    email: string
  }
  temp_password: string
}

function unwrapData<T>(payload: unknown): T {
  const wrapped = payload as { data?: T }
  return (wrapped?.data ?? payload) as T
}

export default function InviteUserPage() {
  const navigate = useNavigate()
  const can = useAuthStore((s) => s.can)

  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState<InviteResponse | null>(null)
  const [copied, setCopied] = useState(false)

  if (!can('user', 'create')) {
    return <Navigate to="/dashboard" replace />
  }

  const inviteMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/users/invite', {
        email,
        username,
        display_name: displayName || null,
      })
      return unwrapData<InviteResponse>(res.data)
    },
    onSuccess: (data) => {
      setSuccess(data)
      setError('')
    },
    onError: (err: unknown) => {
      const maybeErr = err as { response?: { data?: { error?: string } }; message?: string }
      setError(maybeErr.response?.data?.error ?? maybeErr.message ?? 'Failed to invite user')
    },
  })

  return (
    <div className="max-w-md mx-auto">
      <Card padding="md">
        <h1 className="text-lg font-semibold text-text-primary mb-4">Invite User</h1>

        {success ? (
          <div className="space-y-3">
            <p className="text-sm text-text-primary">User invited successfully</p>
            <div className="bg-bg-elevated border border-border rounded p-3">
              <p className="text-xs text-text-muted">Temporary password</p>
              <div className="flex items-center gap-2 mt-1">
                <code className="mono text-sm text-text-primary">{success.temp_password}</code>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={async () => {
                    await navigator.clipboard.writeText(success.temp_password)
                    setCopied(true)
                    setTimeout(() => setCopied(false), 1200)
                  }}
                >
                  {copied ? 'Copied' : 'Copy'}
                </Button>
              </div>
            </div>
            <p className="text-sm text-text-secondary">
              Share this with {success.user.email} — they should change it on first login.
            </p>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setSuccess(null)
                  setEmail('')
                  setUsername('')
                  setDisplayName('')
                }}
              >
                Invite Another
              </Button>
              <Button variant="primary" onClick={() => navigate('/admin/users')}>
                View All Users
              </Button>
            </div>
          </div>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              setError('')
              inviteMutation.mutate()
            }}
          >
            <Input
              label="Email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Input
              label="Username"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <Input
              label="Display Name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />

            <Button type="submit" variant="primary" loading={inviteMutation.isPending}>
              Send Invite
            </Button>
            {error ? <p className="text-sm text-accent-red">{error}</p> : null}
          </form>
        )}
      </Card>
    </div>
  )
}
