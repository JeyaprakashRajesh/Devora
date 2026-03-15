import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Eye,
  EyeOff,
  Globe,
  Info,
  UserCheck,
  XCircle,
} from 'lucide-react'
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import { api } from '../../lib/api'
import { useAuthStore } from '../../store/auth'
import type { Org, User } from '../../store/auth'

type WizardStep = 1 | 2 | 3 | 4

type WizardState = {
  orgName: string
  orgSlug: string
  slugManuallyEdited: boolean
  orgEmail: string
  adminUsername: string
  adminEmail: string
  adminPassword: string
  confirmPassword: string
  showPassword: boolean
  showConfirm: boolean
  currentStep: WizardStep
  isLoading: boolean
  apiError: string | null
  stepErrors: Record<string, string>
}

type RegisterPayload = {
  org_name: string
  org_slug: string
  org_email: string
  admin_email: string
  admin_username: string
  admin_password: string
}

type RegisterData = {
  user: User
  org: Org
  token: string
  permissions: string[]
}

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const slugRegex = /^[a-z0-9-]+$/

function unwrapData<T>(payload: unknown): T {
  const wrapped = payload as { data?: T }
  return (wrapped?.data ?? payload) as T
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50)
}

function passwordStrength(password: string) {
  const checks = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /\d/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ]
  const score = checks.filter(Boolean).length
  const label = score <= 1 ? 'Weak' : score === 2 ? 'Fair' : score === 3 ? 'Good' : 'Strong'
  return { checks, score, label }
}

const steps = [
  { id: 1 as WizardStep, label: 'Organization' },
  { id: 2 as WizardStep, label: 'Contact' },
  { id: 3 as WizardStep, label: 'Admin Account' },
  { id: 4 as WizardStep, label: 'Review' },
]

