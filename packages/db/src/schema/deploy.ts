import { pgTable, uuid, text, integer, timestamp, jsonb } from 'drizzle-orm/pg-core'

export const deployTargets = pgTable('deploy_targets', {
  id:          uuid('id').primaryKey().defaultRandom(),
  orgId:       uuid('org_id').notNull(),
  name:        text('name').notNull(),
  type:        text('type').notNull(),
  environment: text('environment').notNull(),
  config:      jsonb('config').notNull(),
  healthUrl:   text('health_url'),
  createdBy:   uuid('created_by').notNull(),
  createdAt:   timestamp('created_at').defaultNow().notNull(),
})

export const deploySpecs = pgTable('deploy_specs', {
  id:         uuid('id').primaryKey().defaultRandom(),
  projectId:  uuid('project_id').notNull(),
  targetId:   uuid('target_id').references(() => deployTargets.id),
  name:       text('name').notNull(),
  spec:       jsonb('spec').notNull(),
  version:    integer('version').default(1).notNull(),
  createdBy:  uuid('created_by').notNull(),
  createdAt:  timestamp('created_at').defaultNow().notNull(),
})

export const deployments = pgTable('deployments', {
  id:            uuid('id').primaryKey().defaultRandom(),
  specId:        uuid('spec_id').references(() => deploySpecs.id),
  projectId:     uuid('project_id').notNull(),
  targetId:      uuid('target_id').notNull(),
  triggeredBy:   uuid('triggered_by').notNull(),
  triggerType:   text('trigger_type'),
  commitSha:     text('commit_sha'),
  imageTag:      text('image_tag'),
  status:        text('status').default('pending').notNull(),
  strategy:      text('strategy').default('rolling').notNull(),
  approvedBy:    uuid('approved_by'),
  approvedAt:    timestamp('approved_at'),
  startedAt:     timestamp('started_at'),
  finishedAt:    timestamp('finished_at'),
  failureReason: text('failure_reason'),
  createdAt:     timestamp('created_at').defaultNow().notNull(),
})

export const deploymentSteps = pgTable('deployment_steps', {
  id:           uuid('id').primaryKey().defaultRandom(),
  deploymentId: uuid('deployment_id').references(() => deployments.id, { onDelete: 'cascade' }).notNull(),
  name:         text('name').notNull(),
  status:       text('status').default('pending').notNull(),
  logStreamId:  text('log_stream_id'),
  startedAt:    timestamp('started_at'),
  finishedAt:   timestamp('finished_at'),
})
