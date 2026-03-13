import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/__tests__/auth.test.ts', 'src/__tests__/rbac.test.ts'],
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
    globalSetup: path.resolve(__dirname, 'src/__tests__/setup.ts'),
    setupFiles: ['dotenv/config'],
    testTimeout: 15_000,
    env: {
      DOTENV_CONFIG_PATH: path.resolve(__dirname, '.env.test'),
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: [
        'src/app.ts',
        'src/middleware/authenticate.ts',
        'src/routes/auth.ts',
        'src/routes/roles.ts',
        'src/services/auth.service.ts',
        'src/services/rbac.service.ts',
      ],
      exclude: [
        'node_modules/**',
        'dist/**',
        'src/__tests__/**',
      ],
    },
    exclude: ['node_modules/**', 'dist/**'],
  },
})
