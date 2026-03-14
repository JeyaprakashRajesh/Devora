import type { ImgHTMLAttributes } from 'react'

type AvatarSize = 'sm' | 'md' | 'lg'

interface AvatarProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'size'> {
  name: string
  size?: AvatarSize
}

const sizeClasses: Record<AvatarSize, string> = {
  sm: 'w-6 h-6 text-xs',
  md: 'w-8 h-8 text-sm',
  lg: 'w-10 h-10 text-base',
}

const bgPalette = ['bg-accent-amber', 'bg-accent-blue', 'bg-accent-green', 'bg-accent-violet', 'bg-accent-cyan']

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}

export default function Avatar({ name, size = 'md', src, alt, className = '', ...props }: AvatarProps) {
  if (src) {
    return (
      <img
        src={src}
        alt={alt ?? `${name} avatar`}
        className={`${sizeClasses[size]} rounded-full object-cover border border-border ${className}`}
        {...props}
      />
    )
  }

  const index = name.charCodeAt(0) % bgPalette.length
  const bgClass = bgPalette[index]

  return (
    <div
      className={`${sizeClasses[size]} ${bgClass} rounded-full border border-border flex items-center justify-center font-medium text-bg-base ${className}`}
      aria-label={name}
      title={name}
    >
      {getInitials(name)}
    </div>
  )
}