export default function RegisterPage() {
  const navigate = useNavigate()
  const token = useAuthStore((s) => s.token)
  const setAuth = useAuthStore((s) => s.setAuth)

  const orgSlugInputRef = useRef<HTMLInputElement | null>(null)
  const adminEmailInputRef = useRef<HTMLInputElement | null>(null)

  const [state, setState] = useState<WizardState>({
    orgName: '',
    orgSlug: '',
    slugManuallyEdited: false,
    orgEmail: '',
    adminUsername: '',
    adminEmail: '',
    adminPassword: '',
    confirmPassword: '',
    showPassword: false,
    showConfirm: false,
    currentStep: 1,
    isLoading: false,
    apiError: null,
    stepErrors: {},
  })

  useEffect(() => {
    if (token) {
      navigate('/dashboard', { replace: true })
    }
  }, [token, navigate])

  useEffect(() => {
    if (state.currentStep === 1 && state.stepErrors.orgSlug) {
      orgSlugInputRef.current?.focus()
    }
    if (state.currentStep === 3 && state.stepErrors.adminEmail) {
      adminEmailInputRef.current?.focus()
    }
  }, [state.currentStep, state.stepErrors])

  const strength = useMemo(() => passwordStrength(state.adminPassword), [state.adminPassword])

  const setField = <K extends keyof WizardState>(key: K, value: WizardState[K]) => {
    setState((prev) => ({ ...prev, [key]: value }))
  }

  const validateStep = (step: number): boolean => {
    const errors: Record<string, string> = {}

    if (step === 1) {
      if (!state.orgName.trim() || state.orgName.trim().length < 2) {
        errors.orgName = 'Required, min 2 characters'
      }
      if (!state.orgSlug.match(slugRegex) || state.orgSlug.length < 2) {
        errors.orgSlug = 'Only lowercase letters, numbers and hyphens, min 2 chars'
      }
    }

    if (step === 2) {
      if (!state.orgEmail.match(emailRegex)) {
        errors.orgEmail = 'Valid email required'
      }
    }

    if (step === 3) {
      if (!state.adminUsername.trim() || state.adminUsername.trim().length < 2) {
        errors.adminUsername = 'Required, min 2 chars'
      }
      if (!state.adminEmail.match(emailRegex)) {
        errors.adminEmail = 'Valid email required'
      }
      if (state.adminPassword.length < 8) {
        errors.adminPassword = 'Min 8 characters'
      }
      if (state.adminPassword !== state.confirmPassword) {
        errors.confirmPassword = 'Passwords do not match'
      }
    }

    setField('stepErrors', errors)
    return Object.keys(errors).length === 0
  }

  const handleNext = () => {
    if (validateStep(state.currentStep)) {
      setState((prev) => ({
        ...prev,
        currentStep: Math.min(4, prev.currentStep + 1) as WizardStep,
        stepErrors: {},
      }))
    }
  }

  const handleBack = () => {
    setState((prev) => ({
      ...prev,
      stepErrors: {},
      apiError: null,
      currentStep: Math.max(1, prev.currentStep - 1) as WizardStep,
    }))
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const validSteps = [1, 2, 3].every((step) => validateStep(step))
    if (!validSteps) {
      const firstInvalid = [1, 2, 3].find((step) => !validateStep(step)) as WizardStep
      setState((prev) => ({ ...prev, currentStep: firstInvalid }))
      return
    }

    setState((prev) => ({ ...prev, isLoading: true, apiError: null }))

    const payload: RegisterPayload = {
      org_name: state.orgName.trim(),
      org_slug: state.orgSlug.trim(),
      org_email: state.orgEmail.trim(),
      admin_email: state.adminEmail.trim(),
      admin_username: state.adminUsername.trim(),
      admin_password: state.adminPassword,
    }

    try {
      const res = await api.post('/auth/register', payload)
      const data = unwrapData<RegisterData>(res.data)

      setAuth(data.user, data.org, data.token, data.permissions ?? [])
      navigate('/dashboard', { replace: true })
    } catch (err: unknown) {
      const maybeErr = err as { response?: { data?: { error?: string } } }
      const message = maybeErr.response?.data?.error ?? 'Unable to create organization'

      if (message === 'Organization slug already taken') {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          currentStep: 1,
          stepErrors: { orgSlug: 'Organization slug already taken' },
        }))
        return
      }

      if (message === 'Admin email already registered') {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          currentStep: 3,
          stepErrors: { adminEmail: 'Admin email already registered' },
        }))
        return
      }

      setState((prev) => ({ ...prev, isLoading: false, apiError: message }))
      return
    }

    setState((prev) => ({ ...prev, isLoading: false }))
  }

  const stepIndicator = (step: WizardStep, index: number) => {
    const completed = step < state.currentStep
    const active = step === state.currentStep

    return (
      <div key={step} className="flex items-start flex-1">
        <div className="flex flex-col items-center">
          <div
            className={[
              'w-8 h-8 rounded-full border flex items-center justify-center text-xs',
              completed
                ? 'bg-accent-green border-accent-green text-white'
                : active
                  ? 'bg-accent-amber border-accent-amber text-white font-bold'
                  : 'bg-bg-subtle border-border text-text-muted',
            ].join(' ')}
          >
            {completed ? <CheckCircle2 className="w-4 h-4" /> : step}
          </div>
          <span
            className={[
              'mt-2 text-xs text-center',
              completed
                ? 'text-accent-green'
                : active
                  ? 'text-accent-amber font-medium'
                  : 'text-text-muted',
            ].join(' ')}
          >
            {steps[index].label}
          </span>
        </div>

        {index < steps.length - 1 ? (
          <div
            className={[
              'h-[2px] flex-1 mx-1 mt-4',
              step < state.currentStep ? 'bg-accent-green' : 'bg-border',
            ].join(' ')}
          />
        ) : null}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-bg-base flex items-center justify-center py-12 px-4">
      <div className="w-[520px] max-w-full bg-bg-surface border border-border rounded-xl overflow-hidden shadow-2xl">
        <div className="bg-bg-elevated border-b border-border p-5">
          <div className="flex items-center justify-between">
            <h1 className="font-bold text-base text-text-primary">devora</h1>
            <p className="text-xs text-text-muted">
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => navigate('/login')}
                className="text-accent-amber hover:underline"
              >
                Sign in
              </button>
            </p>
          </div>

          <div className="mt-4 flex items-start">{steps.map((s, i) => stepIndicator(s.id, i))}</div>
        </div>

        <form onSubmit={submit}>
          <div className="p-8 min-h-[320px]">
            <div key={state.currentStep} className="wizard-step-fade">
              {state.currentStep === 1 ? (
                <div>
                  <h2 className="text-lg font-semibold text-text-primary">Your Organization</h2>
                  <p className="text-sm text-text-muted mt-1">Tell us about your organization</p>

                  <div className="mt-6 flex flex-col gap-4">
                    <Input
                      label="Organization Name"
                      placeholder="e.g. Acme Corporation"
                      required
                      autoFocus
                      value={state.orgName}
                      onChange={(e) => {
                        const nextName = e.target.value
                        setState((prev) => ({
                          ...prev,
                          orgName: nextName,
                          orgSlug: prev.slugManuallyEdited ? prev.orgSlug : slugify(nextName),
                        }))
                      }}
                      error={state.stepErrors.orgName}
                    />

                    <Input
                      ref={orgSlugInputRef}
                      label="Organization Slug"
                      placeholder="e.g. acme-corp"
                      helper="Used in URLs - lowercase letters, numbers and hyphens only"
                      value={state.orgSlug}
                      onChange={(e) => {
                        const nextSlug = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-')
                        setState((prev) => ({
                          ...prev,
                          orgSlug: nextSlug,
                          slugManuallyEdited: true,
                        }))
                      }}
                      onBlur={() => {
                        if (!state.orgSlug.match(slugRegex) || state.orgSlug.length < 2) {
                          setState((prev) => ({
                            ...prev,
                            stepErrors: {
                              ...prev.stepErrors,
                              orgSlug: 'Only lowercase letters, numbers and hyphens, min 2 chars',
                            },
                          }))
                        }
                      }}
                      error={state.stepErrors.orgSlug}
                    />

                    <div className="flex items-center gap-1.5 text-xs text-text-muted mt-1">
                      <Globe className="w-3 h-3" />
                      <span>devora.io/</span>
                      <span className="text-accent-amber font-mono">{state.orgSlug || 'your-org'}</span>
                    </div>
                  </div>
                </div>
              ) : null}

              {state.currentStep === 2 ? (
                <div>
                  <h2 className="text-lg font-semibold text-text-primary">Organization Contact</h2>
                  <p className="text-sm text-text-muted mt-1">How can people reach your organization?</p>

                  <div className="mt-6 flex flex-col gap-4">
                    <Input
                      label="Organization Email"
                      type="email"
                      placeholder="e.g. contact@yourcompany.com"
                      helper="This is your organization's public contact email, not your personal email"
                      required
                      autoFocus
                      value={state.orgEmail}
                      onChange={(e) => setField('orgEmail', e.target.value)}
                      error={state.stepErrors.orgEmail}
                    />

                    <div className="flex gap-2.5 p-3 rounded-lg bg-accent-blue/10 border border-accent-blue/20 mt-2">
                      <Info className="w-4 h-4 text-accent-blue shrink-0 mt-0.5" />
                      <p className="text-xs text-text-secondary">
                        This email is used for organization communications and billing. Your personal
                        admin login will be set up in the next step.
                      </p>
                    </div>

                    {state.adminEmail && state.orgEmail && state.adminEmail === state.orgEmail ? (
                      <div className="flex gap-2 p-2.5 rounded-lg bg-accent-amber/10 border border-accent-amber/20">
                        <AlertTriangle className="w-4 h-4 text-accent-amber shrink-0" />
                        <p className="text-xs text-text-secondary">
                          Your admin email is the same as the organization email. This is allowed but we
                          recommend using your personal email.
                        </p>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {state.currentStep === 3 ? (
                <div>
                  <h2 className="text-lg font-semibold text-text-primary">Admin Account</h2>
                  <p className="text-sm text-text-muted mt-1">Create your personal administrator account</p>

                  <div className="mt-6 flex flex-col gap-4">
                    <Input
                      label="Your Name"
                      placeholder="e.g. John Smith"
                      helper="This will be your display name"
                      required
                      autoFocus
                      value={state.adminUsername}
                      onChange={(e) => setField('adminUsername', e.target.value)}
                      error={state.stepErrors.adminUsername}
                    />

                    <Input
                      ref={adminEmailInputRef}
                      label="Your Email"
                      type="email"
                      placeholder="e.g. john@yourcompany.com"
                      helper="This is your personal login email"
                      required
                      value={state.adminEmail}
                      onChange={(e) => setField('adminEmail', e.target.value)}
                      error={state.stepErrors.adminEmail}
                    />

                    {state.adminEmail && state.orgEmail && state.adminEmail === state.orgEmail ? (
                      <div className="flex gap-2 p-2.5 rounded-lg bg-accent-amber/10 border border-accent-amber/20">
                        <AlertTriangle className="w-4 h-4 text-accent-amber shrink-0" />
                        <p className="text-xs text-text-secondary">
                          Your admin email is the same as the organization email. This is allowed but we
                          recommend using your personal email.
                        </p>
                      </div>
                    ) : null}

                    <div className="relative">
                      <Input
                        label="Password"
                        type={state.showPassword ? 'text' : 'password'}
                        required
                        value={state.adminPassword}
                        onChange={(e) => setField('adminPassword', e.target.value)}
                        className="pr-10"
                        error={state.stepErrors.adminPassword}
                      />
                      <button
                        type="button"
                        onClick={() => setField('showPassword', !state.showPassword)}
                        className="absolute right-3 top-[30px] text-text-muted hover:text-text-primary"
                        aria-label={state.showPassword ? 'Hide password' : 'Show password'}
                      >
                        {state.showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>

                    <div className="flex flex-col gap-2">
                      <div className="grid grid-cols-4 gap-1">
                        <div
                          className={[
                            'h-1.5 rounded',
                            strength.checks[0] ? 'bg-accent-red' : 'bg-border',
                          ].join(' ')}
                        />
                        <div
                          className={[
                            'h-1.5 rounded',
                            strength.checks[1] ? 'bg-accent-amber' : 'bg-border',
                          ].join(' ')}
                        />
                        <div
                          className={[
                            'h-1.5 rounded',
                            strength.checks[2] ? 'bg-accent-blue' : 'bg-border',
                          ].join(' ')}
                        />
                        <div
                          className={[
                            'h-1.5 rounded',
                            strength.checks[3] ? 'bg-accent-green' : 'bg-border',
                          ].join(' ')}
                        />
                      </div>
                      <p
                        className={[
                          'text-xs',
                          strength.score === 4
                            ? 'text-accent-green'
                            : strength.score === 3
                              ? 'text-accent-blue'
                              : strength.score === 2
                                ? 'text-accent-amber'
                                : 'text-accent-red',
                        ].join(' ')}
                      >
                        {strength.label}
                      </p>
                    </div>

                    <div className="relative">
                      <Input
                        label="Confirm Password"
                        type={state.showConfirm ? 'text' : 'password'}
                        required
                        value={state.confirmPassword}
                        onChange={(e) => setField('confirmPassword', e.target.value)}
                        className="pr-10"
                        error={state.stepErrors.confirmPassword}
                      />
                      <button
                        type="button"
                        onClick={() => setField('showConfirm', !state.showConfirm)}
                        className="absolute right-3 top-[30px] text-text-muted hover:text-text-primary"
                        aria-label={state.showConfirm ? 'Hide confirm password' : 'Show confirm password'}
                      >
                        {state.showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              {state.currentStep === 4 ? (
                <div>
                  <h2 className="text-lg font-semibold text-text-primary">Review &amp; Create</h2>
                  <p className="text-sm text-text-muted mt-1">Confirm your organization details</p>

                  {state.apiError ? (
                    <div className="flex gap-2 p-3 rounded-lg bg-accent-red/10 border border-accent-red/20 mb-4 mt-6">
                      <XCircle className="w-4 h-4 text-accent-red" />
                      <p className="text-sm text-accent-red">{state.apiError}</p>
                    </div>
                  ) : null}

                  <div className="rounded-lg border border-border bg-bg-elevated p-4 mb-4 mt-6">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-accent-amber" />
                        <span className="text-sm font-medium text-text-primary">Organization</span>
                      </div>
                      <button
                        type="button"
                        className="text-accent-amber text-xs hover:underline"
                        onClick={() => setField('currentStep', 1)}
                      >
                        Edit
                      </button>
                    </div>

                    <div className="flex justify-between py-1.5 border-b border-border">
                      <span className="text-xs text-text-muted">Name</span>
                      <span className="text-sm text-text-primary font-medium">{state.orgName}</span>
                    </div>
                    <div className="flex justify-between py-1.5 border-b border-border">
                      <span className="text-xs text-text-muted">Slug</span>
                      <span className="text-sm text-text-primary font-medium">
                        <span className="text-text-muted">devora.io/</span>
                        {state.orgSlug}
                      </span>
                    </div>
                    <div className="flex justify-between py-1.5">
                      <span className="text-xs text-text-muted">Email</span>
                      <span className="text-sm text-text-primary font-medium">{state.orgEmail}</span>
                    </div>
                  </div>

                  <div className="rounded-lg border border-border bg-bg-elevated p-4 mb-6">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <UserCheck className="w-4 h-4 text-accent-green" />
                        <span className="text-sm font-medium text-text-primary">Admin Account</span>
                      </div>
                      <button
                        type="button"
                        className="text-accent-amber text-xs hover:underline"
                        onClick={() => setField('currentStep', 3)}
                      >
                        Edit
                      </button>
                    </div>

                    <div className="flex justify-between py-1.5 border-b border-border">
                      <span className="text-xs text-text-muted">Name</span>
                      <span className="text-sm text-text-primary font-medium">{state.adminUsername}</span>
                    </div>
                    <div className="flex justify-between py-1.5 border-b border-border">
                      <span className="text-xs text-text-muted">Email</span>
                      <span className="text-sm text-text-primary font-medium">{state.adminEmail}</span>
                    </div>
                    <div className="flex justify-between py-1.5 border-b border-border">
                      <span className="text-xs text-text-muted">Password</span>
                      <span className="text-sm text-text-primary font-medium">••••••••</span>
                    </div>
                    <div className="flex justify-between py-1.5">
                      <span className="text-xs text-text-muted">Role</span>
                      <span className="text-xs text-accent-amber border border-accent-amber/30 bg-accent-amber/10 rounded px-2 py-0.5">
                        Organization Admin
                      </span>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="border-t border-border px-8 py-4 flex items-center justify-between">
            {state.currentStep === 1 ? <div /> : <Button variant="ghost" onClick={handleBack}>← Back</Button>}

            {state.currentStep < 4 ? (
              <Button type="button" onClick={handleNext}>
                Continue →
              </Button>
            ) : (
              <Button type="submit" loading={state.isLoading}>
                Create Organization
              </Button>
            )}
          </div>
        </form>
      </div>

      <style>{`
        .wizard-step-fade {
          animation: wizardFadeIn 220ms ease;
        }
        @keyframes wizardFadeIn {
          from {
            opacity: 0;
            transform: translateX(10px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
      `}</style>
    </div>
  )
}
