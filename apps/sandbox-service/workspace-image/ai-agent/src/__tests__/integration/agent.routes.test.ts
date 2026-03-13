import Fastify from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Readable } from 'node:stream'
import { completeRoute } from '../../routes/complete.js'
import { chatRoute } from '../../routes/chat.js'
import { actionRoute } from '../../routes/action.js'
import { ActionService } from '../../services/action.service.js'

let app = Fastify()

beforeEach(async () => {
  app = Fastify()
})

afterEach(async () => {
  await app.close()
})

describe('agent routes', () => {
  it('POST /complete returns completion when model is available', async () => {
    const ollamaClient = {
      isModelAvailable: vi.fn(async () => true),
      generate: vi.fn(async () => 'completion text'),
      chat: vi.fn(),
      listModels: vi.fn(),
    }

    app.post('/complete', completeRoute({
      ollamaClient: ollamaClient as any,
      config: { AUTOCOMPLETE_MODEL: 'qwen' } as any,
    }))

    const res = await app.inject({
      method: 'POST',
      url: '/complete',
      payload: {
        prefix: 'const a = ',
        suffix: '',
        language: 'typescript',
      },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ completion: 'completion text' })
  })

  it('POST /complete returns empty completion when model unavailable', async () => {
    const ollamaClient = {
      isModelAvailable: vi.fn(async () => false),
      generate: vi.fn(),
    }

    app.post('/complete', completeRoute({
      ollamaClient: ollamaClient as any,
      config: { AUTOCOMPLETE_MODEL: 'qwen' } as any,
    }))

    const res = await app.inject({
      method: 'POST',
      url: '/complete',
      payload: { prefix: 'x', suffix: '', language: 'ts' },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ completion: '' })
  })

  it('POST /agent/action read_file returns 400 on validation/path errors', async () => {
    const actionService = {
      readFile: vi.fn(async () => { throw new Error('Path traversal detected') }),
      writeFile: vi.fn(),
      listFiles: vi.fn(),
      runCommand: vi.fn(),
      searchCode: vi.fn(),
    }

    app.post('/agent/action', actionRoute({ actionService: actionService as unknown as ActionService }))

    const res = await app.inject({
      method: 'POST',
      url: '/agent/action',
      payload: {
        action: 'read_file',
        args: { filePath: '../etc/passwd' },
      },
    })

    expect(res.statusCode).toBe(400)
  })

  it('POST /chat streams SSE chunks and done marker', async () => {
    const stream = Readable.from([
      '{"message":{"content":"hello"}}\n',
      '{"done":true}\n',
    ])

    const ollamaClient = {
      chat: vi.fn(async () => stream),
    }

    app.post('/chat', chatRoute({
      ollamaClient: ollamaClient as any,
      config: { CHAT_MODEL: 'deepseek' } as any,
    }))

    const res = await app.inject({
      method: 'POST',
      url: '/chat',
      payload: {
        messages: [{ role: 'user', content: 'hi' }],
        context: { language: 'typescript' },
      },
    })

    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('text/event-stream')
    expect(res.body).toContain('hello')
    expect(res.body).toContain('[DONE]')
  })
})
