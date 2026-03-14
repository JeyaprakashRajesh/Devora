import {
  BarChart2,
  Bell,
  Box,
  CircleDot,
  Code2,
  FolderGit2,
  GitPullRequest,
  LayoutGrid,
  MessageSquare,
  Rocket,
  Server,
  Settings,
} from 'lucide-react'
import { Link, useRouterState } from '@tanstack/react-router'
import { Avatar } from '../ui/Avatar'
import { Badge } from '../ui/Badge'
import { useAuthStore } from '../../store/auth.store'

type NavItem = {
  label: string
  to: string
  icon: React.ComponentType<{ className?: string }>
}

type NavGroup = {
  label: string
  items: NavItem[]
}

const navGroups: NavGroup[] = [
  {
    label: 'Workspace',
    items: [
      { label: 'IDE', to: '/ide', icon: Code2 },
      { label: 'Sandboxes', to: '/sandboxes', icon: Box },
    ],
  },
  {
    label: 'Projects',
    items: [
      { label: 'Projects', to: '/projects', icon: FolderGit2 },
      { label: 'Issues', to: '/issues', icon: CircleDot },
      { label: 'Board', to: '/board', icon: LayoutGrid },
    ],
  },
  {
    label: 'Collaborate',
    items: [
      { label: 'Chat', to: '/chat', icon: MessageSquare },
      { label: 'PRs', to: '/prs', icon: GitPullRequest },
    ],
  },
  {
    label: 'Deploy',
    items: [
      { label: 'Deployments', to: '/deployments', icon: Rocket },
      { label: 'Targets', to: '/targets', icon: Server },
    ],
  },
  {
    label: 'Monitor',
    items: [
      { label: 'Dashboards', to: '/dashboards', icon: BarChart2 },
      { label: 'Alerts', to: '/alerts', icon: Bell },
    ],
  },
]

export function Sidebar() {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const user = useAuthStore((state) => state.user)
  const org = useAuthStore((state) => state.org)

  return (
    <aside className="fixed left-0 top-12 flex h-[calc(100vh-48px)] w-[220px] flex-col border-r border-border-default bg-bg-surface">
      <div className="border-b border-border-default px-3 py-3">
        <p className="text-sm font-semibold tracking-wide text-text-primary">DEVORA</p>
        <p className="truncate text-xs text-text-secondary">{org?.name ?? 'No organization'}</p>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {navGroups.map((group) => (
          <div key={group.label} className="mb-4">
            <p className="mb-2 px-3 text-[11px] uppercase tracking-[0.08em] text-text-muted">{group.label}</p>
            <div className="space-y-1">
              {group.items.map((item) => {
                const isActive = pathname === item.to
                const Icon = item.icon

                return (
                  <Link
                    key={`${group.label}-${item.label}`}
                    to={item.to}
                    className={`flex h-9 items-center gap-2 rounded px-3 text-sm transition ${
                      isActive
                        ? 'border-l-2 border-accent-blue bg-bg-subtle text-text-primary'
                        : 'border-l-2 border-transparent text-text-secondary hover:bg-bg-subtle hover:text-text-primary'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="flex items-center gap-2 border-t border-border-default px-3 py-3">
        <Avatar name={user?.name ?? 'Devora User'} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-text-primary">{user?.name ?? 'Guest User'}</p>
          <Badge variant="violet">{user?.role ?? 'Admin'}</Badge>
        </div>
        <button
          type="button"
          className="rounded p-1 text-text-secondary hover:bg-bg-subtle hover:text-text-primary"
          aria-label="Settings"
        >
          <Settings className="h-4 w-4" />
        </button>
      </div>
    </aside>
  )
}
