import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'monitor-service',
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
      reportsDirectory: '../../coverage/monitor-service',
      thresholds: {
        statements: 75,
        branches: 70,
        functions: 75,
        lines: 75,
      },
      exclude: [
        'src/__tests__/**',
        'src/index.ts',
        'dist/**',
      ],
    },
    include: ['src/__tests__/**/*.test.ts'],
    exclude: ['node_modules/**', 'dist/**'],
  },
})
