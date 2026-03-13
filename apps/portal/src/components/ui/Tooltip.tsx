import { useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'

type TooltipProps = {
  content: ReactNode
  children: ReactNode
}

export function Tooltip({ content, children }: TooltipProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [position, setPosition] = useState({ x: 0, y: 0 })

  const updatePosition = (event: React.MouseEvent<HTMLSpanElement>) => {
    setPosition({ x: event.clientX, y: event.clientY })
  }

  return (
    <span
      className="inline-flex"
      onMouseEnter={(event) => {
        setIsOpen(true)
        updatePosition(event)
      }}
      onMouseMove={updatePosition}
      onMouseLeave={() => setIsOpen(false)}
    >
      {children}
      {isOpen
        ? createPortal(
            <div
              className="pointer-events-none fixed z-50 -translate-x-1/2 rounded border border-border-default bg-bg-elevated px-2 py-1 text-xs text-text-secondary"
              style={{ left: position.x, top: position.y - 32 }}
            >
              {content}
            </div>,
            document.body,
          )
        : null}
    </span>
  )
}
