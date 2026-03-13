import { forwardRef } from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive'
type ButtonSize = 'sm' | 'md' | 'lg'

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-accent-blue text-text-primary border border-accent-blue hover:opacity-90 disabled:opacity-50',
  secondary:
    'bg-bg-elevated text-text-primary border border-border-default hover:bg-bg-subtle disabled:opacity-50',
  ghost:
    'bg-transparent text-text-secondary border border-transparent hover:bg-bg-subtle hover:text-text-primary disabled:opacity-50',
  destructive:
    'bg-accent-rose text-text-primary border border-accent-rose hover:opacity-90 disabled:opacity-50',
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-9 px-3 text-sm',
  lg: 'h-10 px-4 text-sm',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className = '', variant = 'secondary', size = 'md', type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={`inline-flex items-center justify-center gap-2 rounded font-medium transition ${variantClasses[variant]} ${sizeClasses[size]} ${className}`.trim()}
      {...props}
    />
  )
})
