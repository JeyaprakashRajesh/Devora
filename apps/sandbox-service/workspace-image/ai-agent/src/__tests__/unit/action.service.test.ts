import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ActionService, ValidationError } from '../../services/action.service.js'

let root: string
let service: ActionService

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'devora-agent-'))
  process.env.WORKSPACE_ROOT = root
  service = new ActionService(root)
})

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

describe('ActionService', () => {
  it('writeFile and readFile work within workspace', async () => {
    await service.writeFile('src/a.txt', 'hello')
    const out = await service.readFile('src/a.txt')
    expect(out).toBe('hello')
  })

  it('readFile throws when file does not exist', async () => {
    await expect(service.readFile('missing.txt')).rejects.toThrow('File does not exist')
  })

  it('listFiles skips excluded directories', async () => {
    await fs.mkdir(path.join(root, 'src'), { recursive: true })
    await fs.mkdir(path.join(root, 'node_modules/pkg'), { recursive: true })
    await fs.writeFile(path.join(root, 'src', 'a.ts'), 'x')
    await fs.writeFile(path.join(root, 'node_modules', 'pkg', 'b.ts'), 'y')

    const files = await service.listFiles('.', 3)
    expect(files).toContain(path.join('src', 'a.ts'))
    expect(files.join('\n')).not.toContain('node_modules')
  })

  it('runCommand rejects non-allowlisted commands', async () => {
    await expect(service.runCommand('curl', ['http://example.com'])).rejects.toBeInstanceOf(ValidationError)
  })

  it('runCommand executes allowlisted command', async () => {
    const result = await service.runCommand('node', ['-e', 'process.stdout.write("ok")'])
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toBe('ok')
  })

  it('searchCode finds matching lines', async () => {
    await fs.mkdir(path.join(root, 'src'), { recursive: true })
    await fs.writeFile(path.join(root, 'src', 'main.ts'), 'const token = 42\n')

    vi.spyOn(service, 'runCommand').mockResolvedValue({
      stdout: '{"type":"match","data":{"path":{"text":"' + path.join(root, 'src', 'main.ts').replace(/\\/g, '\\\\') + '"},"line_number":1,"lines":{"text":"const token = 42"}}}\n',
      stderr: '',
      exitCode: 0,
    })

    const matches = await service.searchCode('token')
    expect(matches.length).toBeGreaterThan(0)
    expect(matches[0].file).toContain(path.join('src', 'main.ts'))
  })
})
