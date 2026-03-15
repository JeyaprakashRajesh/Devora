import { Eye, EyeOff } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Input from '../../components/ui/Input'
import { api } from '../../lib/api'
import { useAuthStore } from '../../store/auth'

type MeResponse = {
  user: {
    id: string
    org_id: string
    email: string
    username: string
    display_name?: string
    job_title?: string
    avatar_url?: string
    status: string
    is_org_owner: boolean
    must_change_password?: boolean
    onboarding_complete?: boolean
    last_seen_at?: string
    created_at: string
    updated_at?: string
  }
  org: {
    id: string
    name: string
    slug: string
    owner_id?: string
    contact_email?: string
    website?: string
    logo_url?: string
    setup_complete: boolean
  }
  permissions: string[]
}

function unwrapData<T>(payload: unknown): T {
  const wrapped = payload as { data?: T }
  return (wrapped?.data ?? payload) as T
}

function calcStrength(value: string): number {
  let score = 0
  if (value.length >= 8) score += 1
  if (/[A-Z]/.test(value)) score += 1
  if (/[0-9]/.test(value)) score += 1
  if (/[^A-Za-z0-9]/.test(value)) score += 1
  return score
}

export default function OnboardingPage() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const token = useAuthStore((s) => s.token)
  const setAuth = useAuthStore((s) => s.setAuth)
  const permissions = useAuthStore((s) => s.permissions)
  const org = useAuthStore((s) => s.org)

  const [step, setStep] = useState<1 | 2>(1)
  const [name, setName] = useState(user?.display_name ?? '')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const strength = useMemo(() => calcStrength(password), [password])

  if (!token || !user || !org) {
    return <Navigate to="/login" replace />
  }

  if (user.onboarding_complete && !user.must_change_password) {
    return <Navigate to="/dashboard" replace />
  }

  const validateStepTwo = () => {
    if (password.length < 8) return 'Minimum 8 characters'
    if (password !== confirmPassword) return 'Passwords do not match'
    return ''
  }

  const completeSetup = async () => {
    const validationErr = validateStepTwo()
    if (validationErr) {
      setError(validationErr)
      return
    }

    setSubmitting(true)
    setError('')
    try {
      const res = await api.post('/auth/onboarding', {
        name,
        new_password: password,
      })
      const data = unwrapData<MeResponse>(res.data)
      setAuth(data.user, data.org, token, data.permissions ?? permissions)
      window.alert(`Welcome to Devora, ${name}!`)
      navigate('/dashboard', { replace: true })
    } catch (err: unknown) {
      const maybeErr = err as { response?: { data?: { error?: string } }; message?: string }
      setError(maybeErr.response?.data?.error ?? maybeErr.message ?? 'Failed to complete onboarding')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg-base flex items-center justify-center px-4">
      <Card className="w-full max-w-[440px]" padding="md">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-accent-amber" />
          <span className={`w-2 h-2 rounded-full ${step === 2 ? 'bg-accent-amber' : 'bg-border'}`} />
          <span className="ml-2 text-xs text-text-muted">Step {step} of 2</span>
        </div>

        <h1 className="text-xl font-bold text-text-primary mt-4">Welcome to Devora</h1>
        <p className="text-sm text-text-muted mt-1">Let&apos;s set up your account</p>

        <div className="mt-6 overflow-hidden">
          <div className="flex transition-transform duration-300" style={{ transform: step === 1 ? 'translateX(0%)' : 'translateX(-100%)' }}>
            <div className="w-full shrink-0">
              <Input
                label="Your full name"
                placeholder="e.g. John Smith"
                required
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
              />

              <Button
                variant="primary"
                className="w-full mt-4"
                onClick={() => {
                  if (name.trim().length < 2) {
                    setError('Please enter at least 2 characters for your name')
                    return
                  }
                  setError('')
                  setStep(2)
                }}
              >
                Continue →
              </Button>
            </div>

            <div className="w-full shrink-0 pl-0">
              <button
                type="button"
                className="text-sm text-text-secondary hover:text-text-primary"
                onClick={() => {
                  setError('')
                  setStep(1)
                }}
              >
                ← Back
              </button>

              <p className="text-base font-semibold text-text-primary mt-3">Set your password</p>

              <div className="mt-3 relative">
                <Input
                  label="New password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  helper="Minimum 8 characters"
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

              <div className="grid grid-cols-4 gap-1 mt-2">
                {[1, 2, 3, 4].map((bar) => {
                  let cls = 'bg-bg-subtle border-border'
                  if (strength >= bar && bar === 1) cls = 'bg-accent-red border-accent-red'
                  if (strength >= bar && bar === 2) cls = 'bg-accent-amber border-accent-amber'
                  if (strength >= bar && bar === 3) cls = 'bg-accent-blue border-accent-blue'
                  if (strength >= bar && bar === 4) cls = 'bg-accent-green border-accent-green'
                  return <span key={bar} className={`h-1 rounded border ${cls}`} />
                })}
              </div>

              <div className="mt-3 relative">
                <Input
                  label="Confirm password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  className="absolute right-3 top-[30px] text-text-muted hover:text-text-primary"
                  aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {error ? <p className="text-sm text-accent-red mt-2">{error}</p> : null}

              <Button variant="primary" className="w-full mt-4" loading={submitting} onClick={completeSetup}>
                Complete Setup
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}
