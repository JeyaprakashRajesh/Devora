import { describe, expect, it, vi, beforeEach } from 'vitest'
import axios from 'axios'
import { Readable } from 'node:stream'
import { OllamaClient, OllamaError } from '../../services/ollama.client.js'

const postMock = vi.fn()
const getMock = vi.fn()

vi.mock('axios', () => {
  return {
    default: {
      create: vi.fn(() => ({
        post: postMock,
        get: getMock,
      })),
      isAxiosError: (err: unknown) => Boolean((err as any)?.isAxiosError),
    },
  }
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('OllamaClient', () => {
  it('generate returns response text', async () => {
    postMock.mockResolvedValue({ data: { response: 'hello' } })
    const client = new OllamaClient('http://localhost:11434')

    const out = await client.generate({ model: 'm', prompt: 'p', stream: false })
    expect(out).toBe('hello')
  })

  it('generate throws OllamaError on axios error', async () => {
    postMock.mockRejectedValue({ isAxiosError: true, message: 'boom', response: { data: { error: 'failed' } } })
    const client = new OllamaClient('http://localhost:11434')

    await expect(client.generate({ model: 'm', prompt: 'p', stream: false })).rejects.toBeInstanceOf(OllamaError)
  })

  it('chat returns stream', async () => {
    const stream = Readable.from(['hello'])
    postMock.mockResolvedValue({ data: stream })
    const client = new OllamaClient('http://localhost:11434')

    const out = await client.chat({ model: 'm', messages: [{ role: 'user', content: 'hi' }], stream: true })
    expect(out).toBe(stream)
  })

  it('listModels returns names', async () => {
    getMock.mockResolvedValue({ data: { models: [{ name: 'a' }, { name: 'b' }, {}] } })
    const client = new OllamaClient('http://localhost:11434')

    const models = await client.listModels()
    expect(models).toEqual(['a', 'b'])
  })

  it('isModelAvailable returns false when listModels fails', async () => {
    getMock.mockRejectedValue(new Error('network down'))
    const client = new OllamaClient('http://localhost:11434')

    const exists = await client.isModelAvailable('any')
    expect(exists).toBe(false)
  })
})
