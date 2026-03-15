"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.auditLogs = exports.sessions = exports.groupMembers = exports.groups = exports.userRoles = exports.roles = exports.users = exports.organizations = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
exports.organizations = (0, pg_core_1.pgTable)('organizations', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    name: (0, pg_core_1.text)('name').notNull(),
    slug: (0, pg_core_1.text)('slug').unique().notNull(),
    plan: (0, pg_core_1.text)('plan').default('starter').notNull(),
    settings: (0, pg_core_1.jsonb)('settings').default({}).notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
});
exports.users = (0, pg_core_1.pgTable)('users', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    orgId: (0, pg_core_1.uuid)('org_id').references(() => exports.organizations.id, { onDelete: 'cascade' }).notNull(),
    email: (0, pg_core_1.text)('email').unique().notNull(),
    username: (0, pg_core_1.text)('username').notNull(),
    displayName: (0, pg_core_1.text)('display_name'),
    avatarUrl: (0, pg_core_1.text)('avatar_url'),
    passwordHash: (0, pg_core_1.text)('password_hash'),
    status: (0, pg_core_1.text)('status').default('active').notNull(),
    lastSeenAt: (0, pg_core_1.timestamp)('last_seen_at'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
});
exports.roles = (0, pg_core_1.pgTable)('roles', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    orgId: (0, pg_core_1.uuid)('org_id').references(() => exports.organizations.id),
    name: (0, pg_core_1.text)('name').notNull(),
    scope: (0, pg_core_1.text)('scope').notNull(),
    permissions: (0, pg_core_1.jsonb)('permissions').default([]).notNull(),
    isSystem: (0, pg_core_1.boolean)('is_system').default(false).notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
});
exports.userRoles = (0, pg_core_1.pgTable)('user_roles', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    userId: (0, pg_core_1.uuid)('user_id').references(() => exports.users.id, { onDelete: 'cascade' }).notNull(),
    roleId: (0, pg_core_1.uuid)('role_id').references(() => exports.roles.id, { onDelete: 'cascade' }).notNull(),
    resourceType: (0, pg_core_1.text)('resource_type'),
    resourceId: (0, pg_core_1.uuid)('resource_id'),
    grantedBy: (0, pg_core_1.uuid)('granted_by').references(() => exports.users.id),
    expiresAt: (0, pg_core_1.timestamp)('expires_at'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
});
exports.groups = (0, pg_core_1.pgTable)('groups', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    orgId: (0, pg_core_1.uuid)('org_id').references(() => exports.organizations.id, { onDelete: 'cascade' }).notNull(),
    name: (0, pg_core_1.text)('name').notNull(),
    description: (0, pg_core_1.text)('description'),
    createdBy: (0, pg_core_1.uuid)('created_by').references(() => exports.users.id).notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
});
exports.groupMembers = (0, pg_core_1.pgTable)('group_members', {
    groupId: (0, pg_core_1.uuid)('group_id').references(() => exports.groups.id, { onDelete: 'cascade' }).notNull(),
    userId: (0, pg_core_1.uuid)('user_id').references(() => exports.users.id, { onDelete: 'cascade' }).notNull(),
    role: (0, pg_core_1.text)('role').default('member').notNull(),
    joinedAt: (0, pg_core_1.timestamp)('joined_at').defaultNow().notNull(),
});
exports.sessions = (0, pg_core_1.pgTable)('sessions', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    userId: (0, pg_core_1.uuid)('user_id').references(() => exports.users.id, { onDelete: 'cascade' }).notNull(),
    tokenHash: (0, pg_core_1.text)('token_hash').unique().notNull(),
    ipAddress: (0, pg_core_1.inet)('ip_address'),
    userAgent: (0, pg_core_1.text)('user_agent'),
    expiresAt: (0, pg_core_1.timestamp)('expires_at').notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
});
exports.auditLogs = (0, pg_core_1.pgTable)('audit_logs', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    orgId: (0, pg_core_1.uuid)('org_id').references(() => exports.organizations.id),
    actorId: (0, pg_core_1.uuid)('actor_id').references(() => exports.users.id),
    action: (0, pg_core_1.text)('action').notNull(),
    resourceType: (0, pg_core_1.text)('resource_type'),
    resourceId: (0, pg_core_1.uuid)('resource_id'),
    metadata: (0, pg_core_1.jsonb)('metadata').default({}).notNull(),
    ipAddress: (0, pg_core_1.inet)('ip_address'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
});
//# sourceMappingURL=auth.js.map