type CardProps = {
  title?: string
  headerSlot?: React.ReactNode
  children: React.ReactNode
  className?: string
}

export function Card({ title, headerSlot, children, className = '' }: CardProps) {
  return (
    <section className={`rounded border border-border-default bg-bg-surface ${className}`.trim()}>
      {title || headerSlot ? (
        <header className="flex items-center justify-between border-b border-border-default px-4 py-3">
          {title ? <h3 className="text-sm font-semibold text-text-primary">{title}</h3> : <span />}
          {headerSlot}
        </header>
      ) : null}
      <div className="p-4">{children}</div>
    </section>
  )
}
