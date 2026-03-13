import { useEffect, useRef, useState } from 'react'
import { Spinner } from '../../components/ui/Spinner'
import { useWorkspaceActions } from '../../hooks/useWorkspace'

type IdeFrameProps = {
  proxyUrl: string
}

export function IdeFrame({ proxyUrl }: IdeFrameProps) {
  const { restartWorkspace } = useWorkspaceActions()
  const reconnectTimeoutRef = useRef<number | null>(null)
  const [isFrameLoading, setIsFrameLoading] = useState(true)
  const [isReconnecting, setIsReconnecting] = useState(false)

  useEffect(() => {
    setIsFrameLoading(true)
  }, [proxyUrl])

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (
        typeof event.data === 'object'
        && event.data !== null
        && 'type' in event.data
        && event.data.type === 'devora:connection-lost'
      ) {
        setIsReconnecting(true)

        if (reconnectTimeoutRef.current !== null) {
          window.clearTimeout(reconnectTimeoutRef.current)
        }

        reconnectTimeoutRef.current = window.setTimeout(() => {
          void restartWorkspace()
        }, 3_000)
      }
    }

    window.addEventListener('message', handleMessage)

    return () => {
      window.removeEventListener('message', handleMessage)

      if (reconnectTimeoutRef.current !== null) {
        window.clearTimeout(reconnectTimeoutRef.current)
      }
    }
  }, [restartWorkspace])

  return (
    <div className="relative h-full w-full bg-bg-base">
      {isReconnecting ? (
        <div className="absolute inset-x-0 top-0 z-20 flex h-10 items-center justify-center border-b border-border-default bg-bg-elevated/95 text-sm text-text-secondary backdrop-blur-sm">
          Connection to workspace lost. Reconnecting...
        </div>
      ) : null}

      {isFrameLoading ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-bg-base/80 backdrop-blur-[1px]">
          <div className="flex items-center gap-3 rounded-full border border-border-default bg-bg-surface px-4 py-2 text-sm text-text-secondary">
            <Spinner size="sm" />
            Loading Devora IDE
          </div>
        </div>
      ) : null}

      <iframe
        src={proxyUrl}
        title="Devora IDE"
        allow="clipboard-read; clipboard-write"
        className="block h-full w-full border-0"
        onLoad={() => {
          setIsFrameLoading(false)
          setIsReconnecting(false)
        }}
      />
    </div>
  )
}