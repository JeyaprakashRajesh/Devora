import { Activity, Box, CircleDot, Rocket } from 'lucide-react'
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

  return (
    <div>
      <h1 className="text-lg font-semibold text-text-primary">Overview</h1>
      <p className="text-sm text-text-muted mt-0.5">
        Welcome back, {user?.display_name ?? user?.username}
      </p>

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
