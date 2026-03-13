# DEVORA

# `DEVORA_PLAN.md`

> **Purpose:** This document is the complete, ordered implementation plan for the Devora platform. It is written for AI coding agents and developers. Every task includes exact file paths, code structure, dependencies, and acceptance criteria. Follow tasks in order within each sprint. Do not skip prerequisites.

---

## Platform Overview (Quick Reference)

```
Monorepo:       devora/
Runtime:        Node.js 20 LTS (services) + Rust 1.78+ (deploy-engine, installer)
Frontend:       React 18 + Vite + TailwindCSS
DB ORM:         Drizzle ORM → PostgreSQL 16
Message bus:    NATS
Orchestration:  K3s (production) / Docker Compose (dev)
Package mgr:    npm workspaces + Turborepo
```

---

## PRE-SPRINT — Repository & Development Environment

**Development Dependencies Setup:**
Please refer to the OS-specific guides to install required dependencies (Node.js 20, Rust 1.78+, Docker, etc.) before proceeding:

- [Linux Setup Guide](./linux_dependencies.md)
- [macOS Setup Guide](./mac_dependencies.md)
- [Windows Setup Guide](./windows_dependencies.md)

**Goal:** Monorepo scaffold, tooling, shared packages, and local dev infrastructure running before any feature work begins.

---

- [x] ### TASK P-01 — Initialize Monorepo

**Files to create:**

```
devora/
├── package.json
├── turbo.json
├── tsconfig.base.json
├── .eslintrc.base.js
├── .prettierrc
├── .gitignore
├── .nvmrc
└── .env.example
```

**`package.json` structure:**

```json
{
  "name": "devora",
  "private": true,
  "workspaces": ["apps/*", "packages/*", "core/*"],
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "test": "turbo run test",
    "lint": "turbo run lint",
    "db:migrate": "turbo run db:migrate",
    "db:generate": "turbo run db:generate"
  },
  "devDependencies": {
    "turbo": "^2.0.0",
    "typescript": "^5.4.0",
    "eslint": "^8.57.0",
    "prettier": "^3.2.0"
  }
}
```

