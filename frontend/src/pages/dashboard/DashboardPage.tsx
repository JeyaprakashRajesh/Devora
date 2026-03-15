import { Activity, Box, CircleDot, PartyPopper, Rocket, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import Card from '../../components/ui/Card'
import { useAuthStore } from '../../store/auth'

const metrics = [
  {
    label: 'Active Sandboxes',
    value: '0',
    Icon: Box,
    accentClass: 'text-accent-violet',
    subtleBgClass: 'bg-amber-subtle',
  },
  {
    label: 'Open Issues',
    value: '0',
    Icon: CircleDot,
    accentClass: 'text-accent-blue',
    subtleBgClass: 'bg-[var(--accent-blue-subtle)]',
  },
  {
    label: 'Pipeline Health',
    value: '—',
    Icon: Activity,
    accentClass: 'text-accent-green',
    subtleBgClass: 'bg-[var(--accent-green-subtle)]',
  },
  {
    label: 'Deployments',
    value: '0',
    Icon: Rocket,
    accentClass: 'text-accent-cyan',
    subtleBgClass: 'bg-[var(--accent-blue-subtle)]',
  },
]

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user)
  const org = useAuthStore((s) => s.org)
  const [showWelcome, setShowWelcome] = useState(false)

  useEffect(() => {
    if (!org?.created_at) {
      setShowWelcome(false)
      return
    }

    const createdAt = new Date(org.created_at).getTime()
    if (Number.isNaN(createdAt)) {
      setShowWelcome(false)
      return
    }

    setShowWelcome(Date.now()- createdAt < 60_000)
  }, [org?.created_at])

  return (
    <div>
      <h1 className="text-lg font-semibold text-text-primary">Overview</h1>
      <p className="text-sm text-text-muted mt-0.5">
        Welcome back, {user?.display_name ?? user?.username}
      </p>

      {showWelcome && user && org ? (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-accent-amber/10 border border-accent-amber/25 mb-6 mt-6">
          <div className="w-10 h-10 rounded-full bg-accent-amber/20 flex items-center justify-center shrink-0">
            <PartyPopper className="w-5 h-5 text-accent-amber" />
          </div>
          <div>
            <p className="text-sm font-semibold text-text-primary">
              Welcome to Devora, {user.username}! 🎉
            </p>
            <p className="text-xs text-text-muted mt-0.5">
              Your organization &quot;{org.name}&quot; is ready. Start by creating your first project.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowWelcome(false)}
            className="ml-auto text-text-muted hover:text-text-primary"
            aria-label="Dismiss welcome banner"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
        {metrics.map(({ label, value, Icon, accentClass, subtleBgClass }) => (
          <Card key={label} padding="md">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-text-muted">{label}</p>
                <p className="text-3xl font-bold text-text-primary mt-1">{value}</p>
              </div>
              <div
                className={[
                  'w-10 h-10 rounded-lg flex items-center justify-center',
                  subtleBgClass,
                ].join(' ')}
              >
                <Icon className={`w-5 h-5 ${accentClass}`} />
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
