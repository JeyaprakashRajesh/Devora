interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg'
}

const sizeClasses: Record<NonNullable<SpinnerProps['size']>, string> = {
  sm: 'w-3 h-3 border-2',
  md: 'w-5 h-5 border-2',
  lg: 'w-8 h-8 border-2',
}

export default function Spinner({ size = 'md' }: SpinnerProps) {
  return (
    <span
      className={`${sizeClasses[size]} inline-block border-accent-amber border-t-transparent rounded-full animate-spin`}
      aria-hidden="true"
    />
  )
}
