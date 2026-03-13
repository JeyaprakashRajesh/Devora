import { pgTable, uuid, text, serial, integer, timestamp, jsonb, boolean, date } from 'drizzle-orm/pg-core'
import { users, organizations } from './auth'

export const projects = pgTable('projects', {
  id:            uuid('id').primaryKey().defaultRandom(),
  orgId:         uuid('org_id').notNull(),
  name:          text('name').notNull(),
  slug:          text('slug').notNull(),
  description:   text('description'),
  visibility:    text('visibility').default('private').notNull(),
  giteaRepoId:   integer('gitea_repo_id'),
  defaultBranch: text('default_branch').default('main').notNull(),
  settings:      jsonb('settings').default({}).notNull(),
  createdBy:     uuid('created_by').notNull(),
  archivedAt:    timestamp('archived_at'),
  createdAt:     timestamp('created_at').defaultNow().notNull(),
})

export const issues = pgTable('issues', {
  id:          uuid('id').primaryKey().defaultRandom(),
  projectId:   uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  number:      serial('number').notNull(),
  title:       text('title').notNull(),
  body:        text('body'),
  status:      text('status').default('open').notNull(),
  priority:    text('priority').default('medium').notNull(),
  type:        text('type').default('task').notNull(),
  assigneeIds: jsonb('assignee_ids').default([]).notNull(),
  labelIds:    jsonb('label_ids').default([]).notNull(),
  milestoneId: uuid('milestone_id'),
  parentId:    uuid('parent_id'),
  createdBy:   uuid('created_by').notNull(),
  closedBy:    uuid('closed_by'),
  closedAt:    timestamp('closed_at'),
  dueDate:     date('due_date'),
  createdAt:   timestamp('created_at').defaultNow().notNull(),
  updatedAt:   timestamp('updated_at').defaultNow().notNull(),
})

export const milestones = pgTable('milestones', {
  id:          uuid('id').primaryKey().defaultRandom(),
  projectId:   uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  title:       text('title').notNull(),
  description: text('description'),
  dueDate:     date('due_date'),
  status:      text('status').default('open').notNull(),
  createdBy:   uuid('created_by').notNull(),
  createdAt:   timestamp('created_at').defaultNow().notNull(),
})

export const pullRequests = pgTable('pull_requests', {
  id:            uuid('id').primaryKey().defaultRandom(),
  projectId:     uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  number:        integer('number').notNull(),
  title:         text('title').notNull(),
  body:          text('body'),
  status:        text('status').default('open').notNull(),
  sourceBranch:  text('source_branch').notNull(),
  targetBranch:  text('target_branch').notNull(),
  headSha:       text('head_sha'),
  baseSha:       text('base_sha'),
  authorId:      uuid('author_id').notNull(),
  mergedBy:      uuid('merged_by'),
  mergedAt:      timestamp('merged_at'),
  linkedIssues:  jsonb('linked_issues').default([]).notNull(),
  createdAt:     timestamp('created_at').defaultNow().notNull(),
  updatedAt:     timestamp('updated_at').defaultNow().notNull(),
})

export const pipelines = pgTable('pipelines', {
  id:         uuid('id').primaryKey().defaultRandom(),
  projectId:  uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  name:       text('name').notNull(),
  trigger:    jsonb('trigger').notNull(),
  definition: jsonb('definition').notNull(),
  createdBy:  uuid('created_by').notNull(),
  createdAt:  timestamp('created_at').defaultNow().notNull(),
})

export const pipelineRuns = pgTable('pipeline_runs', {
  id:           uuid('id').primaryKey().defaultRandom(),
  pipelineId:   uuid('pipeline_id').references(() => pipelines.id),
  projectId:    uuid('project_id').notNull(),
  triggerType:  text('trigger_type'),
  triggerActor: uuid('trigger_actor'),
  commitSha:    text('commit_sha'),
  branch:       text('branch'),
  status:       text('status').default('queued').notNull(),
  startedAt:    timestamp('started_at'),
  finishedAt:   timestamp('finished_at'),
  createdAt:    timestamp('created_at').defaultNow().notNull(),
})

export const pipelineJobs = pgTable('pipeline_jobs', {
  id:           uuid('id').primaryKey().defaultRandom(),
  runId:        uuid('run_id').references(() => pipelineRuns.id, { onDelete: 'cascade' }).notNull(),
  name:         text('name').notNull(),
  status:       text('status').default('pending').notNull(),
  runnerId:     uuid('runner_id'),
  logStreamId:  text('log_stream_id'),
  startedAt:    timestamp('started_at'),
  finishedAt:   timestamp('finished_at'),
  exitCode:     integer('exit_code'),
})
