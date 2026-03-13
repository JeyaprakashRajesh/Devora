import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'sandbox-service',
    environment: 'node',
    globalSetup: 'src/__tests__/setup.ts',
    testTimeout: 20000,
    hookTimeout: 30000,
    fileParallelism: false,
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: '../../coverage/sandbox-service',
      thresholds: {
        statements: 80,
        branches: 75,
        functions: 80,
        lines: 80,
      },
      exclude: [
        'src/__tests__/**',
        'src/index.ts',
        'dist/**',
        'workspace-image/**',
      ],
    },
    include: ['src/__tests__/**/*.test.ts'],
    exclude: ['node_modules/**', 'dist/**'],
  },
})
