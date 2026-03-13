import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { sanitizeFilePath, sanitizeForPrompt } from '../lib/sanitize.js'

const EXCLUDED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '__pycache__'])
const ALLOWED_COMMANDS = new Set([
  'npm',
  'npx',
  'node',
  'python3',
  'pip3',
  'git',
  'cargo',
  'rustc',
  'ls',
  'cat',
  'echo',
  'pwd',
  'mkdir',
  'touch',
  'rm',
  'grep',
  'find',
  'rg',
  'fd',
])

export interface CommandResult {
  stdout: string
  stderr: string
  exitCode: number
}

export interface SearchResult {
  file: string
  line: number
  content: string
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

export class CommandTimeoutError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CommandTimeoutError'
  }
}

export class ActionService {
  private readonly maxFileSizeBytes: number

  constructor(private readonly workspaceRoot: string) {
    const maxFileKb = Number.parseInt(process.env.MAX_FILE_SIZE_KB ?? '500', 10)
    this.maxFileSizeBytes = maxFileKb * 1024
  }

  async readFile(filePath: string): Promise<string> {
    const resolvedPath = sanitizeFilePath(filePath)

    const stat = await fs.stat(resolvedPath).catch(() => {
      throw new Error(`File does not exist: ${filePath}`)
    })

    if (stat.size > this.maxFileSizeBytes) {
      throw new Error(`File exceeds ${this.maxFileSizeBytes / 1024}KB limit`)
    }

    return fs.readFile(resolvedPath, 'utf-8')
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    const resolvedPath = sanitizeFilePath(filePath)
    await fs.mkdir(path.dirname(resolvedPath), { recursive: true })
    await fs.writeFile(resolvedPath, content, 'utf-8')
    console.log(`Agent wrote file: ${filePath}`)
  }

  async listFiles(dirPath: string, depth: number = 2): Promise<string[]> {
    const resolvedDir = sanitizeFilePath(dirPath)
    const output: string[] = []

    const walk = async (currentPath: string, currentDepth: number): Promise<void> => {
      if (currentDepth > depth) {
        return
      }

      const entries = await fs.readdir(currentPath, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isDirectory() && EXCLUDED_DIRS.has(entry.name)) {
          continue
        }

        const absolutePath = path.join(currentPath, entry.name)
        if (entry.isDirectory()) {
          await walk(absolutePath, currentDepth + 1)
        } else {
          output.push(path.relative(this.workspaceRoot, absolutePath))
        }
      }
    }

    await walk(resolvedDir, 0)
    return output
  }

  async runCommand(command: string, args: string[]): Promise<CommandResult> {
    if (!ALLOWED_COMMANDS.has(command)) {
      throw new ValidationError(`Command '${command}' is not allowed`)
    }

    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: this.workspaceRoot,
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      let stdout = ''
      let stderr = ''
      let timedOut = false

      const timeout = setTimeout(() => {
        timedOut = true
        child.kill('SIGKILL')
      }, 30000)

      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString()
      })

      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString()
      })

      child.on('error', (error) => {
        clearTimeout(timeout)
        reject(error)
      })

      child.on('close', (code) => {
        clearTimeout(timeout)

        if (timedOut) {
          reject(new CommandTimeoutError('Command execution timed out'))
          return
        }

        resolve({
          stdout,
          stderr,
          exitCode: code ?? 1,
        })
      })
    })
  }

  async searchCode(query: string, filePattern?: string): Promise<SearchResult[]> {
    const safeQuery = sanitizeForPrompt(query).slice(0, 200)
    const args = ['--json', safeQuery]

    if (filePattern) {
      args.push('--glob', filePattern)
    } else {
      args.push('--glob', '*')
    }

    args.push(this.workspaceRoot)

    const result = await this.runCommand('rg', args)
    const lines = result.stdout.split(/\r?\n/)
    const matches: SearchResult[] = []

    for (const line of lines) {
      if (!line) {
        continue
      }

      let parsed: unknown
      try {
        parsed = JSON.parse(line)
      } catch {
        continue
      }

      const item = parsed as {
        type?: string
        data?: {
          path?: { text?: string }
          line_number?: number
          lines?: { text?: string }
        }
      }

      if (item.type !== 'match') {
        continue
      }

      matches.push({
        file: path.relative(this.workspaceRoot, item.data?.path?.text ?? ''),
        line: item.data?.line_number ?? 0,
        content: item.data?.lines?.text?.trim() ?? '',
      })

      if (matches.length >= 50) {
        break
      }
    }

    return matches
  }
}
