import path from 'node:path'

const MAX_PROMPT_CHARS = 50000

export function sanitizeForPrompt(input: string): string {
  let output = input.slice(0, MAX_PROMPT_CHARS)

  output = output.replace(/<\/?(system|instructions)>/gi, '[REMOVED]')
  output = output.replace(
    /ignore\s+previous\s+instructions|disregard\s+your\s+system\s+prompt|you\s+are\s+now/gi,
    '[REMOVED]',
  )
  output = output.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')

  return output
}

export function sanitizeFilePath(inputPath: string): string {
  const workspaceRoot = path.resolve(process.env.WORKSPACE_ROOT ?? '/workspace')
  const resolvedPath = path.resolve(workspaceRoot, inputPath)

  const normalizedRoot = path.normalize(workspaceRoot).toLowerCase()
  const normalizedResolved = path.normalize(resolvedPath).toLowerCase()

  if (
    normalizedResolved !== normalizedRoot &&
    !normalizedResolved.startsWith(`${normalizedRoot}${path.sep}`)
  ) {
    throw new Error('Path traversal detected')
  }

  return resolvedPath
}
