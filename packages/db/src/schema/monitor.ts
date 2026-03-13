import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const sandboxActivities = pgTable('sandbox_activities', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull(),
  userId: uuid('user_id').notNull(),
  orgId: uuid('org_id').notNull(),
  eventType: text('event_type').notNull(),
  metadata: jsonb('metadata').default({}).notNull(),
  recordedAt: timestamp('recorded_at').defaultNow().notNull(),
})