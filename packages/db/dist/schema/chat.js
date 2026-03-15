"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.messages = exports.channelMembers = exports.channels = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
exports.channels = (0, pg_core_1.pgTable)('channels', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    orgId: (0, pg_core_1.uuid)('org_id').notNull(),
    projectId: (0, pg_core_1.uuid)('project_id'),
    name: (0, pg_core_1.text)('name').notNull(),
    description: (0, pg_core_1.text)('description'),
    type: (0, pg_core_1.text)('type').default('public').notNull(),
    createdBy: (0, pg_core_1.uuid)('created_by').notNull(),
    archivedAt: (0, pg_core_1.timestamp)('archived_at'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
});
exports.channelMembers = (0, pg_core_1.pgTable)('channel_members', {
    channelId: (0, pg_core_1.uuid)('channel_id').references(() => exports.channels.id, { onDelete: 'cascade' }).notNull(),
    userId: (0, pg_core_1.uuid)('user_id').notNull(),
    role: (0, pg_core_1.text)('role').default('member').notNull(),
    lastReadAt: (0, pg_core_1.timestamp)('last_read_at').defaultNow(),
    joinedAt: (0, pg_core_1.timestamp)('joined_at').defaultNow().notNull(),
});
exports.messages = (0, pg_core_1.pgTable)('messages', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    channelId: (0, pg_core_1.uuid)('channel_id').references(() => exports.channels.id, { onDelete: 'cascade' }).notNull(),
    threadId: (0, pg_core_1.uuid)('thread_id'),
    authorId: (0, pg_core_1.uuid)('author_id').notNull(),
    content: (0, pg_core_1.text)('content').notNull(),
    contentType: (0, pg_core_1.text)('content_type').default('markdown').notNull(),
    attachments: (0, pg_core_1.jsonb)('attachments').default([]).notNull(),
    mentions: (0, pg_core_1.jsonb)('mentions').default([]).notNull(),
    reactions: (0, pg_core_1.jsonb)('reactions').default({}).notNull(),
    contextRef: (0, pg_core_1.jsonb)('context_ref'),
    editedAt: (0, pg_core_1.timestamp)('edited_at'),
    deletedAt: (0, pg_core_1.timestamp)('deleted_at'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
});
//# sourceMappingURL=chat.js.map