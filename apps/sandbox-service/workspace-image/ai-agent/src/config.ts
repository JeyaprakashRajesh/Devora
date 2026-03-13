import { z } from 'zod'

const schema = z.object({
  PORT: z.coerce.number().default(9090),
  HOST: z.string().default('127.0.0.1'),
  OLLAMA_URL: z.string().url().default('http://localhost:11434'),
  AUTOCOMPLETE_MODEL: z.string().default('qwen2.5-coder:1.5b'),
  CHAT_MODEL: z.string().default('deepseek-coder-v2'),
  PLATFORM_API_URL: z.string().url().default('http://localhost:4000'),
  DEVORA_USER_ID: z.string().min(1),
  DEVORA_ORG_ID: z.string().min(1),
  DEVORA_WORKSPACE_ID: z.string().min(1),
  WORKSPACE_ROOT: z.string().default('/workspace'),
  MAX_FILE_SIZE_KB: z.coerce.number().int().positive().default(500),
})

export const config = schema.parse(process.env)
export type Config = typeof config
