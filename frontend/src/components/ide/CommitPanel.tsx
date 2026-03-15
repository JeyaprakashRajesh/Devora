import { isAxiosError } from 'axios'
import { GitCommit, X } from 'lucide-react'
import { useState } from 'react'
import Button from '../ui/Button'
import { api } from '../../lib/api'

interface CommitPanelProps {
  workspaceId: string
  projectId: string
  onCommitSuccess: () => void
}

function getErrorMessage(error: unknown): string {
  if (isAxiosError(error)) {
    const body = error.response?.data as { error?: string; message?: string } | undefined
    return body?.error ?? body?.message ?? error.message
  }

  if (error instanceof Error && error.message) {
    return error.message
  }

  return 'Commit failed. Please try again.'
}

export default function CommitPanel({ workspaceId, projectId, onCommitSuccess }: CommitPanelProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  const handleCommit = async () => {
    const trimmed = message.trim()
    if (!trimmed) {
      setResult('error: Commit message is required.')
      return
    }

    setLoading(true)
    setResult(null)

    try {
      await api.post(`/workspaces/${workspaceId}/commit`, { message: trimmed, project_id: projectId })
      setResult('success')
      setMessage('')

      setTimeout(() => {
        setResult(null)
        setIsOpen(false)
        onCommitSuccess()
      }, 2000)
    } catch (error) {
      setResult(`error: ${getErrorMessage(error)}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2 bg-accent-violet text-bg-base rounded-lg shadow-lg hover:brightness-110 transition"
      >
        <GitCommit className="w-4 h-4" />
        Commit & Push
      </button>

      {isOpen ? (
        <div className="fixed bottom-20 right-6 z-50 w-80 bg-bg-elevated border border-border rounded-xl shadow-2xl p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-text-primary">Commit Changes</h3>
            <button
              type="button"
              onClick={() => {
                setIsOpen(false)
                setResult(null)
              }}
              className="text-text-muted hover:text-text-primary transition-colors"
              aria-label="Close commit panel"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="mt-3">
            <label htmlFor="commit-message" className="block text-xs text-text-secondary mb-1">
              Commit message
            </label>
            <textarea
              id="commit-message"
              placeholder="Describe your changes..."
              rows={3}
              value={message}
              autoFocus
              onChange={(event) => setMessage(event.target.value)}
              className="w-full bg-bg-surface border border-border rounded-md px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-violet"
            />
          </div>

          <div className="mt-3 flex items-center gap-2">
            <Button variant="primary" size="sm" loading={loading} onClick={() => void handleCommit()}>
              Push
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setIsOpen(false)
                setResult(null)
              }}
            >
              Cancel
            </Button>
          </div>

          {result === 'success' ? (
            <p className="text-accent-green text-xs mt-2">✓ Pushed successfully</p>
          ) : null}

          {result?.startsWith('error:') ? (
            <p className="text-accent-red text-xs mt-2">{result.replace('error: ', '')}</p>
          ) : null}
        </div>
      ) : null}
    </>
  )
}
