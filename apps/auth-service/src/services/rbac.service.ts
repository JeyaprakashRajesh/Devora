import { eq, and, isNull } from 'drizzle-orm'
import { Db, schema } from '@devora/db'

const { userRoles, roles } = schema

export const SYSTEM_ROLES = {
  SUPER_ADMIN: {
    name: 'super_admin',
    scope: 'platform',
    permissions: ['*'],
  },
  ORG_ADMIN: {
    name: 'org_admin',
    scope: 'org',
    permissions: [
      'org:read', 'org:manage',
      'project:read', 'project:create', 'project:delete',
      'user:read', 'user:invite', 'user:remove',
      'role:assign', 'sandbox:read',
      'deploy:read', 'deploy:staging', 'deploy:production',
    ],
  },
  PROJECT_MANAGER: {
    name: 'project_manager',
    scope: 'project',
    permissions: [
      'project:read', 'issue:read', 'issue:manage',
      'sprint:manage', 'milestone:manage',
      'deploy:production', 'monitor:team',
      'pipeline:read',
    ],
  },
  TECH_LEAD: {
    name: 'tech_lead',
    scope: 'project',
    permissions: [
      'project:read', 'issue:read', 'issue:manage',
      'code:read', 'code:write', 'code:merge',
      'pr:approve', 'pipeline:manage',
      'deploy:staging', 'deploy:production',
      'sandbox:create', 'ai:agent',
    ],
  },
  DEVELOPER: {
    name: 'developer',
    scope: 'project',
    permissions: [
      'project:read', 'issue:read', 'issue:update',
      'code:read', 'code:write',
      'pr:create', 'pr:read',
      'pipeline:trigger',
      'deploy:staging',
      'sandbox:create', 'ai:agent',
    ],
  },
  VIEWER: {
    name: 'viewer',
    scope: 'project',
    permissions: [
      'project:read', 'issue:read',
      'code:read', 'pr:read',
      'deploy:read',
    ],
  },
}

export interface AssignRoleDto {
  userId:       string
  roleId:       string
  grantedBy:    string
  resourceType?: string
  resourceId?:   string
  expiresAt?:    Date
}

export class RbacService {
  constructor(private readonly db: Db) {}

  /**
   * Check if a user has the given permission.
   * Wildcard (*) in any role grants all permissions.
   */
  async can(
    userId: string,
    permission: string,
    _resourceType?: string,
    _resourceId?: string
  ): Promise<boolean> {
    const permissions = await this.getPermissions(userId)
    return permissions.includes('*') || permissions.includes(permission)
  }

  /**
   * Get all permissions for a user, flattened from all their roles.
   * Respects expiresAt — expired grants are ignored.
   */
  async getPermissions(userId: string): Promise<string[]> {
    const now = new Date()
    const grants = await this.db
      .select({
        permissions: roles.permissions,
        expiresAt:   userRoles.expiresAt,
      })
      .from(userRoles)
      .leftJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(userRoles.userId, userId))

    const permissions = new Set<string>()
    for (const grant of grants) {
      // Skip expired grants
      if (grant.expiresAt && new Date(grant.expiresAt) < now) continue
      if (grant.permissions) {
        for (const p of grant.permissions as string[]) {
          permissions.add(p)
        }
      }
    }
    return Array.from(permissions)
  }

  async assignRole(dto: AssignRoleDto): Promise<void> {
    await this.db.insert(userRoles).values({
      userId:       dto.userId,
      roleId:       dto.roleId,
      grantedBy:    dto.grantedBy,
      resourceType: dto.resourceType,
      resourceId:   dto.resourceId,
      expiresAt:    dto.expiresAt,
    })
  }

  async revokeRole(userId: string, roleId: string, resourceId?: string): Promise<void> {
    await this.db.delete(userRoles).where(
      and(
        eq(userRoles.userId, userId),
        eq(userRoles.roleId, roleId),
        resourceId ? eq(userRoles.resourceId, resourceId) : isNull(userRoles.resourceId)
      )
    )
  }

  /** Seed all system roles for a given org (idempotent) */
  async seedSystemRoles(orgId: string): Promise<void> {
    for (const role of Object.values(SYSTEM_ROLES)) {
      await this.db
        .insert(roles)
        .values({
          orgId,
          name:        role.name,
          scope:       role.scope,
          permissions: [...role.permissions],
          isSystem:    true,
        })
        .onConflictDoNothing()
    }
  }
}
