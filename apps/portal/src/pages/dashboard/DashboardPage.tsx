import { Activity, Box, CircleDot, Rocket, UserCircle2, Waves } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { useAuthStore } from '../../store/auth.store'

type Metric = {
  label: string
  value: string
  icon: React.ComponentType<{ className?: string }>
  colorClass: string
}

const metrics: Metric[] = [
  { label: 'Active Sandboxes', value: '12', icon: Box, colorClass: 'text-accent-violet' },
  { label: 'Open Issues', value: '37', icon: CircleDot, colorClass: 'text-accent-blue' },
  { label: 'Pipeline Health', value: '98%', icon: Activity, colorClass: 'text-accent-emerald' },
  { label: 'Deployments Today', value: '24', icon: Rocket, colorClass: 'text-accent-cyan' },
]

export function DashboardPage() {
  const user = useAuthStore((state) => state.user)
  const org = useAuthStore((state) => state.org)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[20px] font-semibold text-text-primary">Overview</h1>
        <p className="text-sm text-text-secondary">
          {org?.name ?? 'Organization'} · Welcome back, {user?.name ?? 'Developer'}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {metrics.map((metric) => {
          const Icon = metric.icon

          return (
            <Card key={metric.label}>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] uppercase tracking-[0.08em] text-text-muted">{metric.label}</p>
                  <Icon className={`h-4 w-4 ${metric.colorClass}`} />
                </div>
                <p className="text-[28px] font-semibold leading-none text-text-primary">{metric.value}</p>
                <div className="h-1.5 w-full rounded bg-bg-subtle" />
              </div>
            </Card>
          )
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <Card title="Recent Activity" className="xl:col-span-3">
          <div className="flex h-48 flex-col items-center justify-center gap-2 text-center text-text-muted">
            <Waves className="h-8 w-8" />
            <p className="text-sm">No recent activity yet.</p>
          </div>
        </Card>
        <Card title="Team Online" className="xl:col-span-2">
          <div className="flex h-48 flex-col items-center justify-center gap-2 text-center text-text-muted">
            <UserCircle2 className="h-8 w-8" />
            <p className="text-sm">No teammates online right now.</p>
          </div>
        </Card>
      </div>
    </div>
  )
}
