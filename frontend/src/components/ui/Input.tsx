import type { InputHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  helper?: string
}

export default function Input({ label, error, helper, className = '', ...props }: InputProps) {
  return (
    <div className="flex flex-col gap-1">
      {label ? <label className="text-xs text-text-secondary font-medium">{label}</label> : null}
      <input
        data-error={error ? 'true' : undefined}
        className={[
          'bg-bg-subtle border border-border rounded px-3 py-2 text-text-primary text-sm',
          'placeholder:text-text-muted focus:border-accent-amber focus:ring-2 focus:ring-amber-glow',
          'transition-colors outline-none w-full data-[error=true]:border-accent-red',
          className,
        ].join(' ')}
        {...props}
      />
      {error ? <span className="text-xs text-accent-red">{error}</span> : null}
      {helper ? <span className="text-xs text-text-muted">{helper}</span> : null}
    </div>
  )
}
