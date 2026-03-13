import fs from 'node:fs/promises'
import path from 'node:path'
import { ActionService } from './action.service.js'

export interface ContextResult {
  currentFile: {
    path: string
    content: string
    language: string
  }
  nearbyFiles: string[]
  projectMeta: Record<string, unknown> | null
}

const EXT_TO_LANG: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.py': 'python',
  '.rs': 'rust',
  '.go': 'go',
  '.java': 'java',
  '.json': 'json',
  '.md': 'markdown',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.sh': 'bash',
}

export class ContextService {
  constructor(
    private readonly workspaceRoot: string,
    private readonly actionService: ActionService,
  ) {}

  async build(filePath: string): Promise<ContextResult> {
    const content = await this.actionService.readFile(filePath)
    const directory = path.dirname(filePath)
    const nearbyFiles = await this.actionService.listFiles(directory, 1)
    const projectMeta = await this.readProjectMeta()

    return {
      currentFile: {
        path: filePath,
        content,
        language: this.inferLanguage(filePath),
      },
      nearbyFiles,
      projectMeta,
    }
  }

  private inferLanguage(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase()
    return EXT_TO_LANG[ext] ?? 'plaintext'
  }

  private async readProjectMeta(): Promise<Record<string, unknown> | null> {
    const packagePath = path.join(this.workspaceRoot, 'package.json')
    try {
      const packageContent = await fs.readFile(packagePath, 'utf-8')
      return JSON.parse(packageContent) as Record<string, unknown>
    } catch {
      // fallback to Cargo.toml below
    }

    const cargoPath = path.join(this.workspaceRoot, 'Cargo.toml')
    try {
      const cargoContent = await fs.readFile(cargoPath, 'utf-8')
      const projectNameMatch = cargoContent.match(/^name\s*=\s*"([^"]+)"/m)
      const versionMatch = cargoContent.match(/^version\s*=\s*"([^"]+)"/m)
      const editionMatch = cargoContent.match(/^edition\s*=\s*"([^"]+)"/m)

      return {
        name: projectNameMatch?.[1] ?? null,
        version: versionMatch?.[1] ?? null,
        edition: editionMatch?.[1] ?? null,
      }
    } catch {
      return null
    }
  }
}
