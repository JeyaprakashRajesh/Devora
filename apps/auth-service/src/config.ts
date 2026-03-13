import { z } from 'zod'

const schema = z.object({
  NODE_ENV:       z.enum(['development', 'production', 'test']).default('development'),
  PORT:           z.coerce.number().default(4001),
  DATABASE_URL:   z.string().url(),
  REDIS_URL:      z.string(),
  NATS_URL:       z.string(),
  JWT_SECRET:     z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('24h'),
})

export const config = schema.parse(process.env)
export type Config = typeof config
