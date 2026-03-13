import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core'

export const workspaces = pgTable('workspaces', {
  id:            uuid('id').primaryKey().defaultRandom(),
  userId:        uuid('user_id').notNull(),
  orgId:         uuid('org_id').notNull(),
  projectId:     uuid('project_id'),
  name:          text('name').notNull(),
  status:        text('status').default('stopped').notNull(),
  podName:       text('pod_name'),
  volumeName:    text('volume_name'),
  cpuLimit:      text('cpu_limit').default('2').notNull(),
  memoryLimit:   text('memory_limit').default('2Gi').notNull(),
  lastActiveAt:  timestamp('last_active_at'),
  createdAt:     timestamp('created_at').defaultNow().notNull(),
})
