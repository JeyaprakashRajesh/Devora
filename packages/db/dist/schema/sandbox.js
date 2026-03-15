"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.workspaces = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
exports.workspaces = (0, pg_core_1.pgTable)('workspaces', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    userId: (0, pg_core_1.uuid)('user_id').notNull(),
    orgId: (0, pg_core_1.uuid)('org_id').notNull(),
    projectId: (0, pg_core_1.uuid)('project_id'),
    name: (0, pg_core_1.text)('name').notNull(),
    status: (0, pg_core_1.text)('status').default('stopped').notNull(),
    podName: (0, pg_core_1.text)('pod_name'),
    volumeName: (0, pg_core_1.text)('volume_name'),
    cpuLimit: (0, pg_core_1.text)('cpu_limit').default('2').notNull(),
    memoryLimit: (0, pg_core_1.text)('memory_limit').default('2Gi').notNull(),
    lastActiveAt: (0, pg_core_1.timestamp)('last_active_at'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
});
//# sourceMappingURL=sandbox.js.map