**`turbo.json` structure:**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "pipeline": {
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**"] },
    "dev": { "cache": false, "persistent": true },
    "test": { "dependsOn": ["^build"] },
    "lint": {},
    "db:migrate": { "cache": false },
    "db:generate": { "cache": false }
  }
}
```

**`tsconfig.base.json`:**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

**Acceptance criteria:** `npm install` at root completes without errors `turbo run build` runs (nothing to build yet, exits clean)

---

- [x] ### TASK P-02 — Create Directory Scaffold

**Run:**

```bash
mkdir -p apps/{portal,gateway,auth-service,project-service,chat-service,monitor-service,sandbox-service,notification-service}
mkdir -p core/{deploy-engine,installer}
mkdir -p packages/{db,nats,logger,errors,types}
mkdir -p infra/{k3s,traefik,compose}
mkdir -p docs/{architecture,api,contributing}
```

**Each `apps/*` and `packages/*` needs a minimal `package.json`:**

```json
{
  "name": "@devora/<name>",
  "version": "0.1.0",
  "private": true
}
```

**Acceptance criteria:** All directories exist All workspace packages resolvable by npm

---

- [x] ### TASK P-03 — Create `packages/types`

**Purpose:** Shared TypeScript types used across all services.

**Files:**

```
packages/types/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts
    ├── auth.ts
    ├── project.ts
    ├── chat.ts
    ├── deploy.ts
    ├── monitor.ts
    └── sandbox.ts
```

**`src/auth.ts` structure:**

```typescript
export type OrgPlan = 'starter' | 'pro' | 'enterprise'
export type UserStatus = 'active' | 'suspended' | 'invited'
export type RoleScope = 'platform' | 'org' | 'project'

export interface Organization {
  id: string
  name: string
  slug: string
  plan: OrgPlan
  settings: Record<string, unknown>
  createdAt: Date
}

export interface User {
  id: string
  orgId: string
  email: string
  username: string
  displayName?: string
  avatarUrl?: string
  status: UserStatus
  lastSeenAt?: Date
  createdAt: Date
}

export interface Role {
  id: string
  orgId?: string
  name: string
  scope: RoleScope
  permissions: string[]
  isSystem: boolean
}

export interface Session {
  id: string
  userId: string
  expiresAt: Date
}

export interface JwtPayload {
  sub: string // user id
  org: string // org id
  roles: string[] // role ids
  iat: number
  exp: number
}
```

**`src/project.ts` structure:**

```typescript
export type IssueStatus = 'open' | 'in_progress' | 'closed'
export type IssuePriority = 'low' | 'medium' | 'high' | 'critical'
export type IssueType = 'task' | 'bug' | 'feature' | 'epic'
export type PRStatus = 'open' | 'merged' | 'closed' | 'draft'
export type PipelineStatus =
  | 'queued'
  | 'running'
  | 'passed'
  | 'failed'
  | 'cancelled'

export interface Project {
  id: string
  orgId: string
  name: string
  slug: string
  description?: string
  visibility: 'private' | 'internal' | 'public'
  defaultBranch: string
  createdBy: string
  createdAt: Date
}

export interface Issue {
  id: string
  projectId: string
  number: number
  title: string
  body?: string
  status: IssueStatus
  priority: IssuePriority
  type: IssueType
  assigneeIds: string[]
  createdBy: string
  createdAt: Date
}

export interface PipelineRun {
  id: string
  pipelineId: string
  projectId: string
  status: PipelineStatus
  commitSha?: string
  branch?: string
  startedAt?: Date
  finishedAt?: Date
}
```

**`src/chat.ts` structure:**

```typescript
export type ChannelType = 'public' | 'private' | 'dm' | 'thread'
export type MessageContentType = 'markdown' | 'system' | 'card'

export interface Channel {
  id: string
  orgId: string
  projectId?: string
  name: string
  type: ChannelType
  createdBy: string
}

export interface Message {
  id: string
  channelId: string
  threadId?: string
  authorId: string
  content: string
  contentType: MessageContentType
  mentions: string[]
  reactions: Record<string, string[]>
  contextRef?: { type: 'pr' | 'issue' | 'deploy'; id: string }
  createdAt: Date
  editedAt?: Date
  deletedAt?: Date
}
```

**`src/deploy.ts` structure:**

```typescript
export type DeployTargetType =
  | 'self_hosted'
  | 'aws'
  | 'gcp'
  | 'azure'
  | 'hetzner'
  | 'digitalocean'
export type DeployEnvironment = 'dev' | 'staging' | 'production'
export type DeployStatus =
  | 'pending'
  | 'building'
  | 'deploying'
  | 'live'
  | 'failed'
  | 'rolled_back'
export type DeployStrategy = 'rolling' | 'blue_green' | 'canary'

export interface DeployTarget {
  id: string
  orgId: string
  name: string
  type: DeployTargetType
  environment: DeployEnvironment
  createdBy: string
}

export interface Deployment {
  id: string
  projectId: string
  targetId: string
  triggeredBy: string
  commitSha?: string
  status: DeployStatus
  strategy: DeployStrategy
  approvedBy?: string
  startedAt?: Date
  finishedAt?: Date
}
```

**Acceptance criteria:** `packages/types` builds with `tsc` without errors Types importable in other packages via `@devora/types`

---

- [x] ### TASK P-04 — Create `packages/errors`

**Files:**

```
packages/errors/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts
    └── codes.ts
```

**`src/codes.ts`:**

```typescript
export const ErrorCodes = {
  // Auth
  UNAUTHORIZED: 'AUTH_001',
  FORBIDDEN: 'AUTH_002',
  INVALID_CREDENTIALS: 'AUTH_003',
  SESSION_EXPIRED: 'AUTH_004',
  USER_NOT_FOUND: 'AUTH_005',
  ORG_NOT_FOUND: 'AUTH_006',
  // Project
  PROJECT_NOT_FOUND: 'PROJ_001',
  ISSUE_NOT_FOUND: 'PROJ_002',
  PR_NOT_FOUND: 'PROJ_003',
  // Deploy
  DEPLOY_TARGET_NOT_FOUND: 'DEPL_001',
  DEPLOY_FORBIDDEN: 'DEPL_002',
  DEPLOY_SPEC_INVALID: 'DEPL_003',
  // Chat
  CHANNEL_NOT_FOUND: 'CHAT_001',
  MESSAGE_NOT_FOUND: 'CHAT_002',
  // Generic
  VALIDATION_ERROR: 'GEN_001',
  INTERNAL_ERROR: 'GEN_002',
  NOT_FOUND: 'GEN_003',
  CONFLICT: 'GEN_004',
} as const

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes]
```

**`src/index.ts`:**

```typescript
import { ErrorCode } from './codes'

export class DevоraError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly statusCode: number = 500,
    public readonly details?: unknown
  ) {
    super(message)
    this.name = 'DevoraError'
  }
}

export class NotFoundError extends DevoraError {
  constructor(resource: string, id?: string) {
    super('GEN_003', `${resource}${id ? ` '${id}'` : ''} not found`, 404)
  }
}

export class UnauthorizedError extends DevoraError {
  constructor(message = 'Unauthorized') {
    super('AUTH_001', message, 401)
  }
}

export class ForbiddenError extends DevoraError {
  constructor(message = 'Forbidden') {
    super('AUTH_002', message, 403)
  }
}

export class ValidationError extends DevoraError {
  constructor(message: string, details?: unknown) {
    super('GEN_001', message, 400, details)
  }
}

export class ConflictError extends DevoraError {
  constructor(message: string) {
    super('GEN_004', message, 409)
  }
}

export { ErrorCodes } from './codes'
export type { ErrorCode } from './codes'
```

---

- [x] ### TASK P-05 — Create `packages/logger`

**Files:**

```
packages/logger/
├── package.json
├── tsconfig.json
└── src/
    └── index.ts
```

**`src/index.ts`:**

```typescript
import pino from 'pino'

export function createLogger(service: string) {
  return pino({
    name: service,
    level: process.env.LOG_LEVEL ?? 'info',
    ...(process.env.NODE_ENV === 'development'
      ? { transport: { target: 'pino-pretty', options: { colorize: true } } }
      : {}),
    base: { service },
  })
}

export type Logger = ReturnType<typeof createLogger>
```

**Dependencies:** `pino`, `pino-pretty`

---

- [x] ### TASK P-06 — Create `packages/nats`

**Files:**

```
packages/nats/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts
    ├── client.ts
    └── subjects.ts
```

**`src/subjects.ts` — complete NATS subject registry:**

```typescript
export const Subjects = {
  // Auth
  AUTH_USER_CREATED: 'auth.user.created',
  AUTH_USER_UPDATED: 'auth.user.updated',
  AUTH_ROLE_ASSIGNED: 'auth.role.assigned',
  AUTH_USER_INVITED: 'auth.user.invited',

  // Project
  PROJECT_CREATED: 'project.created',
  PROJECT_ISSUE_CREATED: 'project.issue.created',
  PROJECT_ISSUE_UPDATED: 'project.issue.updated',
  PROJECT_ISSUE_CLOSED: 'project.issue.closed',
  PROJECT_PR_OPENED: 'project.pr.opened',
  PROJECT_PR_MERGED: 'project.pr.merged',
  PROJECT_PR_CLOSED: 'project.pr.closed',
  PROJECT_PIPELINE_STARTED: 'project.pipeline.started',
  PROJECT_PIPELINE_PASSED: 'project.pipeline.passed',
  PROJECT_PIPELINE_FAILED: 'project.pipeline.failed',

  // Deploy
  DEPLOY_STARTED: 'deploy.started',
  DEPLOY_STEP_COMPLETED: 'deploy.step.completed',
  DEPLOY_SUCCEEDED: 'deploy.succeeded',
  DEPLOY_FAILED: 'deploy.failed',
  DEPLOY_APPROVAL_REQUIRED: 'deploy.approval.required',
  DEPLOY_ROLLED_BACK: 'deploy.rolled_back',

  // Sandbox
  SANDBOX_CREATED: 'sandbox.created',
  SANDBOX_STARTED: 'sandbox.started',
  SANDBOX_STOPPED: 'sandbox.stopped',
  SANDBOX_RESOURCE_SPIKE: 'sandbox.resource.spike',

  // Chat
  CHAT_MESSAGE_CREATED: 'chat.message.created',
  CHAT_MENTION_DETECTED: 'chat.mention.detected',
} as const

export type Subject = (typeof Subjects)[keyof typeof Subjects]
```

**`src/client.ts`:**

```typescript
import { connect, NatsConnection, JSONCodec, StringCodec } from 'nats'
import { Logger } from '@devora/logger'

const jc = JSONCodec()

export async function createNatsClient(
  url: string,
  logger: Logger
): Promise<NatsConnection> {
  const nc = await connect({ servers: url })
  logger.info({ url }, 'Connected to NATS')
  return nc
}

export function publish<T>(nc: NatsConnection, subject: string, data: T): void {
  nc.publish(subject, jc.encode(data))
}

export function subscribe<T>(
  nc: NatsConnection,
  subject: string,
  handler: (data: T) => Promise<void>
): void {
  const sub = nc.subscribe(subject)
  ;(async () => {
    for await (const msg of sub) {
      try {
        const data = jc.decode(msg.data) as T
        await handler(data)
      } catch (err) {
        // handler errors must not crash the subscription
      }
    }
  })()
}
```

---

- [x] ### TASK P-07 — Create `packages/db` — Drizzle ORM Schemas

**Files:**

```
packages/db/
├── package.json
├── tsconfig.json
├── drizzle.config.ts
└── src/
    ├── index.ts
    ├── client.ts
    ├── schema/
    │   ├── auth.ts
    │   ├── project.ts
    │   ├── chat.ts
    │   ├── deploy.ts
    │   ├── sandbox.ts
    │   └── notifications.ts
    └── migrations/
        └── (generated by drizzle-kit)
```

**`src/client.ts`:**

```typescript
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

export function createDb(connectionString: string) {
  const pool = new Pool({ connectionString })
  return drizzle(pool)
}

export type Db = ReturnType<typeof createDb>
```

**`src/schema/auth.ts`:**

```typescript
import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  jsonb,
  inet,
} from 'drizzle-orm/pg-core'

export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').unique().notNull(),
  plan: text('plan').default('starter').notNull(),
  settings: jsonb('settings').default({}).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id')
    .references(() => organizations.id, { onDelete: 'cascade' })
    .notNull(),
  email: text('email').unique().notNull(),
  username: text('username').notNull(),
  displayName: text('display_name'),
  avatarUrl: text('avatar_url'),
  passwordHash: text('password_hash'),
  status: text('status').default('active').notNull(),
  lastSeenAt: timestamp('last_seen_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const roles = pgTable('roles', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').references(() => organizations.id),
  name: text('name').notNull(),
  scope: text('scope').notNull(),
  permissions: jsonb('permissions').default([]).notNull(),
  isSystem: boolean('is_system').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const userRoles = pgTable('user_roles', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  roleId: uuid('role_id')
    .references(() => roles.id, { onDelete: 'cascade' })
    .notNull(),
  resourceType: text('resource_type'),
  resourceId: uuid('resource_id'),
  grantedBy: uuid('granted_by').references(() => users.id),
  expiresAt: timestamp('expires_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const groups = pgTable('groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id')
    .references(() => organizations.id, { onDelete: 'cascade' })
    .notNull(),
  name: text('name').notNull(),
  description: text('description'),
  createdBy: uuid('created_by')
    .references(() => users.id)
    .notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const groupMembers = pgTable('group_members', {
  groupId: uuid('group_id')
    .references(() => groups.id, { onDelete: 'cascade' })
    .notNull(),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  role: text('role').default('member').notNull(),
  joinedAt: timestamp('joined_at').defaultNow().notNull(),
})

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  tokenHash: text('token_hash').unique().notNull(),
  ipAddress: inet('ip_address'),
  userAgent: text('user_agent'),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').references(() => organizations.id),
  actorId: uuid('actor_id').references(() => users.id),
  action: text('action').notNull(),
  resourceType: text('resource_type'),
  resourceId: uuid('resource_id'),
  metadata: jsonb('metadata').default({}).notNull(),
  ipAddress: inet('ip_address'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})
```

**`src/schema/project.ts`:**

```typescript
import {
  pgTable,
  uuid,
  text,
  serial,
  integer,
  timestamp,
  jsonb,
  boolean,
  date,
} from 'drizzle-orm/pg-core'
import { users, organizations } from './auth'

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  description: text('description'),
  visibility: text('visibility').default('private').notNull(),
  giteaRepoId: integer('gitea_repo_id'),
  defaultBranch: text('default_branch').default('main').notNull(),
  settings: jsonb('settings').default({}).notNull(),
  createdBy: uuid('created_by').notNull(),
  archivedAt: timestamp('archived_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const issues = pgTable('issues', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .references(() => projects.id, { onDelete: 'cascade' })
    .notNull(),
  number: serial('number').notNull(),
  title: text('title').notNull(),
  body: text('body'),
  status: text('status').default('open').notNull(),
  priority: text('priority').default('medium').notNull(),
  type: text('type').default('task').notNull(),
  assigneeIds: jsonb('assignee_ids').default([]).notNull(),
  labelIds: jsonb('label_ids').default([]).notNull(),
  milestoneId: uuid('milestone_id'),
  parentId: uuid('parent_id'),
  createdBy: uuid('created_by').notNull(),
  closedBy: uuid('closed_by'),
  closedAt: timestamp('closed_at'),
  dueDate: date('due_date'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const milestones = pgTable('milestones', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .references(() => projects.id, { onDelete: 'cascade' })
    .notNull(),
  title: text('title').notNull(),
  description: text('description'),
  dueDate: date('due_date'),
  status: text('status').default('open').notNull(),
  createdBy: uuid('created_by').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const pullRequests = pgTable('pull_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .references(() => projects.id, { onDelete: 'cascade' })
    .notNull(),
  number: integer('number').notNull(),
  title: text('title').notNull(),
  body: text('body'),
  status: text('status').default('open').notNull(),
  sourceBranch: text('source_branch').notNull(),
  targetBranch: text('target_branch').notNull(),
  headSha: text('head_sha'),
  baseSha: text('base_sha'),
  authorId: uuid('author_id').notNull(),
  mergedBy: uuid('merged_by'),
  mergedAt: timestamp('merged_at'),
  linkedIssues: jsonb('linked_issues').default([]).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const pipelines = pgTable('pipelines', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .references(() => projects.id, { onDelete: 'cascade' })
    .notNull(),
  name: text('name').notNull(),
  trigger: jsonb('trigger').notNull(),
  definition: jsonb('definition').notNull(),
  createdBy: uuid('created_by').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const pipelineRuns = pgTable('pipeline_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  pipelineId: uuid('pipeline_id').references(() => pipelines.id),
  projectId: uuid('project_id').notNull(),
  triggerType: text('trigger_type'),
  triggerActor: uuid('trigger_actor'),
  commitSha: text('commit_sha'),
  branch: text('branch'),
  status: text('status').default('queued').notNull(),
  startedAt: timestamp('started_at'),
  finishedAt: timestamp('finished_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const pipelineJobs = pgTable('pipeline_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  runId: uuid('run_id')
    .references(() => pipelineRuns.id, { onDelete: 'cascade' })
    .notNull(),
  name: text('name').notNull(),
  status: text('status').default('pending').notNull(),
  runnerId: uuid('runner_id'),
  logStreamId: text('log_stream_id'),
  startedAt: timestamp('started_at'),
  finishedAt: timestamp('finished_at'),
  exitCode: integer('exit_code'),
})
```

**`src/schema/chat.ts`:**

```typescript
import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  primaryKey,
} from 'drizzle-orm/pg-core'

export const channels = pgTable('channels', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  projectId: uuid('project_id'),
  name: text('name').notNull(),
  description: text('description'),
  type: text('type').default('public').notNull(),
  createdBy: uuid('created_by').notNull(),
  archivedAt: timestamp('archived_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const channelMembers = pgTable('channel_members', {
  channelId: uuid('channel_id')
    .references(() => channels.id, { onDelete: 'cascade' })
    .notNull(),
  userId: uuid('user_id').notNull(),
  role: text('role').default('member').notNull(),
  lastReadAt: timestamp('last_read_at').defaultNow(),
  joinedAt: timestamp('joined_at').defaultNow().notNull(),
})

export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  channelId: uuid('channel_id')
    .references(() => channels.id, { onDelete: 'cascade' })
    .notNull(),
  threadId: uuid('thread_id'),
  authorId: uuid('author_id').notNull(),
  content: text('content').notNull(),
  contentType: text('content_type').default('markdown').notNull(),
  attachments: jsonb('attachments').default([]).notNull(),
  mentions: jsonb('mentions').default([]).notNull(),
  reactions: jsonb('reactions').default({}).notNull(),
  contextRef: jsonb('context_ref'),
  editedAt: timestamp('edited_at'),
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})
```

**`src/schema/deploy.ts`:**

```typescript
import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  jsonb,
} from 'drizzle-orm/pg-core'

export const deployTargets = pgTable('deploy_targets', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  name: text('name').notNull(),
  type: text('type').notNull(),
  environment: text('environment').notNull(),
  config: jsonb('config').notNull(),
  healthUrl: text('health_url'),
  createdBy: uuid('created_by').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const deploySpecs = pgTable('deploy_specs', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull(),
  targetId: uuid('target_id').references(() => deployTargets.id),
  name: text('name').notNull(),
  spec: jsonb('spec').notNull(),
  version: integer('version').default(1).notNull(),
  createdBy: uuid('created_by').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const deployments = pgTable('deployments', {
  id: uuid('id').primaryKey().defaultRandom(),
  specId: uuid('spec_id').references(() => deploySpecs.id),
  projectId: uuid('project_id').notNull(),
  targetId: uuid('target_id').notNull(),
  triggeredBy: uuid('triggered_by').notNull(),
  triggerType: text('trigger_type'),
  commitSha: text('commit_sha'),
  imageTag: text('image_tag'),
  status: text('status').default('pending').notNull(),
  strategy: text('strategy').default('rolling').notNull(),
  approvedBy: uuid('approved_by'),
  approvedAt: timestamp('approved_at'),
  startedAt: timestamp('started_at'),
  finishedAt: timestamp('finished_at'),
  failureReason: text('failure_reason'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const deploymentSteps = pgTable('deployment_steps', {
  id: uuid('id').primaryKey().defaultRandom(),
  deploymentId: uuid('deployment_id')
    .references(() => deployments.id, { onDelete: 'cascade' })
    .notNull(),
  name: text('name').notNull(),
  status: text('status').default('pending').notNull(),
  logStreamId: text('log_stream_id'),
  startedAt: timestamp('started_at'),
  finishedAt: timestamp('finished_at'),
})
```

**`src/schema/sandbox.ts`:**

```typescript
import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  jsonb,
} from 'drizzle-orm/pg-core'

export const workspaces = pgTable('workspaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  orgId: uuid('org_id').notNull(),
  projectId: uuid('project_id'),
  name: text('name').notNull(),
  status: text('status').default('stopped').notNull(),
  podName: text('pod_name'),
  volumeName: text('volume_name'),
  cpuLimit: text('cpu_limit').default('2').notNull(),
  memoryLimit: text('memory_limit').default('2Gi').notNull(),
  lastActiveAt: timestamp('last_active_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})
```

**`src/schema/notifications.ts`:**

```typescript
import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core'

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  orgId: uuid('org_id').notNull(),
  type: text('type').notNull(),
  title: text('title').notNull(),
  body: text('body'),
  actionUrl: text('action_url'),
  sourceType: text('source_type'),
  sourceId: uuid('source_id'),
  readAt: timestamp('read_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})
```

**Acceptance criteria:** `drizzle-kit generate` produces migration SQL for all schemas `drizzle-kit push` applies cleanly to local PostgreSQL

---

- [x] ### TASK P-08 — Docker Compose Dev Infrastructure

**File:** `infra/compose/dev.yml`

```yaml
version: '3.9'

services:
  postgres-auth:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: devora_auth
      POSTGRES_USER: devora
      POSTGRES_PASSWORD: devora_dev
    ports: ['5432:5432']
    volumes: ['postgres_auth:/var/lib/postgresql/data']

  postgres-project:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: devora_project
      POSTGRES_USER: devora
      POSTGRES_PASSWORD: devora_dev
    ports: ['5433:5432']
    volumes: ['postgres_project:/var/lib/postgresql/data']

  postgres-chat:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: devora_chat
      POSTGRES_USER: devora
      POSTGRES_PASSWORD: devora_dev
    ports: ['5434:5432']
    volumes: ['postgres_chat:/var/lib/postgresql/data']

  postgres-deploy:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: devora_deploy
      POSTGRES_USER: devora
      POSTGRES_PASSWORD: devora_dev
    ports: ['5435:5432']
    volumes: ['postgres_deploy:/var/lib/postgresql/data']

  postgres-sandbox:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: devora_sandbox
      POSTGRES_USER: devora
      POSTGRES_PASSWORD: devora_dev
    ports: ['5436:5432']
    volumes: ['postgres_sandbox:/var/lib/postgresql/data']

  postgres-notify:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: devora_notify
      POSTGRES_USER: devora
      POSTGRES_PASSWORD: devora_dev
    ports: ['5437:5432']
    volumes: ['postgres_notify:/var/lib/postgresql/data']

  redis:
    image: redis:7-alpine
    ports: ['6379:6379']
    volumes: ['redis_data:/data']

  nats:
    image: nats:2.10-alpine
    ports:
      - '4222:4222'
      - '8222:8222'
    command: ['--http_port', '8222', '--jetstream']

  minio:
    image: minio/minio:latest
    command: server /data --console-address ':9001'
    environment:
      MINIO_ROOT_USER: devora
      MINIO_ROOT_PASSWORD: devora_dev_secret
    ports:
      - '9000:9000'
      - '9001:9001'
    volumes: ['minio_data:/data']

  clickhouse:
    image: clickhouse/clickhouse-server:24-alpine
    ports:
      - '8123:8123'
      - '9002:9000'
    volumes: ['clickhouse_data:/var/lib/clickhouse']

volumes:
  postgres_auth:
  postgres_project:
  postgres_chat:
  postgres_deploy:
  postgres_sandbox:
  postgres_notify:
  redis_data:
  minio_data:
  clickhouse_data:
```

**Acceptance criteria:** `docker compose -f infra/compose/dev.yml up -d` starts all services All ports accessible from host

---

- [x] ### TASK P-09 — Root `.env.example`

**File:** `.env.example`

```bash
# Node
NODE_ENV=development
LOG_LEVEL=debug

# Service ports
GATEWAY_PORT=4000
AUTH_SERVICE_PORT=4001
PROJECT_SERVICE_PORT=4002
CHAT_SERVICE_PORT=4003
MONITOR_SERVICE_PORT=4004
SANDBOX_SERVICE_PORT=4005
NOTIFICATION_SERVICE_PORT=4006

# Databases (dev defaults match docker-compose)
AUTH_DATABASE_URL=postgresql://devora:devora_dev@localhost:5432/devora_auth
PROJECT_DATABASE_URL=postgresql://devora:devora_dev@localhost:5433/devora_project
CHAT_DATABASE_URL=postgresql://devora:devora_dev@localhost:5434/devora_chat
DEPLOY_DATABASE_URL=postgresql://devora:devora_dev@localhost:5435/devora_deploy
SANDBOX_DATABASE_URL=postgresql://devora:devora_dev@localhost:5436/devora_sandbox
NOTIFY_DATABASE_URL=postgresql://devora:devora_dev@localhost:5437/devora_notify

# Redis
REDIS_URL=redis://localhost:6379

# NATS
NATS_URL=nats://localhost:4222

# MinIO
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=devora
MINIO_SECRET_KEY=devora_dev_secret

# JWT
JWT_SECRET=change_this_in_production_minimum_32_chars
JWT_EXPIRES_IN=24h

# Keycloak (set up separately)
KEYCLOAK_URL=http://localhost:8080
KEYCLOAK_REALM=devora
KEYCLOAK_CLIENT_ID=devora-api

# Gitea
GITEA_URL=http://localhost:3001
GITEA_ADMIN_TOKEN=

# OpenBao (Vault)
VAULT_ADDR=http://localhost:8200
VAULT_TOKEN=

# Ollama
OLLAMA_URL=http://localhost:11434
OLLAMA_DEFAULT_MODEL=deepseek-coder-v2
```

---

## **Pre-Sprint complete.** Proceed to Sprint 1.

- [X] ## SPRINT 1 — Foundation: Auth Service & RBAC Engine

**Duration:** 2 weeks
**Goal:** Working authentication, session management, full RBAC engine, and portal skeleton with login/register pages. Every subsequent sprint depends on this being complete and tested.

**Prerequisites:** All Pre-Sprint tasks complete. Dev infrastructure running.

---

- [x] ### TASK 1-01 — Bootstrap `apps/auth-service`

**Files to create:**

```
apps/auth-service/
├── package.json
├── tsconfig.json
├── .env (copy from root .env.example, auth vars only)
└── src/
    ├── index.ts          ← entry point
    ├── app.ts            ← Fastify app factory
    ├── config.ts         ← env var validation (zod)
    ├── plugins/
    │   ├── db.ts         ← Drizzle DB plugin
    │   ├── redis.ts      ← Redis plugin
    │   ├── nats.ts       ← NATS client plugin
    │   └── jwt.ts        ← JWT plugin (@fastify/jwt)
    ├── routes/
    │   ├── index.ts      ← route registration
    │   ├── auth.ts       ← /auth/* routes
    │   ├── users.ts      ← /users/* routes
    │   ├── orgs.ts       ← /orgs/* routes
    │   └── roles.ts      ← /roles/* routes
    ├── services/
    │   ├── auth.service.ts
    │   ├── user.service.ts
    │   ├── org.service.ts
    │   └── rbac.service.ts
    ├── middleware/
    │   └── authenticate.ts
    └── __tests__/
        ├── auth.test.ts
        └── rbac.test.ts
```

**`src/config.ts`:**

```typescript
import { z } from 'zod'

const schema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z.coerce.number().default(4001),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string(),
  NATS_URL: z.string(),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('24h'),
})

export const config = schema.parse(process.env)
export type Config = typeof config
```

**`src/app.ts`:**

```typescript
import Fastify from 'fastify'
import { createLogger } from '@devora/logger'
import { dbPlugin } from './plugins/db'
import { redisPlugin } from './plugins/redis'
import { natsPlugin } from './plugins/nats'
import { jwtPlugin } from './plugins/jwt'
import { registerRoutes } from './routes'

export async function buildApp() {
  const logger = createLogger('auth-service')
  const app = Fastify({ logger })

  await app.register(dbPlugin)
  await app.register(redisPlugin)
  await app.register(natsPlugin)
  await app.register(jwtPlugin)
  await registerRoutes(app)

  app.setErrorHandler((error, request, reply) => {
    if ('statusCode' in error) {
      return reply.status(error.statusCode as number).send({
        code: (error as any).code,
        message: error.message,
        details: (error as any).details,
      })
    }
    logger.error(error)
    return reply
      .status(500)
      .send({ code: 'GEN_002', message: 'Internal server error' })
  })

  return app
}
```

---

- [X] ### TASK 1-02 — Auth Routes & Service

**`src/routes/auth.ts` — endpoints:**

```
POST /auth/register        → create org + first super-admin user
POST /auth/login           → email + password → returns JWT + session
POST /auth/logout          → invalidates session token
GET  /auth/me              → returns current user + resolved permissions
POST /auth/refresh         → refresh JWT using session token
POST /auth/forgot-password → sends reset email
POST /auth/reset-password  → consumes reset token, sets new password
```

**`src/services/auth.service.ts` structure:**

```typescript
export class AuthService {
  // Register a new organization with first admin user
  async register(
    dto: RegisterDto
  ): Promise<{ user: User; org: Organization; token: string }>

  // Verify credentials, create session, return JWT
  async login(
    dto: LoginDto
  ): Promise<{ user: User; token: string; sessionId: string }>

  // Hash session token, store in Redis with TTL, invalidate on logout
  async logout(sessionId: string): Promise<void>

  // Decode JWT, load user+roles from DB, return full profile
  async getMe(userId: string): Promise<UserProfile>

  // Hash: bcrypt with 12 rounds
  async hashPassword(plain: string): Promise<string>
  async verifyPassword(plain: string, hash: string): Promise<boolean>
}
```

**JWT payload structure:**

```typescript
// Token contains: sub (userId), org (orgId), roles (roleId[])
// Stored in Redis: `session:{sessionId}` → userId, TTL = JWT_EXPIRES_IN
// On /auth/me: load full permissions by expanding role.permissions[]
```

---

- [X] ### TASK 1-03 — RBAC Engine

**`src/services/rbac.service.ts` — this is the core permission engine:**

```typescript
// Permission strings follow pattern: resource:action[:scope]
// Examples:
//   'project:read'
//   'project:deploy:production'
//   'org:manage'
//   'sandbox:create'
//   'pipeline:manage'

export class RbacService {
  // Check if userId has permission on a given resource
  async can(
    userId: string,
    permission: string,
    resourceType?: string,
    resourceId?: string
  ): Promise<boolean>

  // Load all permissions for a user (flattened from all their roles)
  async getPermissions(userId: string, orgId: string): Promise<string[]>

  // Assign role to user at resource scope
  async assignRole(dto: AssignRoleDto): Promise<void>

  // Revoke role from user
  async revokeRole(
    userId: string,
    roleId: string,
    resourceId?: string
  ): Promise<void>

  // Seed system roles (called once on first install)
  async seedSystemRoles(orgId: string): Promise<void>
}
```

**System roles and their permissions:**

```typescript
export const SYSTEM_ROLES = {
  SUPER_ADMIN: {
    name: 'super_admin',
    scope: 'platform',
    permissions: ['*'], // wildcard — all permissions
  },
  ORG_ADMIN: {
    name: 'org_admin',
    scope: 'org',
    permissions: [
      'org:read',
      'org:manage',
      'project:read',
      'project:create',
      'project:delete',
      'user:read',
      'user:invite',
      'user:remove',
      'role:assign',
      'sandbox:read',
      'deploy:read',
      'deploy:staging',
      'deploy:production',
    ],
  },
  PROJECT_MANAGER: {
    name: 'project_manager',
    scope: 'project',
    permissions: [
      'project:read',
      'issue:read',
      'issue:manage',
      'sprint:manage',
      'milestone:manage',
      'deploy:production',
      'monitor:team',
      'pipeline:read',
    ],
  },
  TECH_LEAD: {
    name: 'tech_lead',
    scope: 'project',
    permissions: [
      'project:read',
      'issue:read',
      'issue:manage',
      'code:read',
      'code:write',
      'code:merge',
      'pr:approve',
      'pipeline:manage',
      'deploy:staging',
      'deploy:production',
      'sandbox:create',
      'ai:agent',
    ],
  },
  DEVELOPER: {
    name: 'developer',
    scope: 'project',
    permissions: [
      'project:read',
      'issue:read',
      'issue:update',
      'code:read',
      'code:write',
      'pr:create',
      'pr:read',
      'pipeline:trigger',
      'deploy:staging',
      'sandbox:create',
      'ai:agent',
    ],
  },
  VIEWER: {
    name: 'viewer',
    scope: 'project',
    permissions: [
      'project:read',
      'issue:read',
      'code:read',
      'pr:read',
      'deploy:read',
    ],
  },
}
```

---

- [X] ### TASK 1-04 — Auth Middleware (used by all services)

**File:** `apps/auth-service/src/middleware/authenticate.ts`

```typescript
// This middleware is copied/shared to all other services
// It verifies the Authorization: Bearer <token> header
// and attaches request.user to the Fastify request

import { FastifyRequest, FastifyReply } from 'fastify'
import { UnauthorizedError } from '@devora/errors'

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    await request.jwtVerify()
    // request.user is now the JwtPayload
  } catch {
    throw new UnauthorizedError()
  }
}

// Permission guard factory — use as preHandler
export function requirePermission(
  permission: string,
  resourceIdParam?: string
) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    await authenticate(request, reply)
    const { sub: userId, org: orgId } = request.user as JwtPayload
    const resourceId = resourceIdParam
      ? (request.params as Record<string, string>)[resourceIdParam]
      : undefined
    const allowed = await rbacService.can(
      userId,
      permission,
      resourceIdParam,
      resourceId
    )
    if (!allowed) throw new ForbiddenError()
  }
}
```

---

- [X] ### TASK 1-05 — User & Org Routes

**`src/routes/users.ts` endpoints:**

```
GET    /orgs/:orgId/users              → list org members (requires org:read)
POST   /orgs/:orgId/users/invite       → invite by email (requires user:invite)
GET    /orgs/:orgId/users/:userId      → get user profile
PATCH  /orgs/:orgId/users/:userId      → update display name, avatar
DELETE /orgs/:orgId/users/:userId      → remove from org (requires user:remove)
```

**`src/routes/roles.ts` endpoints:**

```
GET    /orgs/:orgId/roles              → list available roles
POST   /orgs/:orgId/roles              → create custom role (requires role:manage)
PUT    /orgs/:orgId/roles/:roleId      → update custom role
DELETE /orgs/:orgId/roles/:roleId      → delete custom role (cannot delete system roles)
POST   /orgs/:orgId/users/:userId/roles → assign role to user
DELETE /orgs/:orgId/users/:userId/roles/:roleId → revoke role
```

---

- [X] ### TASK 1-06 — NATS Event Publishing (Auth Service)

**Add to auth service — publish events after successful operations:**

```typescript
// After user created:
publish(nc, Subjects.AUTH_USER_CREATED, {
  userId,
  orgId,
  email,
  username,
  createdAt,
})

// After role assigned:
publish(nc, Subjects.AUTH_ROLE_ASSIGNED, {
  userId,
  roleId,
  roleName,
  resourceType,
  resourceId,
  grantedBy,
})

// After user invited:
publish(nc, Subjects.AUTH_USER_INVITED, {
  email,
  orgId,
  invitedBy,
  expiresAt,
})
```

---

- [x] ### TASK 1-07 — Bootstrap `apps/gateway`

**Purpose:** Single entry point — validates JWT, routes to correct service.

**Files:**

```
apps/gateway/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts
    ├── app.ts
    ├── config.ts
    ├── plugins/
    │   └── proxy.ts      ← @fastify/http-proxy
    └── routes/
        └── index.ts      ← proxy route table
```

**`src/routes/index.ts` — proxy routing table:**

```typescript
// All requests authenticated at gateway level before proxying
// Route prefixes map to internal service URLs

const routes = [
  { prefix: '/api/auth', upstream: config.AUTH_SERVICE_URL },
  { prefix: '/api/projects', upstream: config.PROJECT_SERVICE_URL },
  { prefix: '/api/chat', upstream: config.CHAT_SERVICE_URL },
  { prefix: '/api/deploy', upstream: config.DEPLOY_SERVICE_URL },
  { prefix: '/api/monitor', upstream: config.MONITOR_SERVICE_URL },
  { prefix: '/api/sandbox', upstream: config.SANDBOX_SERVICE_URL },
  { prefix: '/api/notify', upstream: config.NOTIFY_SERVICE_URL },
]
```

**Gateway responsibilities:**

- Verify JWT on every request (except `/api/auth/login`, `/api/auth/register`)
- Forward `X-User-Id`, `X-Org-Id`, `X-User-Roles` headers to downstream services
- Rate limiting per user (100 req/min default, configurable)
- Request logging with correlation ID (`X-Request-Id`)

---

- [X] ### TASK 1-08 — Bootstrap `apps/portal` (React skeleton)

**Files to create:**

```
apps/portal/
├── package.json
├── vite.config.ts
├── tailwind.config.ts
├── index.html
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── router.tsx          ← TanStack Router
    ├── store/
    │   └── auth.store.ts   ← Zustand auth store
    ├── lib/
    │   ├── api.ts          ← axios instance with JWT interceptor
    │   └── queryClient.ts  ← React Query client
    ├── pages/
    │   ├── auth/
    │   │   ├── LoginPage.tsx
    │   │   ├── RegisterPage.tsx
    │   │   └── ForgotPasswordPage.tsx
    │   └── dashboard/
    │       └── DashboardPage.tsx   ← placeholder
    └── components/
        ├── ui/             ← base components (Button, Input, Card, etc.)
        └── layout/
            ├── AppShell.tsx
            ├── Sidebar.tsx
            └── TopBar.tsx
```

**`src/store/auth.store.ts`:**

```typescript
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { User, Organization } from '@devora/types'

interface AuthState {
  user: User | null
  org: Organization | null
  token: string | null
  permissions: string[]
  setAuth: (
    user: User,
    org: Organization,
    token: string,
    permissions: string[]
  ) => void
  clearAuth: () => void
  can: (permission: string) => boolean
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      org: null,
      token: null,
      permissions: [],
      setAuth: (user, org, token, permissions) =>
        set({ user, org, token, permissions }),
      clearAuth: () =>
        set({ user: null, org: null, token: null, permissions: [] }),
      can: (permission) => {
        const { permissions } = get()
        return permissions.includes('*') || permissions.includes(permission)
      },
    }),
    { name: 'devora-auth' }
  )
)
```

**`src/lib/api.ts`:**

```typescript
import axios from 'axios'
import { useAuthStore } from '../store/auth.store'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api',
})

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      useAuthStore.getState().clearAuth()
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)
```

**Login page structure:**

```typescript
// LoginPage.tsx
// - Email + password form
// - Calls POST /api/auth/login
// - On success: stores token in Zustand + localStorage
// - Redirects to /dashboard
// - Shows validation errors inline
// - "Forgot password" link
// - "Create organization" link → /register
```

---

- [X] ### TASK 1-09 — Auth Service Tests

**`src/__tests__/auth.test.ts` — test cases:**

```typescript
describe('POST /auth/register', () => {
  it('creates org and super-admin user')
  it('returns 409 if email already exists')
  it('returns 400 if required fields missing')
})

describe('POST /auth/login', () => {
  it('returns JWT token on valid credentials')
  it('returns 401 on wrong password')
  it('returns 401 on unknown email')
})

describe('GET /auth/me', () => {
  it('returns user profile with permissions')
  it('returns 401 without token')
  it('returns 401 with expired token')
})
```

**`src/__tests__/rbac.test.ts` — test cases:**

```typescript
describe('RbacService.can()', () => {
  it('super admin can do everything (wildcard)')
  it('developer can deploy to staging')
  it('developer cannot deploy to production')
  it('viewer cannot push code')
  it('expired role grant is not honoured')
  it('project-scoped role does not apply to other projects')
})
```

---

### Sprint 1 Acceptance Criteria

`POST /api/auth/register` creates org + user, returns JWT `POST /api/auth/login` returns valid JWT `GET /api/auth/me` returns user with resolved permissions array RBAC `can()` correctly enforces all system role permissions Gateway proxies requests to auth-service with user headers forwarded Portal login page renders, submits, stores token, redirects All auth service tests pass All RBAC tests pass DB migrations apply cleanly on fresh PostgreSQL

---

- [ ] ## SPRINT 2 — Sandbox Orchestration & Code Editor

**Duration:** 2 weeks
**Goal:** Each developer can open a browser-based VS Code IDE in an isolated container. Sandboxes persist across sessions. Resource limits enforced.

**Prerequisites:** Sprint 1 complete. Auth middleware working.

---

- [ ] ### TASK 2-01 — Bootstrap `apps/sandbox-service`

**Files:**

```
apps/sandbox-service/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts
    ├── app.ts
    ├── config.ts
    ├── plugins/
    │   ├── db.ts
    │   ├── nats.ts
    │   └── k8s.ts        ← @kubernetes/client-node
    ├── routes/
    │   ├── workspaces.ts
    │   └── proxy.ts      ← WebSocket proxy to sandbox pod
    ├── services/
    │   ├── workspace.service.ts
    │   ├── pod.service.ts       ← K8s pod operations
    │   └── volume.service.ts    ← PVC management
    └── k8s/
        ├── workspace-pod.template.ts   ← Pod spec generator
        └── workspace-pvc.template.ts   ← PVC spec generator
```

---

- [ ] ### TASK 2-02 — Kubernetes Pod Templates

**`src/k8s/workspace-pod.template.ts`:**

```typescript
import { V1Pod } from '@kubernetes/client-node'

export interface WorkspacePodOptions {
  podName: string
  userId: string
  orgId: string
  volumeName: string
  cpuLimit: string // e.g. '2'
  memoryLimit: string // e.g. '2Gi'
  ollamaUrl: string
  platformApiUrl: string
}

export function buildWorkspacePod(opts: WorkspacePodOptions): V1Pod {
  return {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: {
      name: opts.podName,
      namespace: 'devora-sandboxes',
      labels: {
        app: 'devora-workspace',
        'devora/user-id': opts.userId,
        'devora/org-id': opts.orgId,
      },
    },
    spec: {
      // Schedule only on nodes labelled node-role=sandbox
      nodeSelector: { 'node-role': 'sandbox' },
      securityContext: { runAsUser: 1000, runAsGroup: 1000, fsGroup: 1000 },
      containers: [
        {
          name: 'workspace',
          image: 'devora/workspace:latest',
          ports: [{ containerPort: 8080, name: 'ide' }],
          resources: {
            limits: { cpu: opts.cpuLimit, memory: opts.memoryLimit },
            requests: { cpu: '100m', memory: '256Mi' },
          },
          securityContext: {
            allowPrivilegeEscalation: false,
            readOnlyRootFilesystem: false, // code-server needs writable fs
            runAsNonRoot: true,
            seccompProfile: { type: 'RuntimeDefault' },
          },
          volumeMounts: [
            {
              name: 'workspace-data',
              mountPath: '/workspace',
            },
          ],
          env: [
            { name: 'OLLAMA_URL', value: opts.ollamaUrl },
            { name: 'PLATFORM_API', value: opts.platformApiUrl },
            { name: 'DEVORA_USER_ID', value: opts.userId },
            { name: 'DEVORA_ORG_ID', value: opts.orgId },
          ],
          readinessProbe: {
            httpGet: { path: '/healthz', port: 8080 },
            initialDelaySeconds: 5,
            periodSeconds: 5,
          },
        },
      ],
      volumes: [
        {
          name: 'workspace-data',
          persistentVolumeClaim: { claimName: opts.volumeName },
        },
      ],
    },
  }
}
```

**`src/k8s/workspace-pvc.template.ts`:**

```typescript
import { V1PersistentVolumeClaim } from '@kubernetes/client-node'

export function buildWorkspacePVC(
  pvcName: string,
  storageSize: string = '10Gi'
): V1PersistentVolumeClaim {
  return {
    apiVersion: 'v1',
    kind: 'PersistentVolumeClaim',
    metadata: {
      name: pvcName,
      namespace: 'devora-sandboxes',
    },
    spec: {
      accessModes: ['ReadWriteOnce'],
      storageClassName: 'platform-fast', // NVMe-backed StorageClass
      resources: { requests: { storage: storageSize } },
    },
  }
}
```

---

- [ ] ### TASK 2-03 — Workspace Service

**`src/services/workspace.service.ts` — core logic:**

```typescript
export class WorkspaceService {
  // Called when developer opens IDE — idempotent
  async getOrCreate(
    userId: string,
    orgId: string,
    projectId?: string
  ): Promise<WorkspaceSession>
  // 1. Check DB for existing workspace record
  // 2. If none: create PVC, create workspace DB record
  // 3. Check if pod is Running
  // 4. If not Running: create/restart pod
  // 5. Wait for pod Ready (poll readinessProbe, max 30s)
  // 6. Return { podName, proxyUrl }

  async stop(workspaceId: string): Promise<void>
  // Deletes the pod (keeps PVC — data preserved)
  // Updates workspace.status = 'stopped'

  async delete(workspaceId: string): Promise<void>
  // Deletes pod AND PVC (irreversible)

  async list(userId: string): Promise<Workspace[]>

  // Called by monitor service — auto-stop idle sandboxes
  async stopIdle(idleThresholdMinutes: number): Promise<number>
  // Finds workspaces where lastActiveAt < now - threshold
  // Stops their pods, publishes SANDBOX_STOPPED event
}
```

---

- [ ] ### TASK 2-04 — Workspace Routes

**`src/routes/workspaces.ts` endpoints:**

```
POST /workspaces                 → getOrCreate workspace, returns proxyUrl
GET  /workspaces                 → list user's workspaces
GET  /workspaces/:id             → get workspace status
POST /workspaces/:id/stop        → stop pod (keep data)
DELETE /workspaces/:id           → delete workspace + data
GET  /workspaces/:id/logs        → stream pod logs (SSE)
```

**`src/routes/proxy.ts` — WebSocket proxy:**

```typescript
// Route: GET /workspaces/:id/connect
// 1. Verify user owns workspace (auth check)
// 2. Look up pod IP + port 8080 in K8s
// 3. Upgrade connection to WebSocket
// 4. Proxy all WS frames bidirectionally to pod
// This allows Traefik to route /ide/:workspaceId → sandbox-service → pod
```

---

- [ ] ### TASK 2-05 — Workspace Docker Image

**File:** `apps/sandbox-service/workspace-image/Dockerfile`

```dockerfile
FROM codercom/code-server:4.20.0

USER root

# Install common development tools
RUN apt-get update && apt-get install -y \
    git curl wget unzip \
    build-essential \
    python3 python3-pip \
    nodejs npm \
    && rm -rf /var/lib/apt/lists/*

# Install nvm for Node version management
RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash

# Install Rust
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y

# Copy AI agent binary
COPY ai-agent /usr/local/bin/devora-agent

# Health check endpoint
COPY healthz.sh /usr/local/bin/healthz
RUN chmod +x /usr/local/bin/healthz

USER coder

# code-server config
RUN mkdir -p /home/coder/.config/code-server
COPY config.yaml /home/coder/.config/code-server/config.yaml

EXPOSE 8080

CMD ["code-server", "--bind-addr", "0.0.0.0:8080", "/workspace"]
```

---

- [ ] ### TASK 2-06 — AI Agent Sidecar (Node.js process inside workspace)

**File:** `apps/sandbox-service/ai-agent/src/index.ts`

```typescript
// Runs as a background process inside the workspace container
// Exposes HTTP on :9090 — called by code-server extension

import Fastify from 'fastify'

const app = Fastify()

// Autocomplete — fast, uses small model
app.post('/complete', async (req) => {
  const { prefix, suffix, language } = req.body as CompletionRequest
  const response = await callOllama({
    model: process.env.AUTOCOMPLETE_MODEL ?? 'qwen2.5-coder:1.5b',
    prompt: buildFimPrompt(prefix, suffix, language),
    stream: false,
  })
  return { completion: response.text }
})

// Chat — full context, uses larger model
app.post('/chat', async (req) => {
  const { messages, context } = req.body as ChatRequest
  const systemPrompt = buildSystemPrompt(context)
  return streamOllamaChat(systemPrompt, messages) // SSE stream
})

// Agent action — read file, run command, apply patch
app.post('/agent/action', async (req) => {
  const { action, args } = req.body as AgentActionRequest
  // Actions: read_file, write_file, run_command, list_files, search_code
  // All constrained to /workspace directory
  return executeAgentAction(action, args)
})

// Context — build RAG context for current file
app.get('/context', async (req) => {
  const { filePath, cursorLine } = req.query as ContextRequest
  return buildFileContext(filePath, cursorLine)
})

app.listen({ port: 9090, host: '127.0.0.1' })
```

---

- [ ] ### TASK 2-07 — IDE Portal View

**Files:**

```
apps/portal/src/pages/ide/
├── IdePage.tsx           ← main IDE page
├── WorkspaceLoader.tsx   ← spinner while pod starts
└── IdeFrame.tsx          ← iframe embedding code-server
```

**`IdePage.tsx` logic:**

```typescript
// 1. On mount: call POST /api/sandbox/workspaces
// 2. Poll GET /api/sandbox/workspaces/:id until status === 'running'
// 3. Show WorkspaceLoader (with status messages) during startup
// 4. Once running: render IdeFrame with proxyUrl
// 5. Handle pod stop/restart gracefully
// 6. Heartbeat: POST /api/sandbox/workspaces/:id/heartbeat every 60s
//    (keeps sandbox alive, updates lastActiveAt)
```

**`IdeFrame.tsx`:**

```typescript
// <iframe src={proxyUrl} style={{ width: '100%', height: '100vh', border: 'none' }} />
// Allow: clipboard-read; clipboard-write
// sandbox attribute: allow-scripts allow-same-origin allow-forms allow-popups
```

---

- [ ] ### TASK 2-08 — Sandbox NATS Events

```typescript
// After workspace created:
publish(nc, Subjects.SANDBOX_CREATED, { workspaceId, userId, orgId })

// After workspace stopped:
publish(nc, Subjects.SANDBOX_STOPPED, {
  workspaceId,
  userId,
  reason: 'manual' | 'idle',
})

// When resource spike detected (>90% CPU or RAM for >5 minutes):
publish(nc, Subjects.SANDBOX_RESOURCE_SPIKE, {
  workspaceId,
  userId,
  orgId,
  cpu: cpuPercent,
  memory: memoryMb,
})
```

---

### Sprint 2 Acceptance Criteria

`POST /api/sandbox/workspaces` creates pod in K8s within 30 seconds Second call returns existing running workspace (idempotent) Pod stops but PVC preserved on `POST /stop` Re-starting a stopped workspace reattaches existing PVC Portal IDE page shows loader, then renders code-server iframe Heartbeat keeps workspace alive while IDE is open Idle workspaces (no heartbeat for 30 min) auto-stop Sandbox pods cannot reach each other (network policy verified) AI agent responds to `/complete` within 500ms (small model)

---

- [ ] ## SPRINT 3 — Chat Service & Notification Engine

**Duration:** 2 weeks
**Goal:** Full real-time team messaging with channels, DMs, threads. Unified notification engine receiving all platform events.

**Prerequisites:** Sprint 1 complete. NATS running.

---

- [ ] ### TASK 3-01 — Bootstrap `apps/chat-service`

**Files:**

```
apps/chat-service/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts
    ├── app.ts
    ├── config.ts
    ├── plugins/
    │   ├── db.ts
    │   ├── redis.ts       ← presence, typing, unread counts
    │   ├── nats.ts
    │   └── socket.ts      ← Socket.io setup
    ├── routes/
    │   ├── channels.ts
    │   └── messages.ts
    ├── services/
    │   ├── channel.service.ts
    │   ├── message.service.ts
    │   ├── presence.service.ts    ← Redis-based online/offline
    │   └── mention.service.ts     ← @mention detection + event emit
    ├── socket/
    │   ├── index.ts               ← Socket.io server init
    │   ├── handlers/
    │   │   ├── connection.handler.ts
    │   │   ├── message.handler.ts
    │   │   ├── typing.handler.ts
    │   │   └── presence.handler.ts
    │   └── middleware/
    │       └── auth.middleware.ts  ← validate JWT on WS connection
    └── subscribers/
        └── platform-events.ts     ← NATS subscriber for deploy/build cards
```

---

- [ ] ### TASK 3-02 — Socket.io Server & Authentication

**`src/socket/index.ts`:**

```typescript
import { Server } from 'socket.io'
import { verifyJwt } from '../lib/jwt'

export function initSocketServer(httpServer: any) {
  const io = new Server(httpServer, {
    cors: { origin: process.env.PORTAL_URL, credentials: true },
    transports: ['websocket', 'polling'],
  })

  // Auth middleware — verify token before connection accepted
  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token
    if (!token) return next(new Error('No token'))
    try {
      socket.data.user = await verifyJwt(token)
      next()
    } catch {
      next(new Error('Invalid token'))
    }
  })

  io.on('connection', handleConnection(io))
  return io
}
```

**`src/socket/handlers/connection.handler.ts`:**

```typescript
export function handleConnection(io: Server) {
  return async (socket: Socket) => {
    const { sub: userId, org: orgId } = socket.data.user

    // Auto-join org room and all user's channel rooms
    socket.join(`org:${orgId}`)
    const channels = await channelService.getUserChannels(userId, orgId)
    for (const ch of channels) socket.join(`channel:${ch.id}`)

    // Mark user online in Redis
    await presenceService.setOnline(userId, orgId)
    io.to(`org:${orgId}`).emit('ws:presence_update', {
      userId,
      status: 'online',
    })

    // Register event handlers
    socket.on('ws:send_message', messageHandler(io, socket))
    socket.on('ws:typing', typingHandler(io, socket))
    socket.on('ws:react', reactHandler(io, socket))
    socket.on('ws:mark_read', markReadHandler(io, socket))
    socket.on('ws:join_channel', joinChannelHandler(io, socket))

    socket.on('disconnect', async () => {
      await presenceService.setOffline(userId, orgId)
      io.to(`org:${orgId}`).emit('ws:presence_update', {
        userId,
        status: 'offline',
      })
    })
  }
}
```

---

- [ ] ### TASK 3-03 — Message Handler

**`src/socket/handlers/message.handler.ts`:**

```typescript
export function messageHandler(io: Server, socket: Socket) {
  return async (data: SendMessageEvent) => {
    const { sub: userId } = socket.data.user

    // 1. Validate user is member of channel
    const isMember = await channelService.isMember(data.channelId, userId)
    if (!isMember)
      return socket.emit('ws:error', {
        code: 'CHAT_001',
        message: 'Not a channel member',
      })

    // 2. Save message to PostgreSQL
    const message = await messageService.create({
      channelId: data.channelId,
      threadId: data.threadId,
      authorId: userId,
      content: data.content,
      contentType: 'markdown',
      contextRef: data.contextRef,
    })

    // 3. Detect and extract @mentions
    const mentions = extractMentions(data.content)
    if (mentions.length > 0) {
      await messageService.updateMentions(message.id, mentions)
      // Emit NATS event for notification service to process
      publish(nc, Subjects.CHAT_MENTION_DETECTED, {
        messageId: message.id,
        channelId: data.channelId,
        authorId: userId,
        mentions,
      })
    }

    // 4. Broadcast to all channel members
    io.to(`channel:${data.channelId}`).emit('ws:new_message', { message })

    // 5. Publish to NATS
    publish(nc, Subjects.CHAT_MESSAGE_CREATED, {
      messageId: message.id,
      channelId: data.channelId,
      authorId: userId,
    })
  }
}
```

---

- [ ] ### TASK 3-04 — Typing & Presence

**`src/services/presence.service.ts`:**

```typescript
export class PresenceService {
  // Redis key: presence:{orgId}:{userId} = 'online' | 'away', TTL 90s
  async setOnline(userId: string, orgId: string): Promise<void>
  async setOffline(userId: string, orgId: string): Promise<void>
  async getOrgPresence(
    orgId: string
  ): Promise<Record<string, 'online' | 'offline' | 'away'>>

  // Typing indicator: key expires after 2s automatically
  async setTyping(userId: string, channelId: string): Promise<void>
  // Redis key: typing:{channelId}:{userId} = '1', TTL 2s
}
```

---

- [ ] ### TASK 3-05 — Channel & Message HTTP Routes

**`src/routes/channels.ts`:**

```
GET    /channels                   → list user's accessible channels
POST   /channels                   → create channel (public/private)
GET    /channels/:id               → channel detail + member list
PATCH  /channels/:id               → update name, description
DELETE /channels/:id               → archive channel
POST   /channels/:id/members       → add member
DELETE /channels/:id/members/:uid  → remove member
```

**`src/routes/messages.ts`:**

```
GET    /channels/:id/messages      → paginated message history (cursor-based)
POST   /channels/:id/messages      → send via HTTP (alternative to WS)
PATCH  /messages/:id               → edit message (author only, within 15 min)
DELETE /messages/:id               → soft-delete message
GET    /messages/:id/thread        → get thread replies
POST   /channels/search            → full-text search across channels user can access
```

---

- [ ] ### TASK 3-06 — Platform Event Cards (NATS → Chat)

**`src/subscribers/platform-events.ts`:**

```typescript
// This subscriber listens to deploy and build events
// and posts automated cards to the relevant project channel

subscribe(nc, Subjects.DEPLOY_SUCCEEDED, async (data) => {
  const channel = await channelService.getProjectChannel(data.projectId)
  if (!channel) return
  await messageService.create({
    channelId: channel.id,
    authorId: SYSTEM_USER_ID,
    content: '',
    contentType: 'card',
    contextRef: { type: 'deploy', id: data.deploymentId },
  })
  io.to(`channel:${channel.id}`).emit('ws:deploy_card', {
    deploymentId: data.deploymentId,
    status: 'succeeded',
    commitSha: data.commitSha,
    triggeredBy: data.triggeredBy,
  })
})

subscribe(nc, Subjects.DEPLOY_FAILED, async (data) => {
  // Same as above but with status 'failed' + failureReason
})

subscribe(nc, Subjects.PROJECT_PIPELINE_PASSED, async (data) => {
  // Post build success card to project channel
})

subscribe(nc, Subjects.PROJECT_PIPELINE_FAILED, async (data) => {
  // Post build failure card with link to logs
})
```

---

- [ ] ### TASK 3-07 — Portal Chat UI

**Files:**

```
apps/portal/src/pages/chat/
├── ChatPage.tsx             ← layout: sidebar + message pane
├── ChannelList.tsx          ← left sidebar, org channels + DMs
├── MessagePane.tsx          ← message list + input
├── MessageItem.tsx          ← single message, renders markdown
├── MessageInput.tsx         ← textarea with @mention autocomplete
├── ThreadPanel.tsx          ← right panel for thread replies
├── PresenceDot.tsx          ← online/offline indicator
└── DeployCard.tsx           ← special render for deployment cards
```

**Socket.io client setup:**

```typescript
// src/lib/socket.ts
import { io, Socket } from 'socket.io-client'
import { useAuthStore } from '../store/auth.store'

let socket: Socket | null = null

export function getSocket(): Socket {
  if (!socket) {
    const token = useAuthStore.getState().token
    socket = io(import.meta.env.VITE_CHAT_URL, {
      auth: { token },
      transports: ['websocket'],
    })
  }
  return socket
}
```

**Zustand chat store structure:**

```typescript
// src/store/chat.store.ts
interface ChatState {
  channels: Channel[]
  activeChannelId: string | null
  messages: Record<string, Message[]> // channelId → messages[]
  unreadCounts: Record<string, number> // channelId → count
  presence: Record<string, 'online' | 'offline'>
  typingUsers: Record<string, string[]> // channelId → userId[]
  // Actions
  setActiveChannel: (id: string) => void
  addMessage: (channelId: string, message: Message) => void
  setPresence: (userId: string, status: 'online' | 'offline') => void
  setTyping: (channelId: string, userId: string) => void
}
```

---

- [ ] ### TASK 3-08 — Bootstrap `apps/notification-service`

**Files:**

```
apps/notification-service/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts
    ├── app.ts
    ├── config.ts
    ├── plugins/
    │   ├── db.ts
    │   └── nats.ts
    ├── routes/
    │   └── notifications.ts
    ├── services/
    │   ├── notification.service.ts
    │   └── delivery.service.ts      ← in-app + email delivery
    └── subscribers/
        └── all-events.ts            ← subscribes to ALL platform NATS events
```

**`src/subscribers/all-events.ts` — every event creates notifications:**

```typescript
// Map from NATS subject → notification creation logic

const handlers: Record<string, NotificationHandler> = {
  [Subjects.PROJECT_PIPELINE_FAILED]: async (data) => {
    await notificationService.create({
      userId: data.triggerActor,
      orgId: data.orgId,
      type: 'build_failed',
      title: 'Build failed',
      body: `Pipeline "${data.pipelineName}" failed on ${data.branch}`,
      actionUrl: `/projects/${data.projectId}/pipelines/${data.runId}`,
      sourceType: 'pipeline',
      sourceId: data.runId,
    })
  },
  [Subjects.DEPLOY_APPROVAL_REQUIRED]: async (data) => {
    // Notify all users with deploy:production permission on the project
    const approvers = await getProjectApprovers(data.projectId)
    for (const userId of approvers) {
      await notificationService.create({
        userId,
        orgId: data.orgId,
        type: 'deploy_approval',
        title: 'Production deployment awaiting approval',
        body: `${data.appName} v${data.version} needs your approval`,
        actionUrl: `/deploy/${data.deploymentId}/approve`,
        sourceType: 'deployment',
        sourceId: data.deploymentId,
      })
    }
  },
  [Subjects.CHAT_MENTION_DETECTED]: async (data) => {
    for (const mentionedUserId of data.mentions) {
      await notificationService.create({
        userId: mentionedUserId,
        orgId: data.orgId,
        type: 'mention',
        title: 'You were mentioned',
        body: `In #${data.channelName}`,
        actionUrl: `/chat/${data.channelId}?msg=${data.messageId}`,
        sourceType: 'chat',
        sourceId: data.messageId,
      })
    }
  },
  // ... all other subjects mapped similarly
}

// Subscribe to all subjects
for (const [subject, handler] of Object.entries(handlers)) {
  subscribe(nc, subject, handler)
}
```

**Notification routes:**

```
GET    /notifications              → paginated list for current user
PATCH  /notifications/:id/read    → mark as read
POST   /notifications/read-all    → mark all as read
GET    /notifications/unread-count → count for badge
DELETE /notifications/:id          → dismiss
```

---

- [ ] ### TASK 3-09 — Portal Notification Center

**Files:**

```
apps/portal/src/components/notifications/
├── NotificationBell.tsx       ← top bar icon with unread badge count
├── NotificationPanel.tsx      ← slide-out panel, grouped by type
├── NotificationItem.tsx       ← single notification row
└── useNotifications.ts        ← React Query hook
```

**Real-time updates:**

```typescript
// When ws:notification arrives via Socket.io:
// 1. Add to Zustand notifications store
// 2. Increment unread badge count
// 3. Show toast for high-priority types (deploy_failed, mention)
```

---

### Sprint 3 Acceptance Criteria

Developer can send message to channel, all members receive it in real-time Typing indicator appears for other users and auto-clears after 2 seconds @mention in a message creates a notification for the mentioned user Failed build posts a card to the project channel automatically Successful deployment posts a card to the project channel Notification bell shows unread count, panel lists all notifications Marking notification read updates the badge count immediately User presence (online/offline) visible in channel member list

---

- [ ] ## SPRINT 4 — Project Management

**Duration:** 2 weeks
**Goal:** Full project management suite — Git repositories (Gitea-backed), issues, milestones, kanban board, sprint management.

**Prerequisites:** Sprint 1 complete. Gitea running (add to dev docker-compose).

---

- [ ] ### TASK 4-01 — Add Gitea to Dev Infrastructure

**Add to `infra/compose/dev.yml`:**

```yaml
gitea:
  image: gitea/gitea:1.21-rootless
  environment:
    GITEA__database__DB_TYPE: postgres
    GITEA__database__HOST: postgres-gitea:5432
    GITEA__database__NAME: gitea
    GITEA__database__USER: devora
    GITEA__database__PASSWD: devora_dev
    GITEA__server__DOMAIN: localhost
    GITEA__server__HTTP_PORT: 3001
    GITEA__server__ROOT_URL: http://localhost:3001
  ports: ['3001:3001']
  volumes: ['gitea_data:/var/lib/gitea']
  depends_on: [postgres-gitea]

postgres-gitea:
  image: postgres:16-alpine
  environment:
    POSTGRES_DB: gitea
    POSTGRES_USER: devora
    POSTGRES_PASSWORD: devora_dev
  volumes: ['postgres_gitea:/var/lib/postgresql/data']
```

---

- [ ] ### TASK 4-02 — Bootstrap `apps/project-service`

**Files:**

```
apps/project-service/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts
    ├── app.ts
    ├── config.ts
    ├── plugins/
    │   ├── db.ts
    │   ├── nats.ts
    │   └── gitea.ts          ← Gitea API client
    ├── routes/
    │   ├── projects.ts
    │   ├── issues.ts
    │   ├── milestones.ts
    │   ├── labels.ts
    │   └── sprints.ts
    ├── services/
    │   ├── project.service.ts
    │   ├── issue.service.ts
    │   ├── milestone.service.ts
    │   ├── sprint.service.ts
    │   └── gitea.service.ts   ← wraps Gitea REST API
    └── __tests__/
        ├── project.test.ts
        └── issue.test.ts
```

---

- [ ] ### TASK 4-03 — Gitea Integration Service

**`src/services/gitea.service.ts`:**

```typescript
// Wraps Gitea's REST API v1
// All Gitea operations go through this service — never direct from routes

export class GiteaService {
  private baseUrl: string
  private adminToken: string

  // Create a Gitea org (mirrors Devora org creation)
  async createOrg(slug: string, name: string): Promise<GiteaOrg>

  // Create a repo under a Gitea org (mirrors Devora project creation)
  async createRepo(
    orgSlug: string,
    repoName: string,
    opts: RepoOptions
  ): Promise<GiteaRepo>

  // Create a user account in Gitea (mirrors Devora user creation)
  async createUser(
    username: string,
    email: string,
    password: string
  ): Promise<GiteaUser>

  // Add user to Gitea team/repo with appropriate permissions
  async addCollaborator(
    orgSlug: string,
    repoName: string,
    username: string,
    permission: 'read' | 'write' | 'admin'
  ): Promise<void>

  // Get branches, commits, file tree — used by portal code browser
  async getBranches(orgSlug: string, repoName: string): Promise<GitBranch[]>
  async getCommits(
    orgSlug: string,
    repoName: string,
    branch: string,
    page: number
  ): Promise<GitCommit[]>
  async getFileTree(
    orgSlug: string,
    repoName: string,
    branch: string,
    path: string
  ): Promise<FileTreeEntry[]>
  async getFileContent(
    orgSlug: string,
    repoName: string,
    branch: string,
    filePath: string
  ): Promise<string>

  // Webhooks — register Devora as webhook receiver for push/PR events
  async registerWebhook(
    orgSlug: string,
    repoName: string,
    webhookUrl: string
  ): Promise<void>
}
```

---

- [ ] ### TASK 4-04 — Project Service (CRUD + Gitea sync)

**`src/services/project.service.ts`:**

```typescript
export class ProjectService {
  async create(dto: CreateProjectDto, createdBy: string): Promise<Project>
  // 1. Create DB record in projects table
  // 2. Call giteaService.createRepo(orgSlug, dto.slug)
  // 3. Store gitea_repo_id on project record
  // 4. Register webhook: POST /gitea-webhook → project-service
  // 5. Create default project channel in chat (via NATS event)
  // 6. Publish PROJECT_CREATED event

  async get(projectId: string): Promise<Project>
  async list(orgId: string, userId: string): Promise<Project[]>
  async update(projectId: string, dto: UpdateProjectDto): Promise<Project>
  async archive(projectId: string): Promise<void>
  async delete(projectId: string): Promise<void>
  // Deletes Gitea repo + DB record
}
```

**Project routes (`src/routes/projects.ts`):**

```
POST   /projects                     → create project
GET    /projects                     → list org projects
GET    /projects/:id                 → get project detail
PATCH  /projects/:id                 → update project
DELETE /projects/:id                 → delete project
POST   /projects/:id/members         → add member with role
DELETE /projects/:id/members/:uid    → remove member
GET    /projects/:id/activity        → recent activity feed
POST   /gitea-webhook                → receive Gitea push/PR webhooks
```

---

- [ ] ### TASK 4-05 — Issue Service & Routes

**`src/services/issue.service.ts`:**

```typescript
export class IssueService {
  async create(dto: CreateIssueDto, createdBy: string): Promise<Issue>
  // Auto-assigns sequential number per project
  // Publishes PROJECT_ISSUE_CREATED

  async update(
    issueId: string,
    dto: UpdateIssueDto,
    updatedBy: string
  ): Promise<Issue>
  // Publishes PROJECT_ISSUE_UPDATED

  async close(issueId: string, closedBy: string): Promise<Issue>
  // Sets status = 'closed', closedAt, closedBy
  // Publishes PROJECT_ISSUE_CLOSED

  async list(
    projectId: string,
    filters: IssueFilters
  ): Promise<PaginatedResult<Issue>>
  // Filters: status, assignee, label, milestone, type, priority, sprint

  async get(issueId: string): Promise<Issue>
  async addComment(
    issueId: string,
    body: string,
    authorId: string
  ): Promise<IssueComment>
  async linkTopr(issueId: string, prId: string): Promise<void>
  async bulkUpdate(issueIds: string[], dto: BulkUpdateDto): Promise<void>
  // Used by kanban drag-and-drop
}
```

**Issue routes:**

```
POST   /projects/:id/issues          → create issue
GET    /projects/:id/issues          → list with filters + pagination
GET    /projects/:id/issues/:num     → get by project-scoped number
PATCH  /projects/:id/issues/:num     → update
POST   /projects/:id/issues/:num/close
POST   /projects/:id/issues/:num/comments
GET    /projects/:id/issues/:num/comments
POST   /projects/:id/issues/bulk     → bulk update (kanban moves)
```

---

- [ ] ### TASK 4-06 — Milestone & Sprint Service

**`src/services/sprint.service.ts`:**

```typescript
// Sprints are time-boxed containers for issues
export class SprintService {
  async create(dto: CreateSprintDto): Promise<Sprint>
  async start(sprintId: string): Promise<Sprint>
  async complete(sprintId: string): Promise<SprintCompletionReport>
  // Moves unfinished issues to backlog or next sprint
  async list(projectId: string): Promise<Sprint[]>
  async getVelocity(projectId: string, lastN: number): Promise<SprintVelocity[]>
  // Returns issues closed per sprint for velocity chart
}
```

**Sprint DB schema addition (`packages/db/src/schema/project.ts`):**

```typescript
export const sprints = pgTable('sprints', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .references(() => projects.id)
    .notNull(),
  name: text('name').notNull(),
  goal: text('goal'),
  status: text('status').default('planning').notNull(), // planning|active|completed
  startDate: date('start_date'),
  endDate: date('end_date'),
  createdBy: uuid('created_by').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const sprintIssues = pgTable('sprint_issues', {
  sprintId: uuid('sprint_id')
    .references(() => sprints.id)
    .notNull(),
  issueId: uuid('issue_id')
    .references(() => issues.id)
    .notNull(),
  addedAt: timestamp('added_at').defaultNow().notNull(),
})
```

---

- [ ] ### TASK 4-07 — Portal Project Management UI

**Files:**

```
apps/portal/src/pages/projects/
├── ProjectsPage.tsx         ← org project list
├── NewProjectPage.tsx       ← create project form
└── [projectId]/
    ├── ProjectLayout.tsx    ← sidebar nav for project
    ├── OverviewPage.tsx     ← readme + recent activity
    ├── IssuesPage.tsx       ← filterable issue list
    ├── IssuePage.tsx        ← single issue detail + comments
    ├── NewIssuePage.tsx
    ├── BoardPage.tsx        ← kanban board
    ├── BacklogPage.tsx      ← sprint backlog view
    ├── MilestonesPage.tsx
    └── SprintsPage.tsx
```

**`BoardPage.tsx` — kanban structure:**

```typescript
// Columns: Backlog | To Do | In Progress | In Review | Done
// Each column shows issues filtered by status
// Drag-and-drop: @dnd-kit/core
// On drop: PATCH /projects/:id/issues/bulk with new status
// Swimlanes: optionally group by assignee or milestone
// Issue card: title, priority badge, assignee avatar, labels
```

**`IssuesPage.tsx` filters:**

```typescript
// URL-based filters (shareable links):
// ?status=open&assignee=me&priority=high&sprint=current&type=bug
// Filter bar at top: status toggle, assignee multi-select, label picker
// Sort: created_at, updated_at, priority, due_date
// View toggle: list | board
```

---

### Sprint 4 Acceptance Criteria

Creating a project creates a Gitea repo automatically Project webhook receives Gitea push events Issues can be created, assigned, labelled, and closed Kanban board drag-and-drop updates issue status Sprint can be created, issues added, sprint started/completed Milestones show progress percentage based on closed issues Project activity feed shows recent commits + issue changes

---

- [ ] ## SPRINT 5 — Pull Requests & CI/CD Pipelines

**Duration:** 2 weeks
**Goal:** Complete pull request workflow with code review. CI/CD pipeline execution with real-time log streaming.

**Prerequisites:** Sprint 4 complete. Gitea webhooks working.

---

- [ ] ### TASK 5-01 — Pull Request Service

**Add to `apps/project-service/src/services/`:**

**`pr.service.ts`:**

```typescript
export class PrService {
  async create(dto: CreatePrDto, authorId: string): Promise<PullRequest>
  // 1. Create PR in Gitea (via giteaService)
  // 2. Create DB record
  // 3. Auto-link issues mentioned in PR body (#123 syntax)
  // 4. Publish PROJECT_PR_OPENED
  // 5. Trigger AI review if enabled (post to agent queue)

  async requestReview(prId: string, reviewerIds: string[]): Promise<void>
  // Creates review_requests records
  // Publishes CHAT_MENTION for each reviewer (triggers notification)

  async submitReview(
    prId: string,
    dto: ReviewDto,
    reviewerId: string
  ): Promise<Review>
  // Review types: 'approve' | 'request_changes' | 'comment'
  // If approved and branch protection satisfied → unlock merge button

  async merge(
    prId: string,
    mergedBy: string,
    strategy: 'merge' | 'squash' | 'rebase'
  ): Promise<void>
  // 1. Call Gitea merge API
  // 2. Update DB: status = 'merged', mergedBy, mergedAt
  // 3. Auto-close linked issues
  // 4. Publish PROJECT_PR_MERGED
  // 5. If pipeline auto-deploy configured → trigger deploy

  async addComment(
    prId: string,
    dto: PrCommentDto,
    authorId: string
  ): Promise<PrComment>
  async getDiff(prId: string): Promise<DiffResult>
  // Fetches diff from Gitea API
}
```

**Add DB schemas (`packages/db/src/schema/project.ts`):**

```typescript
export const prReviews = pgTable('pr_reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  prId: uuid('pr_id')
    .references(() => pullRequests.id)
    .notNull(),
  reviewerId: uuid('reviewer_id').notNull(),
  type: text('type').notNull(), // approve | request_changes | comment
  body: text('body'),
  submittedAt: timestamp('submitted_at').defaultNow().notNull(),
})

export const prComments = pgTable('pr_comments', {
  id: uuid('id').primaryKey().defaultRandom(),
  prId: uuid('pr_id')
    .references(() => pullRequests.id)
    .notNull(),
  authorId: uuid('author_id').notNull(),
  body: text('body').notNull(),
  filePath: text('file_path'),
  lineNumber: integer('line_number'),
  commitSha: text('commit_sha'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  editedAt: timestamp('edited_at'),
})
```

---

- [ ] ### TASK 5-02 — PR Routes

**Add to `apps/project-service/src/routes/`:**

**`prs.ts`:**

```
POST   /projects/:id/prs                    → create PR
GET    /projects/:id/prs                    → list PRs (filters: status, author, reviewer)
GET    /projects/:id/prs/:num               → PR detail
PATCH  /projects/:id/prs/:num               → update title/body
POST   /projects/:id/prs/:num/reviews       → submit review
POST   /projects/:id/prs/:num/merge         → merge PR
POST   /projects/:id/prs/:num/close         → close without merging
GET    /projects/:id/prs/:num/diff          → get unified diff
POST   /projects/:id/prs/:num/comments      → add comment (general or inline)
GET    /projects/:id/prs/:num/comments      → list comments
PATCH  /projects/:id/prs/:num/comments/:cid → edit comment
POST   /projects/:id/prs/:num/reviewers     → request reviewers
```

---

- [ ] ### TASK 5-03 — Portal PR UI

**Files:**

```
apps/portal/src/pages/projects/[projectId]/prs/
├── PrsPage.tsx           ← PR list with filters
├── NewPrPage.tsx         ← branch select, title, description, reviewers
└── [prNum]/
    ├── PrPage.tsx        ← PR overview, status, reviewers, checks
    ├── DiffViewer.tsx    ← unified diff with inline comment support
    ├── ReviewPanel.tsx   ← submit review (approve/request changes)
    └── CommitList.tsx    ← list of commits in PR
```

**`DiffViewer.tsx` requirements:**

```typescript
// Use 'react-diff-viewer-continued' or custom implementation
// Features:
// - Unified and split diff views (toggle)
// - Syntax highlighting per file language
// - Click on any line to open inline comment form
// - Show existing inline comments threaded below their line
// - Collapse/expand unchanged regions
// - File navigation sidebar for multi-file PRs
```

---

- [ ] ### TASK 5-04 — CI/CD Pipeline Engine

**Add to `apps/project-service/src/services/`:**

**`pipeline.service.ts`:**

```typescript
export class PipelineService {
  // Parse and validate pipeline YAML definition
  async validateDefinition(
    yaml: string
  ): Promise<ParsedPipeline | ValidationErrors>

  // Create pipeline definition for a project
  async create(projectId: string, dto: CreatePipelineDto): Promise<Pipeline>

  // Trigger a pipeline run
  async trigger(pipelineId: string, dto: TriggerDto): Promise<PipelineRun>
  // 1. Create PipelineRun record (status: queued)
  // 2. Create PipelineJob records for each job in definition
  // 3. Publish PROJECT_PIPELINE_STARTED to NATS
  // 4. Enqueue run to runner pool via NATS

  // Cancel running pipeline
  async cancel(runId: string, cancelledBy: string): Promise<void>

  // Get run status + job statuses
  async getRun(runId: string): Promise<PipelineRunDetail>

  // Called by runner agent when job starts/finishes
  async updateJobStatus(
    jobId: string,
    status: string,
    exitCode?: number
  ): Promise<void>
}
```

---

- [ ] ### TASK 5-05 — Pipeline Runner Agent

**File:** `apps/project-service/src/runner/agent.ts`

```typescript
// The runner agent is a long-running process (separate Node.js process)
// It subscribes to NATS for queued pipeline runs
// and executes jobs in isolated Docker containers

class RunnerAgent {
  async start() {
    subscribe(nc, 'pipeline.run.queued', this.handleRun.bind(this))
  }

  async handleRun(data: PipelineRunQueued) {
    const run = await pipelineService.getRun(data.runId)
    const jobs = run.jobs.filter((j) => j.status === 'pending')

    for (const job of jobs) {
      await this.executeJob(run, job)
    }
  }

  async executeJob(run: PipelineRunDetail, job: PipelineJob) {
    // 1. Update job status: running
    await pipelineService.updateJobStatus(job.id, 'running')

    // 2. Start log stream (write to Loki via HTTP push API)
    const logStream = new LokiLogStream(job.id, run.projectId)

    // 3. Pull source code at run.commitSha
    await git.clone(run.repoUrl, run.commitSha, '/tmp/build/' + run.id)

    // 4. Run each step in job.steps sequentially
    for (const step of job.steps) {
      const result = await this.runStep(step, run, logStream)
      if (result.exitCode !== 0) {
        await pipelineService.updateJobStatus(job.id, 'failed', result.exitCode)
        return
      }
    }

    // 5. Mark job passed
    await pipelineService.updateJobStatus(job.id, 'passed', 0)
    await logStream.close()
  }

  async runStep(
    step: PipelineStep,
    run: PipelineRunDetail,
    logs: LokiLogStream
  ) {
    // Each step runs in a Docker container
    // Image specified in step or defaults to ubuntu:22.04
    // Mounts: source code read-write, no host network access
    // Environment: run.env merged with step.env
    // Secrets: injected from OpenBao by name
    // Timeout: step.timeout ?? 10 minutes

    const container = await docker.createContainer({
      Image: step.image ?? 'ubuntu:22.04',
      Cmd: ['/bin/sh', '-c', step.run],
      WorkingDir: '/workspace',
      NetworkMode: 'none', // no network unless step.network = true
      HostConfig: {
        Binds: [`/tmp/build/${run.id}:/workspace`],
        Memory: 512 * 1024 * 1024,
        CpuShares: 512,
      },
      Env: buildEnv(run, step),
    })

    await container.start()
    // Stream logs to Loki in real-time
    const stream = await container.logs({
      follow: true,
      stdout: true,
      stderr: true,
    })
    stream.on('data', (chunk) => logs.write(chunk.toString()))

    const result = await container.wait()
    await container.remove()
    return result
  }
}
```

---

- [ ] ### TASK 5-06 — Pipeline YAML Format

**Supported pipeline YAML (`devora-pipeline.yml`):**

```yaml
name: Build and Test
on:
  push:
    branches: ['main', 'develop']
  pull_request:
    types: [opened, synchronize]

jobs:
  test:
    name: Run Tests
    runs-on: devora-runner # uses platform runner pool
    timeout-minutes: 15
    steps:
      - name: Checkout
        uses: devora/checkout@v1

      - name: Setup Node.js
        uses: devora/setup-node@v1
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm test
        env:
          CI: true

  build:
    name: Build Docker Image
    needs: [test] # depends on test job passing
    runs-on: devora-runner
    steps:
      - uses: devora/checkout@v1

      - name: Build image
        uses: devora/docker-build@v1
        with:
          dockerfile: Dockerfile
          tag: ${{ devora.sha }}
          push: true # push to Harbor registry

      - name: Scan for vulnerabilities
        uses: devora/trivy-scan@v1
        with:
          fail-on: CRITICAL
```

---

- [ ] ### TASK 5-07 — Pipeline Log Streaming (Portal)

**Files:**

```
apps/portal/src/pages/projects/[projectId]/pipelines/
├── PipelinesPage.tsx      ← list of runs
└── [runId]/
    ├── RunPage.tsx        ← run detail: jobs, status, trigger info
    └── JobLogs.tsx        ← real-time log viewer for a job
```

**`JobLogs.tsx` — real-time log streaming:**

```typescript
// Uses SSE (Server-Sent Events) to stream logs from Loki
// Endpoint: GET /api/projects/pipelines/runs/:runId/jobs/:jobId/logs
// Streams Loki log entries as they arrive
// Features:
// - ANSI colour code rendering (ansi-to-html)
// - Auto-scroll to bottom (pause on manual scroll up)
// - Timestamp per log line
// - Search / filter log lines
// - Download full log as .txt
```

---

### Task 5-08 — Gitea Webhook Handler

**Add to `apps/project-service/src/routes/projects.ts`:**

```typescript
// POST /gitea-webhook
// Receives push and pull_request events from Gitea
// Validates X-Gitea-Signature header (HMAC-SHA256)

async function handleGiteaWebhook(request, reply) {
  const event = request.headers['x-gitea-event']
  const body = request.body

  if (event === 'push') {
    // Trigger pipelines matching push trigger + branch
    const project = await projectService.getByGiteaRepoId(body.repository.id)
    const matchingPipelines = await pipelineService.getMatchingPush(
      project.id,
      body.ref
    )
    for (const pipeline of matchingPipelines) {
      await pipelineService.trigger(pipeline.id, {
        triggerType: 'push',
        commitSha: body.after,
        branch: body.ref.replace('refs/heads/', ''),
        triggerActor: body.pusher.login,
      })
    }
  }

  if (event === 'pull_request') {
    // Sync PR status from Gitea to Devora DB
    // Trigger PR-triggered pipelines
  }

  return reply.status(200).send({ ok: true })
}
```

---

### Sprint 5 Acceptance Criteria

Creating a PR stores it in DB and links to Gitea PR Diff viewer renders file changes with syntax highlighting Inline comments can be added on specific diff lines Approving a PR enables the merge button (if branch protection satisfied) Merging a PR auto-closes linked issues Push to main triggers matching pipeline automatically Pipeline logs stream in real-time to portal while running Failed job stops subsequent dependent jobs Docker vulnerability scan blocks deployment on CRITICAL CVEs Pipeline run history visible per project

---

- [ ] ## SPRINT 6 — Rust Deployment Engine

**Duration:** 3 weeks (most complex sprint)
**Goal:** Complete deployment engine in Rust. Supports self-hosted K3s target. Approval workflow. Auto-rollback on health failure.

**Prerequisites:** Sprint 5 complete. Harbor registry running. OpenBao running.

---

- [ ] ### TASK 6-01 — Rust Project Setup

**Directory:** `core/deploy-engine/`

```
core/deploy-engine/
├── Cargo.toml
├── Cargo.lock
└── src/
    ├── main.rs              ← HTTP server entry point (axum)
    ├── config.rs            ← env config (envy)
    ├── error.rs             ← unified error type
    ├── api/
    │   ├── mod.rs
    │   ├── deployments.rs   ← deployment CRUD routes
    │   ├── targets.rs       ← target management routes
    │   ├── specs.rs         ← spec management + validation
    │   └── middleware.rs    ← JWT auth middleware
    ├── engine/
    │   ├── mod.rs
    │   ├── executor.rs      ← main deployment orchestrator
    │   ├── builder.rs       ← Docker image build step
    │   ├── scanner.rs       ← Trivy CVE scan step
    │   ├── planner.rs       ← diff/plan computation
    │   ├── health.rs        ← health check poller + rollback trigger
    │   └── rollback.rs      ← rollback execution
    ├── providers/
    │   ├── mod.rs
    │   ├── trait.rs         ← Provider trait (interface)
    │   ├── self_hosted/
    │   │   ├── mod.rs
    │   │   ├── k3s.rs       ← kubectl apply via kube-rs
    │   │   ├── traefik.rs   ← Traefik API config
    │   │   └── ssl.rs       ← ACME cert management
    │   └── aws/
    │       ├── mod.rs
    │       └── ecs.rs       ← AWS ECS Fargate
    ├── spec/
    │   ├── mod.rs
    │   ├── parser.rs        ← YAML spec parser
    │   └── validator.rs     ← spec schema validation
    ├── vault/
    │   └── client.rs        ← OpenBao/Vault HTTP client
    └── db/
        └── client.rs        ← PostgreSQL via sqlx
```

**`Cargo.toml` dependencies:**

```toml
[dependencies]
axum            = { version = "0.7", features = ["ws"] }
tokio           = { version = "1", features = ["full"] }
serde           = { version = "1", features = ["derive"] }
serde_json      = "1"
serde_yaml      = "0.9"
sqlx            = { version = "0.7", features = ["postgres", "uuid", "runtime-tokio"] }
kube            = { version = "0.87", features = ["runtime", "derive"] }
k8s-openapi     = { version = "0.21", features = ["v1_29"] }
reqwest         = { version = "0.11", features = ["json", "stream"] }
jsonwebtoken    = "9"
uuid            = { version = "1", features = ["v4"] }
tracing         = "0.1"
tracing-subscriber = "0.3"
anyhow          = "1"
thiserror       = "1"
envy            = "0.4"
async-trait     = "0.1"
chrono          = { version = "0.4", features = ["serde"] }
```

---

- [ ] ### TASK 6-02 — Provider Trait

**`src/providers/trait.rs`:**

```rust
use async_trait::async_trait;
use crate::spec::parser::DeploySpec;
use crate::error::DeployError;

#[derive(Debug, Clone, serde::Serialize)]
pub struct DeployState {
    pub running_image: Option<String>,
    pub replicas: u32,
    pub healthy: bool,
}

#[async_trait]
pub trait Provider: Send + Sync {
    /// Get current state of the deployed app
    async fn get_state(&self, app: &str, env: &str) -> Result<Option<DeployState>, DeployError>;

    /// Apply deployment spec — returns deployment ID in the target system
    async fn deploy(&self, spec: &DeploySpec, image: &str) -> Result<String, DeployError>;

    /// Roll back to previous deployment
    async fn rollback(&self, app: &str, env: &str) -> Result<(), DeployError>;

    /// Scale replicas
    async fn scale(&self, app: &str, env: &str, replicas: u32) -> Result<(), DeployError>;

    /// Delete deployment entirely
    async fn delete(&self, app: &str, env: &str) -> Result<(), DeployError>;

    /// Test connectivity to this provider
    async fn health_check(&self) -> Result<(), DeployError>;
}
```

---

- [ ] ### TASK 6-03 — Deployment Executor

**`src/engine/executor.rs` — main orchestration flow:**

```rust
pub struct DeploymentExecutor {
    db: Arc<DbClient>,
    vault: Arc<VaultClient>,
    providers: HashMap<String, Arc<dyn Provider>>,
    nats: Arc<NatsClient>,
}

impl DeploymentExecutor {
    pub async fn execute(&self, deployment_id: Uuid) -> Result<(), DeployError> {
        // Load deployment from DB
        let deployment = self.db.get_deployment(deployment_id).await?;
        let spec = self.db.get_deploy_spec(deployment.spec_id).await?;
        let target = self.db.get_target(deployment.target_id).await?;

        // PHASE 1: VALIDATE
        self.update_step(&deployment_id, "validate", "running").await?;
        self.validate(&spec, &deployment).await?;
        self.update_step(&deployment_id, "validate", "passed").await?;

        // PHASE 2: BUILD
        self.update_step(&deployment_id, "build", "running").await?;
        let image_tag = self.builder.build(&spec, &deployment).await?;
        self.update_step(&deployment_id, "build", "passed").await?;

        // PHASE 3: SCAN
        self.update_step(&deployment_id, "scan", "running").await?;
        self.scanner.scan(&image_tag).await?;  // fails on CRITICAL CVE
        self.update_step(&deployment_id, "scan", "passed").await?;

        // PHASE 4: PLAN (for production — wait for approval)
        if target.environment == "production" {
            self.update_deployment_status(&deployment_id, "awaiting_approval").await?;
            self.nats.publish("deploy.approval.required", &deployment).await?;
            // Poll DB for approved_at to be set (timeout: 24h)
            self.wait_for_approval(&deployment_id).await?;
        }

        // PHASE 5: DEPLOY
        self.update_step(&deployment_id, "deploy", "running").await?;
        let provider = self.providers.get(&target.type_).unwrap();

        // Resolve secrets from Vault
        let secrets = self.vault.resolve_secrets(&spec.secrets).await?;

        provider.deploy(&spec, &image_tag).await?;
        self.update_step(&deployment_id, "deploy", "passed").await?;

        // PHASE 6: VERIFY (health check with auto-rollback)
        self.update_step(&deployment_id, "verify", "running").await?;
        match self.health.verify(&spec, &target).await {
            Ok(_) => {
                self.update_step(&deployment_id, "verify", "passed").await?;
                self.update_deployment_status(&deployment_id, "live").await?;
                self.nats.publish("deploy.succeeded", &deployment).await?;
            }
            Err(e) => {
                // Auto-rollback
                provider.rollback(&spec.app, &target.environment).await?;
                self.update_deployment_status(&deployment_id, "rolled_back").await?;
                self.nats.publish("deploy.failed", &DeployFailed {
                    deployment_id,
                    reason: e.to_string(),
                }).await?;
                return Err(e);
            }
        }

        Ok(())
    }
}
```

---

- [ ] ### TASK 6-04 — Self-Hosted K3s Provider

**`src/providers/self_hosted/k3s.rs`:**

```rust
// Uses kube-rs to interact with K3s API server
// Generates Kubernetes Deployment + Service + Ingress manifests
// from the DeploySpec

pub struct K3sProvider {
    kube_client: kube::Client,
    traefik:     TraefikClient,
    namespace:   String,
}

impl K3sProvider {
    fn build_deployment(&self, spec: &DeploySpec, image: &str) -> Deployment {
        // Build k8s Deployment resource from spec
        // Sets: image, resource limits, env vars, replicas, labels
        // Uses rolling update strategy by default
    }

    fn build_service(&self, spec: &DeploySpec) -> Service {
        // ClusterIP service targeting deployment pods on spec.network.port
    }

    fn build_ingress(&self, spec: &DeploySpec) -> Ingress {
        // Traefik IngressRoute:
        // - routes spec.network.domain → service
        // - annotates for Let's Encrypt if spec.network.ssl == 'auto'
    }
}

#[async_trait]
impl Provider for K3sProvider {
    async fn deploy(&self, spec: &DeploySpec, image: &str) -> Result<String, DeployError> {
        let api: Api<Deployment> = Api::namespaced(self.kube_client.clone(), &self.namespace);

        let deployment = self.build_deployment(spec, image);
        let service    = self.build_service(spec);
        let ingress    = self.build_ingress(spec);

        // Apply with server-side apply (kubectl apply equivalent)
        api.patch(&spec.app, &PatchParams::apply("devora"), &Patch::Apply(deployment)).await?;
        // Same for Service and Ingress
        // ...

        Ok(spec.app.clone())
    }

    async fn rollback(&self, app: &str, env: &str) -> Result<(), DeployError> {
        // Annotate deployment with rollback-to: previous revision
        // K8s rolls back to the previous ReplicaSet automatically
        let api: Api<Deployment> = Api::namespaced(self.kube_client.clone(), &self.namespace);
        // kubectl rollout undo equivalent via patch
        Ok(())
    }
}
```

---

- [ ] ### TASK 6-05 — Health Check & Auto-Rollback

**`src/engine/health.rs`:**

```rust
pub struct HealthChecker;

impl HealthChecker {
    pub async fn verify(&self, spec: &DeploySpec, target: &DeployTarget) -> Result<(), DeployError> {
        let health_url = format!("https://{}{}", spec.network.domain, spec.health_check.path);
        let interval = spec.health_check.interval_secs;
        let failure_threshold = spec.health_check.failure_threshold;
        let timeout = Duration::from_secs(5 * 60); // 5 minute window

        let start = Instant::now();
        let mut failures = 0u32;

        loop {
            if start.elapsed() > timeout {
                return Err(DeployError::HealthCheckTimeout);
            }

            match reqwest::get(&health_url).await {
                Ok(resp) if resp.status().is_success() => {
                    failures = 0;
                    // After 3 consecutive successes → declare healthy
                    return Ok(());
                }
                _ => {
                    failures += 1;
                    if failures >= failure_threshold {
                        return Err(DeployError::HealthCheckFailed {
                            url: health_url,
                            failures,
                        });
                    }
                }
            }

            tokio::time::sleep(Duration::from_secs(interval)).await;
        }
    }
}
```

---

- [ ] ### TASK 6-06 — Deploy Service (Node.js wrapper)

**Add `apps/deploy-service/` — thin Node.js service that:**

- Exposes REST API to portal and gateway
- Calls Rust deploy-engine via HTTP
- Handles approval state in PostgreSQL
- Subscribes to deploy NATS events to update portal in real-time

```
apps/deploy-service/
└── src/
    ├── routes/
    │   ├── deployments.ts   ← CRUD + trigger + approve + rollback
    │   ├── targets.ts       ← target management
    │   └── specs.ts         ← spec CRUD + validate
    └── services/
        ├── deployment.service.ts
        └── engine.client.ts   ← HTTP client → Rust engine
```

**`src/services/engine.client.ts`:**

```typescript
// HTTP client wrapping the Rust deploy-engine
export class EngineClient {
  async triggerDeploy(deploymentId: string): Promise<void>
  async getDeployStatus(deploymentId: string): Promise<DeployStatusResponse>
  async rollback(deploymentId: string): Promise<void>
  async validateSpec(spec: string): Promise<ValidationResult>
  async testTarget(targetId: string): Promise<TargetTestResult>
}
```

---

- [ ] ### TASK 6-07 — Portal Deployment UI

**Files:**

```
apps/portal/src/pages/deploy/
├── DeployPage.tsx          ← org-level deployment overview
├── TargetsPage.tsx         ← manage deploy targets
├── NewTargetPage.tsx       ← add AWS/GCP/self-hosted target
├── SpecsPage.tsx           ← project deploy specs
└── [deployId]/
    ├── DeploymentPage.tsx  ← deployment detail + step progress
    ├── StepProgress.tsx    ← real-time step status (polling + SSE)
    ├── ApprovalBanner.tsx  ← approval prompt for production deploys
    └── LogStream.tsx       ← step log streaming
```

**`DeploymentPage.tsx` — step timeline:**

```typescript
// Visual timeline showing 5 deployment phases:
// [validate] → [build] → [scan] → [deploy] → [verify]
// Each phase: pending / running (spinner) / passed (✓) / failed (✗)
// Clicking a phase shows its logs
// For production: show approval banner with approve/reject buttons
// Real-time updates via polling GET /api/deploy/deployments/:id every 3s
```

---

### Sprint 6 Acceptance Criteria

`POST /api/deploy/deployments` triggers Rust engine All 5 phases execute in sequence, status visible in portal Self-hosted target creates K8s Deployment + Service + Ingress Production deploy pauses for approval, resumes after approval Health check failure triggers automatic rollback Rollback restores previous working version CRITICAL CVE in image blocks deployment with clear error Deployment events post cards to project chat channel

---

- [ ] ## SPRINT 7 — Monitoring & Admin Dashboards

**Duration:** 2 weeks
**Goal:** Role-based monitoring dashboards. Developer activity metrics. Cluster health views. Admin portal.

**Prerequisites:** Sprint 1–6 complete. ClickHouse running. Prometheus running.

---

- [ ] ### TASK 7-01 — Bootstrap `apps/monitor-service`

**Files:**

```
apps/monitor-service/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts
    ├── app.ts
    ├── config.ts
    ├── plugins/
    │   ├── clickhouse.ts      ← ClickHouse HTTP client
    │   ├── prometheus.ts      ← Prometheus query client
    │   └── nats.ts
    ├── routes/
    │   ├── developer.ts       ← developer self-view metrics
    │   ├── manager.ts         ← manager team view
    │   ├── admin.ts           ← org admin view
    │   └── superadmin.ts      ← platform-wide view
    ├── services/
    │   ├── activity.service.ts    ← query ClickHouse activity_events
    │   ├── resource.service.ts    ← query Prometheus sandbox metrics
    │   ├── pipeline.service.ts    ← pipeline stats from PostgreSQL
    │   └── cluster.service.ts     ← K8s node metrics
    └── subscribers/
        └── activity-recorder.ts   ← NATS → ClickHouse writer
```

---

- [ ] ### TASK 7-02 — ClickHouse Activity Recorder

**`src/subscribers/activity-recorder.ts`:**

```typescript
// Subscribes to ALL relevant NATS subjects
// Writes every event as a row to ClickHouse activity_events table
// This is the single source of truth for all developer activity metrics

const activitySubjects = [
  Subjects.AUTH_USER_CREATED,
  Subjects.PROJECT_ISSUE_CREATED,
  Subjects.PROJECT_ISSUE_CLOSED,
  Subjects.PROJECT_PR_OPENED,
  Subjects.PROJECT_PR_MERGED,
  Subjects.PROJECT_PIPELINE_STARTED,
  Subjects.PROJECT_PIPELINE_PASSED,
  Subjects.PROJECT_PIPELINE_FAILED,
  Subjects.DEPLOY_STARTED,
  Subjects.DEPLOY_SUCCEEDED,
  Subjects.DEPLOY_FAILED,
  Subjects.SANDBOX_CREATED,
  Subjects.SANDBOX_STOPPED,
]

for (const subject of activitySubjects) {
  subscribe(nc, subject, async (data: any) => {
    await clickhouse.insert('activity_events', {
      id: randomUUID(),
      org_id: data.orgId,
      user_id: data.userId ?? data.triggerActor ?? data.authorId,
      project_id: data.projectId,
      event_type: subject,
      metadata: JSON.stringify(data),
      created_at: new Date(),
    })
  })
}
```

**ClickHouse table DDL (run on first install):**

```sql
CREATE TABLE activity_events (
    id           UUID,
    org_id       UUID,
    user_id      UUID,
    project_id   UUID,
    event_type   String,
    metadata     String,
    created_at   DateTime
) ENGINE = MergeTree()
  PARTITION BY toYYYYMM(created_at)
  ORDER BY (org_id, user_id, created_at);

CREATE TABLE resource_snapshots (
    org_id       UUID,
    user_id      UUID,
    sandbox_id   UUID,
    cpu_pct      Float32,
    mem_mb       Float32,
    disk_mb      Float32,
    snapshot_at  DateTime
) ENGINE = MergeTree()
  PARTITION BY toYYYYMM(snapshot_at)
  ORDER BY (org_id, user_id, snapshot_at);
```

---

- [ ] ### TASK 7-03 — Monitor Routes (Role-Gated)

**`src/routes/manager.ts` — project manager view:**

```
GET /manager/team                → team activity summary (last 30 days)
    Returns per-user:
      - commits count
      - PRs opened/merged
      - issues closed
      - builds triggered/passed/failed
      - active coding hours (sandbox active time)

GET /manager/sprint/:sprintId   → sprint velocity + burndown data
GET /manager/builds             → build success rates per project + dev
GET /manager/deployments        → deployment frequency + MTTR
```

**`src/routes/superadmin.ts` — platform view:**

```
GET /superadmin/cluster          → K8s node metrics (CPU/RAM/disk per node)
GET /superadmin/orgs             → per-org resource usage + user counts
GET /superadmin/alerts           → active alerts (node pressure, quota exceeded)
GET /superadmin/audit            → recent audit log events
```

---

- [ ] ### TASK 7-04 — Resource Snapshot Collector

**Add to `apps/sandbox-service/src/services/`:**

**`metrics-collector.ts`:**

```typescript
// Runs every 30 seconds
// Queries K8s metrics-server for each running sandbox pod
// Writes snapshot to ClickHouse via HTTP

async function collectSandboxMetrics() {
  const runningSandboxes = await workspaceService.listRunning()

  for (const sandbox of runningSandboxes) {
    const metrics = await k8sMetrics.getPodMetrics(
      sandbox.podName,
      'devora-sandboxes'
    )

    const cpuPct =
      (parseFloat(metrics.containers[0].usage.cpu) / sandbox.cpuLimit) * 100
    const memMb = parseFloat(metrics.containers[0].usage.memory) / 1024 / 1024

    await clickhouse.insert('resource_snapshots', {
      org_id: sandbox.orgId,
      user_id: sandbox.userId,
      sandbox_id: sandbox.id,
      cpu_pct: cpuPct,
      mem_mb: memMb,
      snapshot_at: new Date(),
    })

    // Detect resource spike → emit NATS event
    if (cpuPct > 90 || memMb > sandbox.memoryLimitMb * 0.9) {
      publish(nc, Subjects.SANDBOX_RESOURCE_SPIKE, {
        workspaceId: sandbox.id,
        userId: sandbox.userId,
        orgId: sandbox.orgId,
        cpu: cpuPct,
        memory: memMb,
      })
    }
  }
}

setInterval(collectSandboxMetrics, 30_000)
```

---

- [ ] ### TASK 7-05 — Portal Admin Dashboards

**Files:**

```
apps/portal/src/pages/admin/
├── AdminLayout.tsx             ← admin-only route guard
├── OverviewPage.tsx            ← key metrics summary cards
├── TeamPage.tsx                ← manager team activity view
├── ClusterPage.tsx             ← super-admin node health
├── UsersPage.tsx               ← org user management
├── RolesPage.tsx               ← role assignment UI
├── AuditPage.tsx               ← audit log viewer
└── QuotasPage.tsx              ← resource quota management
```

**`TeamPage.tsx` — manager dashboard widgets:**

```typescript
// Developer activity cards (per team member):
//   - Commits this week (sparkline chart)
//   - Open PRs count
//   - Build success rate (percentage ring)
//   - Active sandbox hours this week
//   - Issues closed this sprint

// Sprint burndown chart (Recharts LineChart)
// Build pass rate over time (Recharts BarChart)
// Deployment frequency heatmap (last 30 days)
```

**`ClusterPage.tsx` — super admin cluster view:**

```typescript
// Node cards grid: one card per K8s node
//   - Node name + role label
//   - CPU usage gauge (Recharts RadialBarChart)
//   - RAM usage gauge
//   - Disk usage bar
//   - Pod count / capacity
//   - Status badge: Ready / NotReady / Pressure

// Alert table: active Prometheus alerts
// Recent audit events timeline
```

---

### Sprint 7 Acceptance Criteria

Every NATS event is written to ClickHouse activity_events Manager dashboard shows per-developer commit/PR/build counts Sprint burndown chart renders with correct data Super admin cluster page shows all K8s nodes with real metrics Resource spike detection fires NATS event and creates notification Audit log shows all auth + deploy + role events Role assignment via portal assigns correct DB records + takes effect

---

- [ ] ## SPRINT 8 — CLI Installer & Cloud Provider Adapters

**Duration:** 2–3 weeks
**Goal:** Rust CLI installer with hardware detection, all profiles, air-gapped mode. AWS ECS cloud provider adapter. Full integration test suite.

**Prerequisites:** All previous sprints complete and tested.

---

- [ ] ### TASK 8-01 — Rust Installer Project Setup

**Directory:** `core/installer/`

```
core/installer/
├── Cargo.toml
├── build.rs              ← embeds K3s manifests at compile time
└── src/
    ├── main.rs           ← clap CLI entry point
    ├── cli.rs            ← subcommand definitions
    ├── config.rs         ← platform config read/write (/etc/devora/config.yaml)
    ├── detect/
    │   ├── mod.rs
    │   ├── hardware.rs   ← CPU, RAM, disk, GPU detection
    │   ├── network.rs    ← NIC detection, public IP
    │   └── os.rs         ← OS version, existing services check
    ├── wizard/
    │   ├── mod.rs
    │   ├── questions.rs  ← dialoguer interactive prompts
    │   └── profiles.rs   ← profile recommendation logic
    ├── setup/
    │   ├── mod.rs
    │   ├── disk.rs       ← directory creation, mount setup
    │   ├── firewall.rs   ← nftables rule generation + apply
    │   ├── kernel.rs     ← sysctl parameter configuration
    │   ├── k3s.rs        ← K3s download, install, systemd service
    │   └── storage.rs    ← Longhorn / local-path setup
    ├── deploy/
    │   ├── mod.rs
    │   ├── manifests.rs  ← generate K3s YAML from profile config
    │   └── wait.rs       ← pod health check polling
    ├── commands/
    │   ├── init.rs       ← devora init
    │   ├── join.rs       ← devora join
    │   ├── status.rs     ← devora status
    │   ├── upgrade.rs    ← devora upgrade
    │   ├── backup.rs     ← devora backup
    │   ├── restore.rs    ← devora restore
    │   ├── token.rs      ← devora token
    │   ├── scale.rs      ← devora scale
    │   └── reset.rs      ← devora reset
    └── utils/
        ├── crypto.rs     ← secret generation, token signing
        ├── progress.rs   ← indicatif progress bars
        └── ssh.rs        ← SSH to remote nodes (multi-node join)
```

**`Cargo.toml` dependencies:**

```toml
[dependencies]
clap           = { version = "4", features = ["derive"] }
dialoguer      = "0.11"
indicatif      = "0.17"
serde          = { version = "1", features = ["derive"] }
serde_yaml     = "0.9"
reqwest        = { version = "0.11", features = ["blocking"] }
tokio          = { version = "1", features = ["full"] }
ssh2           = "0.9"
sysinfo        = "0.30"
colored        = "2"
anyhow         = "1"
uuid           = { version = "1", features = ["v4"] }
bcrypt         = "0.15"
rand           = "0.8"
```

---

- [ ] ### TASK 8-02 — Hardware Detection

**`src/detect/hardware.rs`:**

```rust
use sysinfo::{System, Disks, Networks};

#[derive(Debug, serde::Serialize)]
pub struct HardwareProfile {
    pub cpu_cores:       u32,
    pub cpu_arch:        String,   // x86_64 | aarch64
    pub total_ram_gb:    f64,
    pub disks:           Vec<DiskInfo>,
    pub has_gpu:         bool,
    pub gpu_name:        Option<String>,
    pub recommended_profile: InstallProfile,
}

#[derive(Debug, serde::Serialize)]
pub struct DiskInfo {
    pub name:       String,    // e.g. /dev/nvme0n1
    pub size_gb:    f64,
    pub disk_type:  String,    // SSD | NVMe | HDD
    pub is_mounted: bool,
    pub mount_point:Option<String>,
}

pub fn detect() -> HardwareProfile {
    let mut sys = System::new_all();
    sys.refresh_all();

    let cpu_cores    = sys.cpus().len() as u32;
    let total_ram_gb = sys.total_memory() as f64 / 1024.0 / 1024.0 / 1024.0;
    let cpu_arch     = std::env::consts::ARCH.to_string();

    let disks = Disks::new_with_refreshed_list()
        .iter()
        .map(|d| DiskInfo {
            name:        d.name().to_string_lossy().to_string(),
            size_gb:     d.total_space() as f64 / 1e9,
            disk_type:   detect_disk_type(d),
            is_mounted:  true,
            mount_point: Some(d.mount_point().to_string_lossy().to_string()),
        })
        .collect();

    let has_gpu = detect_gpu();
    let gpu_name = get_gpu_name();

    let recommended_profile = recommend_profile(cpu_cores, total_ram_gb);

    HardwareProfile { cpu_cores, cpu_arch, total_ram_gb, disks, has_gpu, gpu_name, recommended_profile }
}

fn recommend_profile(cores: u32, ram_gb: f64) -> InstallProfile {
    match (cores, ram_gb as u32) {
        (c, r) if c >= 16 && r >= 32 => InstallProfile::Business,
        (c, r) if c >= 8  && r >= 16 => InstallProfile::Starter,
        (c, r) if c >= 4  && r >= 8  => InstallProfile::Nano,
        _                             => InstallProfile::Nano,
    }
}
```

---

- [ ] ### TASK 8-03 — Interactive Wizard

**`src/wizard/questions.rs`:**

```rust
use dialoguer::{Select, Input, Confirm, Password};

pub struct WizardAnswers {
    pub profile:         InstallProfile,
    pub domain:          String,
    pub ssl_mode:        SslMode,
    pub enable_ai:       bool,
    pub ai_backend:      Option<AiBackend>,   // local | cloud
    pub admin_email:     String,
    pub admin_password:  String,
}

pub fn run_wizard(hardware: &HardwareProfile) -> WizardAnswers {
    println!("\n{}\n", "╔══ DEVORA SETUP WIZARD ══╗".bold());

    let profile_idx = Select::new()
        .with_prompt("Installation profile")
        .items(&["Nano (auto-detected)", "Starter", "Business", "Enterprise"])
        .default(hardware.recommended_profile as usize)
        .interact()
        .unwrap();

    let domain: String = Input::new()
        .with_prompt("Domain name (e.g. dev.company.com)")
        .interact_text()
        .unwrap();

    let ssl_idx = Select::new()
        .with_prompt("SSL Certificate")
        .items(&["Auto (Let's Encrypt)", "Manual (provide cert files)", "Self-signed"])
        .default(0)
        .interact()
        .unwrap();

    let enable_ai = Confirm::new()
        .with_prompt("Enable AI code assistant?")
        .default(hardware.has_gpu)
        .interact()
        .unwrap();

    let admin_email: String = Input::new()
        .with_prompt("Admin email")
        .interact_text()
        .unwrap();

    let admin_password = Password::new()
        .with_prompt("Admin password (min 12 characters)")
        .with_confirmation("Confirm password", "Passwords do not match")
        .interact()
        .unwrap();

    // ... build and return WizardAnswers
}
```

---

- [ ] ### TASK 8-04 — K3s Installation

**`src/setup/k3s.rs`:**

```rust
pub async fn install(config: &PlatformConfig) -> anyhow::Result<()> {
    let arch = std::env::consts::ARCH;
    let k3s_url = format!(
        "https://github.com/k3s-io/k3s/releases/download/v1.29.3+k3s1/k3s{}",
        if arch == "aarch64" { "-arm64" } else { "" }
    );

    // Download K3s binary
    download_with_progress(&k3s_url, "/usr/local/bin/k3s").await?;
    std::fs::set_permissions("/usr/local/bin/k3s", Permissions::from_mode(0o755))?;

    // Write K3s config
    let k3s_config = format!(r#"
write-kubeconfig-mode: "0644"
data-dir: /var/lib/devora/k3s
disable: traefik          # We deploy our own Traefik
node-label:
  - "devora.io/role=control"
"#);
    std::fs::write("/etc/rancher/k3s/config.yaml", k3s_config)?;

    // Write systemd service
    let service = r#"
[Unit]
Description=Devora K3s Cluster
After=network-online.target

[Service]
Type=notify
ExecStart=/usr/local/bin/k3s server
Restart=on-failure

[Install]
WantedBy=multi-user.target
"#;
    std::fs::write("/etc/systemd/system/devora-k3s.service", service)?;

    // Enable and start
    run_cmd("systemctl", &["daemon-reload"])?;
    run_cmd("systemctl", &["enable", "--now", "devora-k3s.service"])?;

    // Wait for node Ready
    wait_for_node_ready().await?;
    println!("{}", "✓ K3s cluster ready".green());

    Ok(())
}
```

---

- [ ] ### TASK 8-05 — Manifest Embedding (build.rs)

**`build.rs`:**

```rust
// Embeds all K3s manifests into the binary at compile time
// This enables air-gapped installs — no internet needed after download

use std::path::Path;

fn main() {
    // Tell cargo to re-run this if manifests change
    println!("cargo:rerun-if-changed=manifests/");

    // Manifests are embedded via include_str! in manifests.rs
    // This build script just validates they exist
    let manifest_dir = Path::new("manifests");
    assert!(manifest_dir.exists(), "manifests/ directory missing");

    for entry in std::fs::read_dir(manifest_dir).unwrap() {
        let path = entry.unwrap().path();
        println!("cargo:rerun-if-changed={}", path.display());
    }
}
```

**`src/deploy/manifests.rs`:**

```rust
// Manifests embedded at compile time — zero runtime file I/O
const POSTGRES_MANIFEST:      &str = include_str!("../../manifests/postgres.yaml");
const REDIS_MANIFEST:         &str = include_str!("../../manifests/redis.yaml");
const NATS_MANIFEST:          &str = include_str!("../../manifests/nats.yaml");
const MINIO_MANIFEST:         &str = include_str!("../../manifests/minio.yaml");
const CLICKHOUSE_MANIFEST:    &str = include_str!("../../manifests/clickhouse.yaml");
const GITEA_MANIFEST:         &str = include_str!("../../manifests/gitea.yaml");
const HARBOR_MANIFEST:        &str = include_str!("../../manifests/harbor.yaml");
const TRAEFIK_MANIFEST:       &str = include_str!("../../manifests/traefik.yaml");
const AUTH_SERVICE_MANIFEST:  &str = include_str!("../../manifests/auth-service.yaml");
// ... all service manifests

pub fn get_manifests_for_profile(profile: &InstallProfile) -> Vec<(&'static str, &'static str)> {
    let mut manifests = vec![
        ("postgres",    POSTGRES_MANIFEST),
        ("redis",       REDIS_MANIFEST),
        ("nats",        NATS_MANIFEST),
        ("auth-service",AUTH_SERVICE_MANIFEST),
        // core manifests for all profiles
    ];

    if *profile != InstallProfile::Nano {
        manifests.extend([
            ("minio",       MINIO_MANIFEST),
            ("clickhouse",  CLICKHOUSE_MANIFEST),
            ("gitea",       GITEA_MANIFEST),
            ("harbor",      HARBOR_MANIFEST),
        ]);
    }

    manifests
}
```

---

- [ ] ### TASK 8-06 — AWS ECS Provider (Rust)

**`src/providers/aws/ecs.rs`:**

```rust
// Uses AWS SDK for Rust (aws-sdk-ecs)
pub struct EcsProvider {
    ecs_client:  aws_sdk_ecs::Client,
    ecr_client:  aws_sdk_ecr::Client,
    region:      String,
    cluster:     String,
}

#[async_trait]
impl Provider for EcsProvider {
    async fn deploy(&self, spec: &DeploySpec, image: &str) -> Result<String, DeployError> {
        // 1. Push image to ECR (re-tag from Harbor)
        // 2. Register new ECS task definition revision
        // 3. Update ECS service to use new task definition
        // 4. ECS performs rolling deployment
        // 5. Return ECS deployment ID

        let task_def = self.build_task_definition(spec, image);
        let register_resp = self.ecs_client
            .register_task_definition()
            .family(&spec.app)
            // ... set all task def fields from spec
            .send()
            .await?;

        let task_def_arn = register_resp
            .task_definition()
            .unwrap()
            .task_definition_arn()
            .unwrap();

        self.ecs_client
            .update_service()
            .cluster(&self.cluster)
            .service(&spec.app)
            .task_definition(task_def_arn)
            .send()
            .await?;

        Ok(task_def_arn.to_string())
    }
}
```

---

- [ ] ### TASK 8-07 — Integration Test Suite

**File:** `tests/integration/`

```
tests/integration/
├── setup.ts           ← start all services, seed test data
├── teardown.ts        ← cleanup
├── auth.test.ts
├── sandbox.test.ts
├── project.test.ts
├── chat.test.ts
├── pipeline.test.ts
├── deploy.test.ts
└── monitoring.test.ts
```

**`tests/integration/setup.ts`:**

```typescript
// Starts all services in test mode
// Uses separate test databases (test_ prefixed)
// Seeds: 1 org, 1 super-admin, 3 users with different roles

export async function setupIntegrationTests() {
  // Start docker-compose test profile
  await execa('docker', ['compose', '-f', 'infra/compose/test.yml', 'up', '-d'])

  // Wait for all services healthy
  await waitForService('http://localhost:4000/health')

  // Seed test data
  await seedTestOrg()
  await seedTestUsers()
  await seedTestProject()
}
```

**Each integration test file covers end-to-end flows:**

```typescript
// deploy.test.ts
describe('Deployment Flow', () => {
  it('triggers deploy, executes all phases, marks live')
  it('blocks deploy when user lacks permission')
  it('pauses on production and waits for approval')
  it('auto-rollbacks when health check fails')
  it('posts success card to project channel')
})
```

---

- [ ] ### TASK 8-08 — devora join Command

**`src/commands/join.rs`:**

```rust
pub async fn run(opts: JoinOpts) -> anyhow::Result<()> {
    println!("{}", "Joining Devora cluster...".bold());

    // 1. Check hardware meets minimum (4 CPU, 8GB)
    let hw = detect::hardware::detect();
    check_minimum_requirements(&hw)?;

    // 2. Install K3s agent mode (not server mode)
    let agent_config = format!(r#"
server: https://{}:6443
token: {}
node-label:
  - "devora.io/role={}"
"#, opts.master_ip, opts.token, opts.role);

    std::fs::write("/etc/rancher/k3s/config.yaml", agent_config)?;

    // Use K3s agent binary (not server)
    let service = format!(r#"
[Unit]
Description=Devora K3s Agent
After=network-online.target

[Service]
Type=notify
ExecStart=/usr/local/bin/k3s agent
Restart=on-failure

[Install]
WantedBy=multi-user.target
"#);
    std::fs::write("/etc/systemd/system/devora-k3s-agent.service", service)?;
    run_cmd("systemctl", &["enable", "--now", "devora-k3s-agent.service"])?;

    // 3. Wait for node Ready on master
    println!("Waiting for node to join cluster...");
    wait_for_node_join(&opts.master_ip, &opts.token).await?;

    println!("{}", "✓ Node successfully joined the cluster!".green());
    println!("  Role: {}", opts.role);
    println!("  The master will begin scheduling workloads on this node shortly.");

    Ok(())
}
```

---

### Sprint 8 Acceptance Criteria

`devora init` completes full install on fresh Ubuntu 22.04 (all profiles) All services healthy after install Platform accessible via configured domain with valid SSL `devora join` adds worker node to cluster within 60 seconds `devora backup` creates encrypted archive of all data `devora restore` restores from backup on fresh install Air-gapped install completes with `--bundle` flag AWS ECS deployment executes end-to-end All integration tests pass `devora status` shows health of all services in terminal

---

## POST-LAUNCH — v1.1 Additions

These are not blocking for v1.0 but should be planned immediately after launch:

```
[ ] GCP Cloud Run provider adapter
[ ] Azure Container Apps provider adapter
[ ] Hetzner Cloud provider adapter
[ ] SSO: Google, GitHub OAuth flows (via Keycloak)
[ ] LDAP / Active Directory integration
[ ] 2FA enforcement for admin roles (TOTP)
[ ] Branch protection rules UI
[ ] Issue template system
[ ] Webhook management UI (custom outbound webhooks)
[ ] Org-level usage reports (PDF export)
[ ] API key management for CI/CD external access
[ ] Devora mobile app (React Native — read-only monitoring)
```

---

## Dependency Order Summary

```
Pre-Sprint  (no deps)
    │
    ▼
Sprint 1 — Auth + RBAC + Portal skeleton
    │
    ├──▶ Sprint 2 — Sandbox (depends on: Auth)
    │
    ├──▶ Sprint 3 — Chat + Notifications (depends on: Auth)
    │         │
    │         ▼
    │    Sprint 4 — Project Management (depends on: Auth, Chat)
    │         │
    │         ▼
    │    Sprint 5 — PRs + CI/CD (depends on: Project)
    │         │
    │         ▼
    │    Sprint 6 — Deploy Engine (depends on: Project, Auth)
    │         │
    │         ▼
    │    Sprint 7 — Monitoring (depends on: all services running)
    │         │
    │         ▼
    │    Sprint 8 — Installer (depends on: all services complete)
    │
    └── Sprints 2 and 3 can run in PARALLEL
        Sprints 4 and on are sequential
```

---

_End of DEVORA_PLAN.md — Total tasks: ~240 across 8 sprints + pre-sprint_
