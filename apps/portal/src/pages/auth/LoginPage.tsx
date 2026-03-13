import { Link, useNavigate } from '@tanstack/react-router'
import { Eye, EyeOff } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { api } from '../../lib/api'
import { useAuthStore } from '../../store/auth.store'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Divider } from '../../components/ui/Divider'
import { Input } from '../../components/ui/Input'
import { Spinner } from '../../components/ui/Spinner'

type LoginResponse = {
  token: string
  user: {
    id: string
    name?: string
    displayName?: string
    username?: string
    email: string
    role?: string
  }
  org?: {
    id: string
    name: string
  } | null
  permissions?: string[]
}

type ApiErrorShape = {
  errors?: Record<string, string>
  message?: string
}

export function LoginPage() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((state) => state.setAuth)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const canSubmit = useMemo(() => email.trim().length > 0 && password.trim().length > 0, [email, password])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFieldErrors({})
    setLoading(true)

    try {
      const response = await api.post<LoginResponse>('/api/auth/login', { email, password })
      const payload = response.data
      setAuth({
        token: payload.token,
        user: payload.user,
        org: payload.org ?? null,
        permissions: payload.permissions ?? [],
      })
      navigate({ to: '/dashboard' })
    } catch (error: unknown) {
      const data = (error as { response?: { data?: ApiErrorShape } }).response?.data
      setFieldErrors(data?.errors ?? { form: data?.message ?? 'Sign in failed. Please check your credentials.' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-base px-4">
      <Card className="w-full max-w-[400px]">
        <div className="space-y-4">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-accent-blue">Devora</p>
            <h1 className="text-xl font-semibold text-text-primary">Sign in to your workspace</h1>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <Input
              label="Email"
              name="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              error={fieldErrors.email}
            />

            <div className="space-y-1.5">
              <div className="relative">
                <Input
                  label="Password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  error={fieldErrors.password}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute right-2 top-[30px] rounded p-1 text-text-secondary hover:bg-bg-subtle hover:text-text-primary"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {fieldErrors.form ? <p className="text-xs text-accent-rose">{fieldErrors.form}</p> : null}

            <Button type="submit" variant="primary" size="lg" className="w-full" disabled={loading || !canSubmit}>
              {loading ? <Spinner size="sm" /> : null}
              <span>Sign in</span>
            </Button>
          </form>

          <div className="text-center">
            <Link to="/login" className="text-xs text-accent-blue hover:underline">
              Forgot password?
            </Link>
          </div>

          <div className="flex items-center gap-3">
            <Divider className="my-0 flex-1" />
            <span className="text-xs uppercase tracking-[0.08em] text-text-muted">or</span>
            <Divider className="my-0 flex-1" />
          </div>

          <Link to="/register" className="block">
            <Button variant="ghost" size="lg" className="w-full">
              Create a new organization
            </Button>
          </Link>

          <p className="text-center text-xs text-text-secondary">
            Need an account?{' '}
            <Link to="/register" className="text-accent-blue hover:underline">
              Register here
            </Link>
          </p>
        </div>
      </Card>
    </div>
  )
}
