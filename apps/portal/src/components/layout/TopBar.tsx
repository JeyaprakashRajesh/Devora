import { Bell, Menu } from 'lucide-react'
import { useRouterState } from '@tanstack/react-router'
import { Avatar } from '../ui/Avatar'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { ThemeToggle } from './ThemeToggle'
import { useAuthStore } from '../../store/auth.store'

const routeLabelMap: Record<string, string> = {
  '/dashboard': 'Overview',
  '/ide': 'IDE',
  '/sandboxes': 'Sandboxes',
  '/projects': 'Projects',
  '/issues': 'Issues',
  '/board': 'Board',
  '/chat': 'Chat',
  '/prs': 'Pull Requests',
  '/deployments': 'Deployments',
  '/targets': 'Targets',
  '/dashboards': 'Dashboards',
  '/alerts': 'Alerts',
  '/login': 'Sign In',
  '/register': 'Register',
}

export function TopBar() {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const user = useAuthStore((state) => state.user)

  return (
    <header className="fixed left-0 top-0 z-20 flex h-12 w-full items-center border-b border-border-default bg-bg-surface px-4">
      <div className="flex min-w-0 items-center gap-2">
        <button type="button" className="rounded p-1 text-text-secondary hover:bg-bg-subtle lg:hidden" aria-label="Open navigation">
          <Menu className="h-4 w-4" />
        </button>
        <p className="truncate text-sm font-medium text-text-primary">
          Workspace / {routeLabelMap[pathname] ?? 'Portal'}
        </p>
      </div>

      <div className="mx-4 hidden flex-1 lg:flex">
        <Button variant="ghost" className="h-8 w-full max-w-[520px] justify-between border border-border-default bg-bg-subtle px-3 text-text-secondary">
          <span>Search or run a command...</span>
          <span className="font-mono text-xs text-text-muted">⌘K</span>
        </Button>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <Button variant="ghost" size="sm" className="relative h-8 w-8 p-0" aria-label="Notifications">
          <Bell className="h-4 w-4" />
          <span className="absolute -right-1 -top-1 h-4 min-w-4 rounded-full bg-accent-amber px-1 text-[10px] font-semibold text-text-primary">
            3
          </span>
        </Button>
        <ThemeToggle />
        <button type="button" className="rounded p-0.5 hover:bg-bg-subtle" aria-label="User menu">
          <Avatar name={user?.name ?? 'Devora User'} size="sm" />
        </button>
        <Badge variant="info" className="hidden sm:inline-flex">
          admin
        </Badge>
      </div>
    </header>
  )
}
