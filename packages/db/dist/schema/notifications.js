"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notifications = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
exports.notifications = (0, pg_core_1.pgTable)('notifications', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    userId: (0, pg_core_1.uuid)('user_id').notNull(),
    orgId: (0, pg_core_1.uuid)('org_id').notNull(),
    type: (0, pg_core_1.text)('type').notNull(),
    title: (0, pg_core_1.text)('title').notNull(),
    body: (0, pg_core_1.text)('body'),
    actionUrl: (0, pg_core_1.text)('action_url'),
    sourceType: (0, pg_core_1.text)('source_type'),
    sourceId: (0, pg_core_1.uuid)('source_id'),
    readAt: (0, pg_core_1.timestamp)('read_at'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
});
//# sourceMappingURL=notifications.js.map