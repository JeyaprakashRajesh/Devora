import { sanitizeForPrompt } from './sanitize.js'

export interface AgentContext {
  filePath?: string
  language?: string
  projectName?: string
  recentFiles?: string[]
}

export function buildSystemPrompt(context: AgentContext): string {
  const lines: string[] = [
    'You are an expert software engineer and coding assistant.',
    '',
    'Workspace context:',
    `- Current file: ${context.filePath ?? 'unknown'}`,
    `- Language: ${context.language ?? 'unknown'}`,
    `- Project: ${context.projectName ?? 'unknown'}`,
    '',
    'Constraints:',
    '- You can only read and write files within /workspace',
    '- You cannot make network requests outside the platform',
    '- All file operations must use the provided tools',
  ]

  if (context.recentFiles && context.recentFiles.length > 0) {
    lines.push('')
    lines.push('Recent files:')
    for (const file of context.recentFiles.slice(0, 20)) {
      lines.push(`- ${file}`)
    }
  }

  lines.push('')
  lines.push('Respond concisely. For code changes, show only the changed sections.')

  return sanitizeForPrompt(lines.join('\n'))
}

export function buildFimPrompt(
  prefix: string,
  suffix: string,
  language: string,
): string {
  const safePrefix = sanitizeForPrompt(prefix)
  const safeSuffix = sanitizeForPrompt(suffix)
  const safeLanguage = sanitizeForPrompt(language)

  return `<fim_prefix># language: ${safeLanguage}\n${safePrefix}<fim_suffix>${safeSuffix}<fim_middle>`
}
