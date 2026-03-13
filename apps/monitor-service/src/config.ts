import { z } from 'zod'

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4004),
  DATABASE_URL: z.string().url(),
  NATS_URL: z.string().default('nats://localhost:4222'),
})

export const config = schema.parse({
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT ?? process.env.MONITOR_SERVICE_PORT ?? '4004',
  DATABASE_URL:
    process.env.DATABASE_URL
    ?? process.env.MONITOR_DATABASE_URL
    ?? 'postgresql://devora:devora_dev@localhost:5438/devora_monitor',
  NATS_URL: process.env.NATS_URL,
})

export type Config = typeof config