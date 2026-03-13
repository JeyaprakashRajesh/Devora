import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core'

export const notifications = pgTable('notifications', {
  id:         uuid('id').primaryKey().defaultRandom(),
  userId:     uuid('user_id').notNull(),
  orgId:      uuid('org_id').notNull(),
  type:       text('type').notNull(),
  title:      text('title').notNull(),
  body:       text('body'),
  actionUrl:  text('action_url'),
  sourceType: text('source_type'),
  sourceId:   uuid('source_id'),
  readAt:     timestamp('read_at'),
  createdAt:  timestamp('created_at').defaultNow().notNull(),
})
