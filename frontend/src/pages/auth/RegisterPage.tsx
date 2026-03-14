import { Eye, EyeOff } from 'lucide-react'
import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import { api } from '../../lib/api'
import { useAuthStore } from '../../store/auth'
import type { Org, User } from '../../store/auth'

type RegisterResponse = {
  token?: string
  user?: User
  org?: Org
}

type MeResponse = {
  user: User
  org: Org
  permissions: string[]
}

const slugPattern = /^[a-z0-9-]+$/

function unwrapData<T>(payload: unknown): T {
  const wrapped = payload as { data?: T }
  return (wrapped?.data ?? payload) as T
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

export default function RegisterPage() {
  const navigate = useNavigate()
  const token = useAuthStore((s) => s.token)
  const setAuth = useAuthStore((s) => s.setAuth)

  const [orgName, setOrgName] = useState('')
  const [orgSlug, setOrgSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [username, setUsername] = useState('')
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

  useEffect(() => {
    if (!slugTouched) {
      setOrgSlug(slugify(orgName))
    }
  }, [orgName, slugTouched])

  const slugError = useMemo(() => {
    if (!orgSlug) return 'Organization slug is required'
    if (orgSlug.length < 2) return 'Organization slug must be at least 2 characters'
    if (!slugPattern.test(orgSlug)) return 'Only lowercase letters, numbers, hyphens'
    return ''
  }, [orgSlug])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')

    if (slugError) {
      setSlugTouched(true)
      return
    }

    setLoading(true)

    try {
      const registerRes = await api.post('/auth/register', {
        org_name: orgName,
        org_slug: orgSlug,
        email,
        username,
        password,
      })
      const registerData = unwrapData<RegisterResponse>(registerRes.data)

      if (!registerData.token) {
        throw new Error('Authentication token was not returned')
      }

      const meRes = await api.get('/auth/me', {
        headers: {
          Authorization: `Bearer ${registerData.token}`,
        },
      })
      const meData = unwrapData<MeResponse>(meRes.data)

      setAuth(meData.user, meData.org, registerData.token, meData.permissions ?? [])
      navigate('/dashboard', { replace: true })
    } catch (err: unknown) {
      const maybeErr = err as {
        response?: { data?: { error?: string } }
        message?: string
      }
      setError(maybeErr.response?.data?.error ?? maybeErr.message ?? 'Unable to create organization')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg-base flex items-center justify-center px-4">
      <div className="w-full max-w-[400px] bg-bg-surface border border-border rounded-lg p-8">
        <h1 className="text-xl font-bold text-text-primary">devora</h1>
        <p className="text-sm text-text-secondary mt-1">Create your organization</p>

        <form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit}>
          <Input
            label="Organization Name"
            required
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
          />

          <Input
            label="Organization Slug"
            required
            value={orgSlug}
            onChange={(e) => {
              setSlugTouched(true)
              setOrgSlug(slugify(e.target.value))
            }}
            onBlur={() => setSlugTouched(true)}
            error={slugTouched ? slugError : ''}
          />

          <Input
            label="Your Name"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />

          <Input
            label="Email"
            type="email"
            required
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

          <Button type="submit" variant="primary" className="w-full" loading={loading}>
            Create organization
          </Button>

          {error ? <p className="text-sm text-accent-red text-center">{error}</p> : null}

          <p className="text-sm text-text-muted text-center">
            Already have an account?{' '}
            <span className="text-accent-amber cursor-pointer" onClick={() => navigate('/login')}>
              Sign in
            </span>
          </p>
        </form>
      </div>
    </div>
  )
}
