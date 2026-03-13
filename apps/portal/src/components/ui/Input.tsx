import { forwardRef } from 'react'

type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> & {
  label?: string
  error?: string
  helperText?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, helperText, className = '', id, ...props },
  ref,
) {
  const inputId = id ?? props.name

  return (
    <div className="flex w-full flex-col gap-1.5">
      {label ? (
        <label htmlFor={inputId} className="text-xs font-medium text-text-secondary">
          {label}
        </label>
      ) : null}
      <input
        ref={ref}
        id={inputId}
        className={`h-9 w-full rounded border bg-bg-subtle px-3 text-sm text-text-primary outline-none transition placeholder:text-text-muted focus:border-border-strong ${
          error ? 'border-accent-rose' : 'border-border-default'
        } ${className}`.trim()}
        {...props}
      />
      {error ? <p className="text-xs text-accent-rose">{error}</p> : null}
      {!error && helperText ? <p className="text-xs text-text-muted">{helperText}</p> : null}
    </div>
  )
})
