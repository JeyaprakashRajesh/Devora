type BadgeVariant = 'default' | 'success' | 'error' | 'warning' | 'info' | 'violet'

type BadgeProps = {
  children: React.ReactNode
  variant?: BadgeVariant
  className?: string
}

const badgeClasses: Record<BadgeVariant, string> = {
  default: 'bg-bg-subtle text-text-secondary border-border-default',
  success: 'bg-accent-emerald-subtle text-accent-emerald border-accent-emerald',
  error: 'bg-accent-rose-subtle text-accent-rose border-accent-rose',
  warning: 'bg-accent-amber-subtle text-accent-amber border-accent-amber',
  info: 'bg-accent-blue-subtle text-accent-blue border-accent-blue',
  violet: 'bg-accent-violet-subtle text-accent-violet border-accent-violet',
}

export function Badge({ children, variant = 'default', className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${badgeClasses[variant]} ${className}`.trim()}
    >
      {children}
    </span>
  )
}
