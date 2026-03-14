import { Eye, EyeOff } from 'lucide-react'
import { FormEvent, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import { api } from '../../lib/api'
import { useAuthStore } from '../../store/auth'
import type { Org, User } from '../../store/auth'

type AuthResponse = {
  token?: string
  user?: User
  org?: Org
}

type MeResponse = {
  user: User
  org: Org
  permissions: string[]
}

function unwrapData<T>(payload: unknown): T {
  const wrapped = payload as { data?: T }
  return (wrapped?.data ?? payload) as T
}

export default function LoginPage() {
  const navigate = useNavigate()
  const token = useAuthStore((s) => s.token)
  const setAuth = useAuthStore((s) => s.setAuth)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (token) {
      navigate('/dashboard', { replace: true })
    }
  }, [token, navigate])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setLoading(true)

    try {
      const loginRes = await api.post('/auth/login', { email, password })
      const loginData = unwrapData<AuthResponse>(loginRes.data)

      if (!loginData.token) {
        throw new Error('Authentication token was not returned')
      }

      const meRes = await api.get('/auth/me', {
        headers: {
          Authorization: `Bearer ${loginData.token}`,
        },
      })
      const meData = unwrapData<MeResponse>(meRes.data)

      setAuth(meData.user, meData.org, loginData.token, meData.permissions ?? [])
      navigate('/dashboard', { replace: true })
    } catch (err: unknown) {
      const maybeErr = err as {
        response?: { data?: { error?: string } }
        message?: string
      }
      setError(maybeErr.response?.data?.error ?? maybeErr.message ?? 'Unable to sign in')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg-base flex items-center justify-center px-4">
      <div className="w-full max-w-[400px] bg-bg-surface border border-border rounded-lg p-8">
        <h1 className="text-xl font-bold text-text-primary">devora</h1>
        <p className="text-sm text-text-secondary mt-1">Sign in to your workspace</p>

        <form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit}>
          <Input
            label="Email"
            type="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <div className="relative">
            <Input
              label="Password"
              type={showPassword ? 'text' : 'password'}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-[30px] text-text-muted hover:text-text-primary"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          <Button type="submit" variant="primary" className="w-full mt-2" loading={loading}>
            Sign in
          </Button>

          {error ? <p className="text-sm text-accent-red mt-2 text-center">{error}</p> : null}

          <hr className="border-border my-4" />

          <Button type="button" variant="ghost" className="w-full" onClick={() => navigate('/register')}>
            Create a new organization →
          </Button>
        </form>
      </div>
    </div>
  )
}
