import type { ReactNode } from 'react'

type CardPadding = 'none' | 'sm' | 'md'

interface CardProps {
  children: ReactNode
  header?: ReactNode
  className?: string
  padding?: CardPadding
}

const paddingClasses: Record<CardPadding, string> = {
  none: 'p-0',
  sm: 'p-3',
  md: 'p-4',
}

export default function Card({ children, header, className = '', padding = 'md' }: CardProps) {
  return (
    <div className={`bg-bg-surface border border-border rounded-lg overflow-hidden ${className}`}>
      {header ? (
        <div className="px-4 py-3 border-b border-border text-sm font-medium text-text-primary">{header}</div>
      ) : null}
      <div className={paddingClasses[padding]}>{children}</div>
    </div>
  )
}
