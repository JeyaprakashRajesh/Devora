"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sandboxActivities = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
exports.sandboxActivities = (0, pg_core_1.pgTable)('sandbox_activities', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    workspaceId: (0, pg_core_1.uuid)('workspace_id').notNull(),
    userId: (0, pg_core_1.uuid)('user_id').notNull(),
    orgId: (0, pg_core_1.uuid)('org_id').notNull(),
    eventType: (0, pg_core_1.text)('event_type').notNull(),
    metadata: (0, pg_core_1.jsonb)('metadata').default({}).notNull(),
    recordedAt: (0, pg_core_1.timestamp)('recorded_at').defaultNow().notNull(),
});
//# sourceMappingURL=monitor.js.map