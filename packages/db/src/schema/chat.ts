import { pgTable, uuid, text, timestamp, jsonb } from 'drizzle-orm/pg-core'

export const channels = pgTable('channels', {
  id:          uuid('id').primaryKey().defaultRandom(),
  orgId:       uuid('org_id').notNull(),
  projectId:   uuid('project_id'),
  name:        text('name').notNull(),
  description: text('description'),
  type:        text('type').default('public').notNull(),
  createdBy:   uuid('created_by').notNull(),
  archivedAt:  timestamp('archived_at'),
  createdAt:   timestamp('created_at').defaultNow().notNull(),
})

export const channelMembers = pgTable('channel_members', {
  channelId:  uuid('channel_id').references(() => channels.id, { onDelete: 'cascade' }).notNull(),
  userId:     uuid('user_id').notNull(),
  role:       text('role').default('member').notNull(),
  lastReadAt: timestamp('last_read_at').defaultNow(),
  joinedAt:   timestamp('joined_at').defaultNow().notNull(),
})

export const messages = pgTable('messages', {
  id:          uuid('id').primaryKey().defaultRandom(),
  channelId:   uuid('channel_id').references(() => channels.id, { onDelete: 'cascade' }).notNull(),
  threadId:    uuid('thread_id'),
  authorId:    uuid('author_id').notNull(),
  content:     text('content').notNull(),
  contentType: text('content_type').default('markdown').notNull(),
  attachments: jsonb('attachments').default([]).notNull(),
  mentions:    jsonb('mentions').default([]).notNull(),
  reactions:   jsonb('reactions').default({}).notNull(),
  contextRef:  jsonb('context_ref'),
  editedAt:    timestamp('edited_at'),
  deletedAt:   timestamp('deleted_at'),
  createdAt:   timestamp('created_at').defaultNow().notNull(),
})
