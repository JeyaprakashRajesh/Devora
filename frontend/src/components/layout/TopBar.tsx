import { useLocation } from 'react-router-dom'
import { useAuthStore } from '../../store/auth'
import Avatar from '../ui/Avatar'
import ThemeToggle from './ThemeToggle'

const pageNames: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/admin/users': 'Users',
  '/admin/users/invite': 'Invite User',
  '/admin/roles': 'Roles',
  '/admin/roles/new': 'Create Role',
  '/admin/groups': 'Groups',
}

export default function TopBar() {
  const location = useLocation()
  const user = useAuthStore((s) => s.user)

  let breadcrumb = pageNames[location.pathname]
  if (!breadcrumb && location.pathname.startsWith('/admin/users/')) {
    breadcrumb = 'User Detail'
  }
  if (!breadcrumb && location.pathname.startsWith('/admin/roles/')) {
    breadcrumb = 'Role Detail'
  }
  if (!breadcrumb && location.pathname.startsWith('/admin/groups/')) {
    breadcrumb = 'Group Detail'
  }
  if (!breadcrumb && location.pathname.startsWith('/dashboard')) {
    breadcrumb = 'Dashboard'
  }
  if (!breadcrumb) {
    breadcrumb = 'Workspace'
  }

  return (
    <header className="h-[48px] bg-bg-surface border-b border-border flex items-center justify-between px-4">
      <p className="text-sm font-medium text-text-primary">{breadcrumb}</p>
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <Avatar
          size="sm"
          name={user?.display_name ?? user?.username ?? 'User'}
          aria-label="Current user"
        />
      </div>
    </header>
  )
}
