type DividerProps = {
  className?: string
}

export function Divider({ className = '' }: DividerProps) {
  return <hr className={`my-3 border-0 border-t border-border-default ${className}`.trim()} />
}
