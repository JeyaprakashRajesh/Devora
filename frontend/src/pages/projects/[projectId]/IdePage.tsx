import { XCircle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import CommitPanel from '../../../components/ide/CommitPanel'
import WorkspaceLoader from '../../../components/ide/WorkspaceLoader'
import Button from '../../../components/ui/Button'
import { useProject } from './ProjectLayout'

type IdeState = 'loading' | 'ready' | 'error'

export default function IdePage() {
  const { projectId } = useParams<{ projectId: string }>()
  const { project } = useProject()
  const [ideState, setIdeState] = useState<IdeState>('loading')
  const [ideUrl, setIdeUrl] = useState<string | null>(null)
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [commitNotice, setCommitNotice] = useState('')
  const noticeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (noticeTimeout.current) {
        clearTimeout(noticeTimeout.current)
      }
    }
  }, [])

  if (!projectId) {
    return (
      <div className="h-full w-full bg-bg-base flex items-center justify-center">
        <div className="text-center">
          <XCircle className="w-12 h-12 text-accent-red mx-auto" />
          <p className="mt-3 font-medium text-text-primary">Could not open IDE</p>
          <p className="mt-1 text-sm text-text-muted">Missing project id in route.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full w-full relative bg-bg-base">
      {ideState === 'loading' ? (
        <WorkspaceLoader
          projectId={projectId}
          onReady={(url, id) => {
            console.log('IDE URL:', url)
            setIdeUrl(url)
            setWorkspaceId(id)
            setErrorMessage('')
            setIdeState('ready')
          }}
          onError={(message) => {
            setErrorMessage(message)
            setIdeState('error')
          }}
        />
      ) : null}

      {ideState === 'ready' && ideUrl && ideUrl.startsWith('http') && workspaceId ? (
        <>
          <iframe
            src={ideUrl}
            className="w-full h-full border-0"
            allow="clipboard-read; clipboard-write; cross-origin-isolated"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals"
            title="Devora IDE"
          />
          <CommitPanel
            workspaceId={workspaceId}
            projectId={projectId}
            onCommitSuccess={() => {
              setCommitNotice('Changes committed and pushed.')
              if (noticeTimeout.current) {
                clearTimeout(noticeTimeout.current)
              }
              noticeTimeout.current = setTimeout(() => {
                setCommitNotice('')
              }, 2000)
            }}
          />
          {commitNotice ? (
            <div className="absolute top-3 right-3 z-40 bg-bg-elevated border border-border rounded-md px-3 py-1.5 text-xs text-accent-green">
              {commitNotice}
            </div>
          ) : null}
        </>
      ) : null}

      {ideState === 'error' ? (
        <div className="h-full w-full bg-bg-base flex items-center justify-center">
          <div className="text-center">
            <XCircle className="w-12 h-12 text-accent-red mx-auto" />
            <p className="mt-3 font-medium text-text-primary">Could not open IDE</p>
            <p className="mt-1 text-sm text-text-muted">{errorMessage}</p>
            <Button
              variant="primary"
              className="mt-4"
              onClick={() => {
                setIdeUrl(null)
                setWorkspaceId(null)
                setErrorMessage('')
                setIdeState('loading')
              }}
            >
              Try Again
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
