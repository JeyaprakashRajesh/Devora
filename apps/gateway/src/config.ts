import { z } from 'zod'
import dotenv from 'dotenv'

dotenv.config()

const isTest = process.env.NODE_ENV === 'test'

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  JWT_SECRET: z.string().min(32).default(isTest ? 'test_secret_at_least_32_characters_long' : undefined as any),
  AUTH_SERVICE_URL: z.string().url().default(isTest ? 'http://localhost:4001' : undefined as any),
  PROJECT_SERVICE_URL: z.string().url().default(isTest ? 'http://localhost:4002' : undefined as any),
  CHAT_SERVICE_URL: z.string().url().default(isTest ? 'http://localhost:4003' : undefined as any),
  DEPLOY_SERVICE_URL: z.string().url().default(isTest ? 'http://localhost:4004' : undefined as any),
  MONITOR_SERVICE_URL: z.string().url().default(isTest ? 'http://localhost:4005' : undefined as any),
  SANDBOX_SERVICE_URL: z.string().url().default(isTest ? 'http://localhost:4006' : undefined as any),
  NOTIFY_SERVICE_URL: z.string().url().default(isTest ? 'http://localhost:4007' : undefined as any),
})

export const config = schema.parse(process.env)
export type Config = typeof config
