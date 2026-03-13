import { pgTable, uuid, text, boolean, timestamp, jsonb, inet } from 'drizzle-orm/pg-core'

export const organizations = pgTable('organizations', {
  id:        uuid('id').primaryKey().defaultRandom(),
  name:      text('name').notNull(),
  slug:      text('slug').unique().notNull(),
  plan:      text('plan').default('starter').notNull(),
  settings:  jsonb('settings').default({}).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const users = pgTable('users', {
  id:           uuid('id').primaryKey().defaultRandom(),
  orgId:        uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  email:        text('email').unique().notNull(),
  username:     text('username').notNull(),
  displayName:  text('display_name'),
  avatarUrl:    text('avatar_url'),
  passwordHash: text('password_hash'),
  status:       text('status').default('active').notNull(),
  lastSeenAt:   timestamp('last_seen_at'),
  createdAt:    timestamp('created_at').defaultNow().notNull(),
})

export const roles = pgTable('roles', {
  id:          uuid('id').primaryKey().defaultRandom(),
  orgId:       uuid('org_id').references(() => organizations.id),
  name:        text('name').notNull(),
  scope:       text('scope').notNull(),
  permissions: jsonb('permissions').default([]).notNull(),
  isSystem:    boolean('is_system').default(false).notNull(),
  createdAt:   timestamp('created_at').defaultNow().notNull(),
})

export const userRoles = pgTable('user_roles', {
  id:           uuid('id').primaryKey().defaultRandom(),
  userId:       uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  roleId:       uuid('role_id').references(() => roles.id, { onDelete: 'cascade' }).notNull(),
  resourceType: text('resource_type'),
  resourceId:   uuid('resource_id'),
  grantedBy:    uuid('granted_by').references(() => users.id),
  expiresAt:    timestamp('expires_at'),
  createdAt:    timestamp('created_at').defaultNow().notNull(),
})

export const groups = pgTable('groups', {
  id:          uuid('id').primaryKey().defaultRandom(),
  orgId:       uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  name:        text('name').notNull(),
  description: text('description'),
  createdBy:   uuid('created_by').references(() => users.id).notNull(),
  createdAt:   timestamp('created_at').defaultNow().notNull(),
})

export const groupMembers = pgTable('group_members', {
  groupId:  uuid('group_id').references(() => groups.id, { onDelete: 'cascade' }).notNull(),
  userId:   uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  role:     text('role').default('member').notNull(),
  joinedAt: timestamp('joined_at').defaultNow().notNull(),
})

export const sessions = pgTable('sessions', {
  id:         uuid('id').primaryKey().defaultRandom(),
  userId:     uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  tokenHash:  text('token_hash').unique().notNull(),
  ipAddress:  inet('ip_address'),
  userAgent:  text('user_agent'),
  expiresAt:  timestamp('expires_at').notNull(),
  createdAt:  timestamp('created_at').defaultNow().notNull(),
})

export const auditLogs = pgTable('audit_logs', {
  id:           uuid('id').primaryKey().defaultRandom(),
  orgId:        uuid('org_id').references(() => organizations.id),
  actorId:      uuid('actor_id').references(() => users.id),
  action:       text('action').notNull(),
  resourceType: text('resource_type'),
  resourceId:   uuid('resource_id'),
  metadata:     jsonb('metadata').default({}).notNull(),
  ipAddress:    inet('ip_address'),
  createdAt:    timestamp('created_at').defaultNow().notNull(),
})
