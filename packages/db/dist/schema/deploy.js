"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deploymentSteps = exports.deployments = exports.deploySpecs = exports.deployTargets = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
exports.deployTargets = (0, pg_core_1.pgTable)('deploy_targets', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    orgId: (0, pg_core_1.uuid)('org_id').notNull(),
    name: (0, pg_core_1.text)('name').notNull(),
    type: (0, pg_core_1.text)('type').notNull(),
    environment: (0, pg_core_1.text)('environment').notNull(),
    config: (0, pg_core_1.jsonb)('config').notNull(),
    healthUrl: (0, pg_core_1.text)('health_url'),
    createdBy: (0, pg_core_1.uuid)('created_by').notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
});
exports.deploySpecs = (0, pg_core_1.pgTable)('deploy_specs', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    projectId: (0, pg_core_1.uuid)('project_id').notNull(),
    targetId: (0, pg_core_1.uuid)('target_id').references(() => exports.deployTargets.id),
    name: (0, pg_core_1.text)('name').notNull(),
    spec: (0, pg_core_1.jsonb)('spec').notNull(),
    version: (0, pg_core_1.integer)('version').default(1).notNull(),
    createdBy: (0, pg_core_1.uuid)('created_by').notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
});
exports.deployments = (0, pg_core_1.pgTable)('deployments', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    specId: (0, pg_core_1.uuid)('spec_id').references(() => exports.deploySpecs.id),
    projectId: (0, pg_core_1.uuid)('project_id').notNull(),
    targetId: (0, pg_core_1.uuid)('target_id').notNull(),
    triggeredBy: (0, pg_core_1.uuid)('triggered_by').notNull(),
    triggerType: (0, pg_core_1.text)('trigger_type'),
    commitSha: (0, pg_core_1.text)('commit_sha'),
    imageTag: (0, pg_core_1.text)('image_tag'),
    status: (0, pg_core_1.text)('status').default('pending').notNull(),
    strategy: (0, pg_core_1.text)('strategy').default('rolling').notNull(),
    approvedBy: (0, pg_core_1.uuid)('approved_by'),
    approvedAt: (0, pg_core_1.timestamp)('approved_at'),
    startedAt: (0, pg_core_1.timestamp)('started_at'),
    finishedAt: (0, pg_core_1.timestamp)('finished_at'),
    failureReason: (0, pg_core_1.text)('failure_reason'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
});
exports.deploymentSteps = (0, pg_core_1.pgTable)('deployment_steps', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    deploymentId: (0, pg_core_1.uuid)('deployment_id').references(() => exports.deployments.id, { onDelete: 'cascade' }).notNull(),
    name: (0, pg_core_1.text)('name').notNull(),
    status: (0, pg_core_1.text)('status').default('pending').notNull(),
    logStreamId: (0, pg_core_1.text)('log_stream_id'),
    startedAt: (0, pg_core_1.timestamp)('started_at'),
    finishedAt: (0, pg_core_1.timestamp)('finished_at'),
});
//# sourceMappingURL=deploy.js.map