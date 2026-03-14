import type { ReactNode } from 'react'

type BadgeVariant = 'success' | 'error' | 'warning' | 'info' | 'default'
type BadgeSize = 'sm' | 'md'

interface BadgeProps {
  variant?: BadgeVariant
  size?: BadgeSize
  children: ReactNode
}

const variantClasses: Record<BadgeVariant, string> = {
  success: 'bg-[var(--accent-green-subtle)] text-accent-green border border-accent-green/20',
  error: 'bg-[var(--accent-red-subtle)] text-accent-red border border-accent-red/20',
  warning: 'bg-amber-subtle text-accent-amber border border-accent-amber/20',
  info: 'bg-[var(--accent-blue-subtle)] text-accent-blue border border-accent-blue/20',
  default: 'bg-bg-subtle text-text-secondary border border-border',
}

const sizeClasses: Record<BadgeSize, string> = {
  sm: 'text-xs px-1.5 py-0.5 rounded',
  md: 'text-xs px-2 py-1 rounded',
}

export default function Badge({ variant = 'default', size = 'md', children }: BadgeProps) {
  return <span className={`${variantClasses[variant]} ${sizeClasses[size]} inline-flex items-center`}>{children}</span>
}
