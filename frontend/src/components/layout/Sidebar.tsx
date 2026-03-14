import {
  FolderGit2,
  LayoutDashboard,
  LogOut,
  Rocket,
  Shield,
  Users2,
  UsersRound,
} from 'lucide-react'
import type { ComponentType } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import { useAuthStore } from '../../store/auth'
import Avatar from '../ui/Avatar'
import Button from '../ui/Button'
import Badge from '../ui/Badge'

type NavItem = {
  label: string
  path?: string
  icon: ComponentType<{ className?: string }>
  disabled?: boolean
}

type NavGroup = {
  title: string
  items: NavItem[]
}

const navGroups: NavGroup[] = [
  {
    title: 'GENERAL',
    items: [{ label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard }],
  },
  {
    title: 'ACCESS',
    items: [
      { label: 'Users', path: '/admin/users', icon: Users2 },
      { label: 'Roles', path: '/admin/roles', icon: Shield },
      { label: 'Groups', path: '/admin/groups', icon: UsersRound },
    ],
  },
  {
    title: 'PROJECTS',
    items: [{ label: 'Projects', icon: FolderGit2, disabled: true }],
  },
  {
    title: 'DEPLOY',
    items: [{ label: 'Deployments', icon: Rocket, disabled: true }],
  },
]

export default function Sidebar() {
  const navigate = useNavigate()

  const user = useAuthStore((s) => s.user)
  const org = useAuthStore((s) => s.org)
  const clearAuth = useAuthStore((s) => s.clearAuth)

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout')
    } catch {
      // Client state should still be cleared even if logout request fails.
    } finally {
      clearAuth()
      navigate('/login', { replace: true })
    }
  }

  return (
    <aside className="w-[220px] h-screen bg-bg-surface border-r border-border flex flex-col">
      <div className="px-4 py-4">
        <p className="font-bold text-text-primary text-base tracking-tight">devora</p>
        <p className="text-xs text-text-muted truncate mt-1">{org?.name ?? 'No organization'}</p>
      </div>

      <nav className="flex-1 px-2 py-2 overflow-y-auto">
        {navGroups.map((group, groupIndex) => (
          <div key={group.title} className={groupIndex === 0 ? '' : 'mt-3'}>
            <p className="text-[10px] uppercase tracking-widest text-text-muted px-2 py-1 mb-1">
              {group.title}
            </p>

            <div className="flex flex-col gap-1">
              {group.items.map((item) => {
                const Icon = item.icon
                const isDisabled = Boolean(item.disabled || !item.path)

                return (
                  <div key={item.label}>
                    {isDisabled ? (
                      <div className="h-[36px] flex items-center gap-2.5 px-3 rounded text-sm text-text-muted opacity-40 cursor-not-allowed">
                        <Icon className="w-4 h-4 shrink-0" />
                        <span>{item.label}</span>
                        <span className="ml-auto text-[10px] text-text-muted bg-bg-elevated px-1.5 py-0.5 rounded">
                          Soon
                        </span>
                      </div>
                    ) : (
                      <NavLink
                        to={item.path as string}
                        className={({ isActive }) =>
                          [
                            'h-[36px] flex items-center gap-2.5 px-3 rounded text-sm transition-colors',
                            isActive
                              ? 'bg-bg-subtle text-text-primary -ml-[1px] border-l-2 border-accent-amber'
                              : 'text-text-secondary hover:bg-bg-subtle hover:text-text-primary',
                          ].join(' ')
                        }
                      >
                        <Icon className="w-4 h-4 shrink-0" />
                        <span>{item.label}</span>
                      </NavLink>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="px-3 py-3 border-t border-border">
        <div className="flex items-center gap-2 mb-3">
          <Avatar size="md" name={user?.display_name ?? user?.username ?? 'User'} />
          <div className="min-w-0">
            <p className="text-sm text-text-primary truncate">{user?.display_name ?? user?.username ?? 'User'}</p>
            <Badge variant="default" size="sm">
              {user?.is_org_owner ? 'org_admin' : 'member'}
            </Badge>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2"
          onClick={handleLogout}
        >
          <LogOut className="w-4 h-4" />
          Logout
        </Button>
      </div>
    </aside>
  )
}
