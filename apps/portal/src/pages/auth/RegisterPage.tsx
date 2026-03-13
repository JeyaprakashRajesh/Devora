import { Link, useNavigate } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { api } from '../../lib/api'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { Spinner } from '../../components/ui/Spinner'

type RegisterErrors = Record<string, string>

const toSlug = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')

export function RegisterPage() {
  const navigate = useNavigate()

  const [organizationName, setOrganizationName] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [errors, setErrors] = useState<RegisterErrors>({})
  const [loading, setLoading] = useState(false)

  const canSubmit = useMemo(
    () =>
      organizationName.trim().length > 0 &&
      name.trim().length > 0 &&
      email.trim().length > 0 &&
      password.trim().length > 0 &&
      confirmPassword.trim().length > 0,
    [organizationName, name, email, password, confirmPassword],
  )

  const validate = (): RegisterErrors => {
    const next: RegisterErrors = {}

    if (organizationName.trim().length < 2) {
      next.organizationName = 'Organization name must be at least 2 characters.'
    }

    if (name.trim().length < 2) {
      next.name = 'Your name must be at least 2 characters.'
    }

    if (!email.includes('@')) {
      next.email = 'Please provide a valid email.'
    }

    if (password.length < 8) {
      next.password = 'Password must be at least 8 characters.'
    }

    if (password !== confirmPassword) {
      next.confirmPassword = 'Passwords do not match.'
    }

    return next
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const validationErrors = validate()
    setErrors(validationErrors)

    if (Object.keys(validationErrors).length > 0) {
      return
    }

    setLoading(true)

    try {
      await api.post('/api/auth/register', {
        orgName: organizationName,
        orgSlug: toSlug(organizationName),
        username: name,
        email,
        password,
      })
      navigate({ to: '/login' })
    } catch (error: unknown) {
      const message = (error as { response?: { data?: { message?: string } } }).response?.data?.message
      setErrors({ form: message ?? 'Registration failed. Please try again.' })
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
            <h1 className="text-xl font-semibold text-text-primary">Create your organization</h1>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <Input
              label="Organization name"
              value={organizationName}
              onChange={(event) => setOrganizationName(event.target.value)}
              error={errors.organizationName}
            />
            <Input label="Your name" value={name} onChange={(event) => setName(event.target.value)} error={errors.name} />
            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              error={errors.email}
            />
            <Input
              label="Password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              error={errors.password}
            />
            <Input
              label="Confirm password"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              error={errors.confirmPassword}
            />

            {errors.form ? <p className="text-xs text-accent-rose">{errors.form}</p> : null}

            <Button type="submit" variant="primary" size="lg" className="w-full" disabled={loading || !canSubmit}>
              {loading ? <Spinner size="sm" /> : null}
              <span>Create organization</span>
            </Button>
          </form>

          <p className="text-center text-xs text-text-secondary">
            Already have an account?{' '}
            <Link to="/login" className="text-accent-blue hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </Card>
    </div>
  )
}
