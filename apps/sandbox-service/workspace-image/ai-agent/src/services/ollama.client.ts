import axios, { AxiosError, type AxiosInstance } from 'axios'

export interface GenerateOpts {
  model: string
  prompt: string
  stream: false
}

export interface OllamaMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatOpts {
  model: string
  messages: OllamaMessage[]
  stream: true
}

interface OllamaGenerateResponse {
  response: string
}

interface OllamaTagResponse {
  models?: Array<{ name?: string }>
}

export class OllamaError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OllamaError'
  }
}

export class OllamaClient {
  private readonly http: AxiosInstance

  constructor(private readonly ollamaUrl: string) {
    this.http = axios.create({
      baseURL: this.ollamaUrl,
      timeout: 30000,
    })
  }

  async generate(opts: GenerateOpts): Promise<string> {
    try {
      const response = await this.http.post<OllamaGenerateResponse>(
        '/api/generate',
        opts,
        { timeout: 30000 },
      )
      return response.data.response ?? ''
    } catch (error) {
      throw new OllamaError(this.formatError(error))
    }
  }

  async chat(opts: ChatOpts): Promise<NodeJS.ReadableStream> {
    try {
      const response = await this.http.post('/api/chat', opts, {
        timeout: 60000,
        responseType: 'stream',
      })
      return response.data as NodeJS.ReadableStream
    } catch (error) {
      throw new OllamaError(this.formatError(error))
    }
  }

  async listModels(): Promise<string[]> {
    try {
      const response = await this.http.get<OllamaTagResponse>('/api/tags', {
        timeout: 10000,
      })
      return (response.data.models ?? [])
        .map((model) => model.name)
        .filter((name): name is string => Boolean(name))
    } catch (error) {
      throw new OllamaError(this.formatError(error))
    }
  }

  async isModelAvailable(model: string): Promise<boolean> {
    try {
      const models = await this.listModels()
      return models.includes(model)
    } catch {
      return false
    }
  }

  private formatError(error: unknown): string {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<{ error?: string }>
      return (
        axiosError.response?.data?.error ??
        axiosError.message ??
        'Failed to reach Ollama'
      )
    }

    if (error instanceof Error) {
      return error.message
    }

    return 'Unknown Ollama error'
  }
}
