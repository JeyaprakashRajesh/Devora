import type { Config } from 'drizzle-kit'

export default {
  schema: './src/schema/*',
  out: './src/migrations',
  driver: 'pg',
  dbCredentials: {
    connectionString: process.env.DATABASE_URL || 'postgresql://devora:devora_dev@localhost:5432/devora',
  },
} satisfies Config
