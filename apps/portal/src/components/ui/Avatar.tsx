type AvatarSize = 'sm' | 'md' | 'lg'

type AvatarProps = {
  name: string
  src?: string
  size?: AvatarSize
}

const sizeClasses: Record<AvatarSize, string> = {
  sm: 'h-7 w-7 text-[10px]',
  md: 'h-8 w-8 text-xs',
  lg: 'h-10 w-10 text-sm',
}

const getInitials = (name: string): string => {
  const parts = name.trim().split(' ').filter(Boolean)
  return parts.slice(0, 2).map((item) => item[0]?.toUpperCase() ?? '').join('')
}

export function Avatar({ name, src, size = 'md' }: AvatarProps) {
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className={`rounded-full border border-border-default object-cover ${sizeClasses[size]}`}
      />
    )
  }

  return (
    <span
      aria-label={name}
      className={`inline-flex items-center justify-center rounded-full border border-border-default bg-bg-subtle font-medium text-text-secondary ${sizeClasses[size]}`}
    >
      {getInitials(name)}
    </span>
  )
}
