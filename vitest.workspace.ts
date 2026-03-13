import { defineWorkspace } from 'vitest/config'

export default defineWorkspace([
  'apps/sandbox-service/vitest.config.ts',
  'apps/notification-service/vitest.config.ts',
  'apps/monitor-service/vitest.config.ts',
  'apps/sandbox-service/workspace-image/ai-agent/vitest.config.ts',
])
