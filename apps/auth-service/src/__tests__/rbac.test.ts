import { randomUUID } from 'node:crypto'
import { connect, JSONCodec } from 'nats'
import { and, eq } from 'drizzle-orm'
import { schema } from '@devora/db'
import { Subjects } from '@devora/nats'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { RbacService, SYSTEM_ROLES } from '../services/rbac.service.js'
import {
  buildTestApp,
  flushRedis,
  getAuthHeader,
  getToken,
  seedOrg,
  seedRole,
  seedUser,
  seedUserWithRole,
  truncateTables,
} from './helpers'

const jc = JSONCodec()

let app: Awaited<ReturnType<typeof buildTestApp>>
let rbac: RbacService

describe('RBAC Integration', () => {
  beforeAll(async () => {
    app = await buildTestApp()
    rbac = new RbacService(app.db)
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(async () => {
    await truncateTables()
    await flushRedis()
  })

  describe('RbacService.can()', () => {
    let orgId: string
    let projectA: string
    let projectB: string
    let superAdmin: { userId: string }
    let orgAdmin: { userId: string }
    let projManager: { userId: string }
    let techLead: { userId: string }
    let developer: { userId: string }
    let viewer: { userId: string }

    beforeEach(async () => {
      const { org } = await seedOrg(app)
      orgId = org.id
      projectA = randomUUID()
      projectB = randomUUID()

      const seededSuperAdmin = await seedUserWithRole(
        app,
        orgId,
        'super_admin',
        'platform',
        SYSTEM_ROLES.SUPER_ADMIN.permissions,
      )
      const seededOrgAdmin = await seedUserWithRole(
        app,
        orgId,
        'org_admin',
        'org',
        SYSTEM_ROLES.ORG_ADMIN.permissions,
      )
      const seededProjectManager = await seedUserWithRole(
        app,
        orgId,
        'project_manager',
        'project',
        SYSTEM_ROLES.PROJECT_MANAGER.permissions,
        { resourceType: 'project', resourceId: projectA },
      )
      const seededTechLead = await seedUserWithRole(
        app,
        orgId,
        'tech_lead',
        'project',
        SYSTEM_ROLES.TECH_LEAD.permissions,
        { resourceType: 'project', resourceId: projectA },
      )
      const seededDeveloper = await seedUserWithRole(
        app,
        orgId,
        'developer',
        'project',
        SYSTEM_ROLES.DEVELOPER.permissions,
        { resourceType: 'project', resourceId: projectA },
      )
      const seededViewer = await seedUserWithRole(
        app,
        orgId,
        'viewer',
        'project',
        SYSTEM_ROLES.VIEWER.permissions,
        { resourceType: 'project', resourceId: projectA },
      )

      superAdmin = { userId: seededSuperAdmin.user.id }
      orgAdmin = { userId: seededOrgAdmin.user.id }
      projManager = { userId: seededProjectManager.user.id }
      techLead = { userId: seededTechLead.user.id }
      developer = { userId: seededDeveloper.user.id }
      viewer = { userId: seededViewer.user.id }
    })

    describe('Super Admin', () => {
      it('can perform any action (wildcard permission)', async () => {
        await expect(rbac.can(superAdmin.userId, 'anything:anywhere')).resolves.toBe(true)
      })

      it('can deploy to production', async () => {
        await expect(rbac.can(superAdmin.userId, 'deploy:production', 'project', projectA)).resolves.toBe(true)
      })

      it('can manage org settings', async () => {
        await expect(rbac.can(superAdmin.userId, 'org:manage', 'org', orgId)).resolves.toBe(true)
      })

      it('can access all projects', async () => {
        await expect(rbac.can(superAdmin.userId, 'project:read', 'project', projectA)).resolves.toBe(true)
        await expect(rbac.can(superAdmin.userId, 'project:read', 'project', projectB)).resolves.toBe(true)
      })
    })

    describe('Org Admin', () => {
      it('can create projects', async () => {
        await expect(rbac.can(orgAdmin.userId, 'project:create')).resolves.toBe(true)
      })

      it('can invite users', async () => {
        await expect(rbac.can(orgAdmin.userId, 'user:invite')).resolves.toBe(true)
      })

      it('can deploy to production', async () => {
        await expect(rbac.can(orgAdmin.userId, 'deploy:production', 'project', projectA)).resolves.toBe(true)
      })

      it('cannot access platform-level hardware metrics', async () => {
        await expect(rbac.can(orgAdmin.userId, 'platform:hardware:metrics')).resolves.toBe(false)
      })
    })

    describe('Project Manager', () => {
      it('can deploy to production on their project', async () => {
        await expect(rbac.can(projManager.userId, 'deploy:production', 'project', projectA)).resolves.toBe(true)
      })

      it('can view team metrics', async () => {
        await expect(rbac.can(projManager.userId, 'monitor:team', 'project', projectA)).resolves.toBe(true)
      })

      it('cannot push code (no code:write)', async () => {
        await expect(rbac.can(projManager.userId, 'code:write', 'project', projectA)).resolves.toBe(false)
      })

      it('cannot approve pull requests (no pr:approve)', async () => {
        await expect(rbac.can(projManager.userId, 'pr:approve', 'project', projectA)).resolves.toBe(false)
      })

      it('cannot manage pipelines (no pipeline:manage)', async () => {
        await expect(rbac.can(projManager.userId, 'pipeline:manage', 'project', projectA)).resolves.toBe(false)
      })

      it('has no permissions on a different project', async () => {
        await expect(rbac.can(projManager.userId, 'deploy:production', 'project', projectB)).resolves.toBe(false)
      })
    })

    describe('Tech Lead', () => {
      it('can merge to main (code:merge)', async () => {
        await expect(rbac.can(techLead.userId, 'code:merge', 'project', projectA)).resolves.toBe(true)
      })

      it('can approve PRs (pr:approve)', async () => {
        await expect(rbac.can(techLead.userId, 'pr:approve', 'project', projectA)).resolves.toBe(true)
      })

      it('can manage CI/CD pipelines (pipeline:manage)', async () => {
        await expect(rbac.can(techLead.userId, 'pipeline:manage', 'project', projectA)).resolves.toBe(true)
      })

      it('can deploy to production', async () => {
        await expect(rbac.can(techLead.userId, 'deploy:production', 'project', projectA)).resolves.toBe(true)
      })

      it('can use AI agent (ai:agent)', async () => {
        await expect(rbac.can(techLead.userId, 'ai:agent', 'project', projectA)).resolves.toBe(true)
      })

      it('cannot manage org settings', async () => {
        await expect(rbac.can(techLead.userId, 'org:manage', 'org', orgId)).resolves.toBe(false)
      })
    })

    describe('Developer', () => {
      it('can push to feature branches (code:write)', async () => {
        await expect(rbac.can(developer.userId, 'code:write', 'project', projectA)).resolves.toBe(true)
      })

      it('can create PRs', async () => {
        await expect(rbac.can(developer.userId, 'pr:create', 'project', projectA)).resolves.toBe(true)
      })

      it('can deploy to staging', async () => {
        await expect(rbac.can(developer.userId, 'deploy:staging', 'project', projectA)).resolves.toBe(true)
      })

      it('cannot deploy to production (no deploy:production)', async () => {
        await expect(rbac.can(developer.userId, 'deploy:production', 'project', projectA)).resolves.toBe(false)
      })

      it('cannot approve PRs (no pr:approve)', async () => {
        await expect(rbac.can(developer.userId, 'pr:approve', 'project', projectA)).resolves.toBe(false)
      })

      it('cannot merge to main (no code:merge)', async () => {
        await expect(rbac.can(developer.userId, 'code:merge', 'project', projectA)).resolves.toBe(false)
      })

      it('can use AI agent (ai:agent)', async () => {
        await expect(rbac.can(developer.userId, 'ai:agent', 'project', projectA)).resolves.toBe(true)
      })

      it('has no permissions on a different project they are not member of', async () => {
        await expect(rbac.can(developer.userId, 'code:write', 'project', projectB)).resolves.toBe(false)
      })
    })

    describe('Viewer', () => {
      it('can read source code (code:read)', async () => {
        await expect(rbac.can(viewer.userId, 'code:read', 'project', projectA)).resolves.toBe(true)
      })

      it('can read issues (issue:read)', async () => {
        await expect(rbac.can(viewer.userId, 'issue:read', 'project', projectA)).resolves.toBe(true)
      })

      it('cannot write code (no code:write)', async () => {
        await expect(rbac.can(viewer.userId, 'code:write', 'project', projectA)).resolves.toBe(false)
      })

      it('cannot create issues (no issue:update)', async () => {
        await expect(rbac.can(viewer.userId, 'issue:update', 'project', projectA)).resolves.toBe(false)
      })

      it('cannot deploy anywhere', async () => {
        await expect(rbac.can(viewer.userId, 'deploy:staging', 'project', projectA)).resolves.toBe(false)
        await expect(rbac.can(viewer.userId, 'deploy:production', 'project', projectA)).resolves.toBe(false)
      })
    })

    describe('Role expiry', () => {
      it('expired role grant is not honoured', async () => {
        const { org } = await seedOrg(app)
        const { user } = await seedUser(app, org.id)
        await seedRole(app, org.id, 'temp_dev', user.id, {
          permissions: ['deploy:production'],
          scope: 'project',
          resourceType: 'project',
          resourceId: randomUUID(),
          expiresAt: new Date(Date.now() - 60_000),
        })

        await expect(rbac.can(user.id, 'deploy:production')).resolves.toBe(false)
      })

      it('non-expired role grant is honoured', async () => {
        const { org } = await seedOrg(app)
        const { user } = await seedUser(app, org.id)
        await seedRole(app, org.id, 'temp_dev', user.id, {
          permissions: ['deploy:production'],
          expiresAt: new Date(Date.now() + 60_000),
        })

        await expect(rbac.can(user.id, 'deploy:production')).resolves.toBe(true)
      })
    })

    describe('Scope isolation', () => {
      it('project-scoped role does not grant access to a different project', async () => {
        await expect(rbac.can(developer.userId, 'code:write', 'project', projectB)).resolves.toBe(false)
      })

      it('org-scoped role applies to all projects in that org', async () => {
        await expect(rbac.can(orgAdmin.userId, 'project:read', 'project', projectA)).resolves.toBe(true)
        await expect(rbac.can(orgAdmin.userId, 'project:read', 'project', projectB)).resolves.toBe(true)
      })

      it('platform-scoped role applies everywhere', async () => {
        await expect(rbac.can(superAdmin.userId, 'deploy:production', 'project', projectA)).resolves.toBe(true)
        await expect(rbac.can(superAdmin.userId, 'deploy:production', 'project', projectB)).resolves.toBe(true)
      })
    })
  })

  describe('Role assignment routes', () => {
    it('POST /orgs/:orgId/users/:userId/roles assigns role and publishes event', async () => {
      const { org } = await seedOrg(app)
      const admin = await seedUserWithRole(app, org.id, 'org_admin', 'org', SYSTEM_ROLES.ORG_ADMIN.permissions)
      const target = await seedUser(app, org.id)
      const role = await seedRole(app, org.id, 'developer', undefined, {
        permissions: SYSTEM_ROLES.DEVELOPER.permissions,
        scope: 'project',
      })

      const token = await getToken(app, admin.user.email, admin.plainPassword)

      const nc = await connect({ servers: process.env.NATS_URL })
      const subscription = nc.subscribe(Subjects.AUTH_ROLE_ASSIGNED)

      const response = await app.inject({
        method: 'POST',
        url: `/orgs/${org.id}/users/${target.user.id}/roles`,
        headers: getAuthHeader(token),
        payload: {
          roleId: role.role.id,
          resourceType: 'project',
          resourceId: randomUUID(),
        },
      })

      expect([200, 201]).toContain(response.statusCode)

      const userRolesRows = await app.db
        .select()
        .from(schema.userRoles)
        .where(and(eq(schema.userRoles.userId, target.user.id), eq(schema.userRoles.roleId, role.role.id)))

      expect(userRolesRows.length).toBeGreaterThan(0)

      const message = await Promise.race([
        (async () => {
          for await (const msg of subscription) {
            return jc.decode(msg.data) as { userId: string; roleId: string }
          }
          return null
        })(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000)),
      ])

      expect(message?.userId).toBe(target.user.id)
      expect(message?.roleId).toBe(role.role.id)

      subscription.unsubscribe()
      await nc.drain()
    })

    it('returns 403 when non-admin tries to assign roles', async () => {
      const { org } = await seedOrg(app)
      const dev = await seedUserWithRole(app, org.id, 'developer', 'project', SYSTEM_ROLES.DEVELOPER.permissions)
      const target = await seedUser(app, org.id)
      const role = await seedRole(app, org.id, 'viewer', undefined, {
        permissions: SYSTEM_ROLES.VIEWER.permissions,
      })
      const token = await getToken(app, dev.user.email, dev.plainPassword)

      const response = await app.inject({
        method: 'POST',
        url: `/orgs/${org.id}/users/${target.user.id}/roles`,
        headers: getAuthHeader(token),
        payload: { roleId: role.role.id },
      })

      expect(response.statusCode).toBe(403)
    })

    it('DELETE /orgs/:orgId/users/:userId/roles/:roleId revokes role', async () => {
      const { org } = await seedOrg(app)
      const admin = await seedUserWithRole(app, org.id, 'org_admin', 'org', SYSTEM_ROLES.ORG_ADMIN.permissions)
      const target = await seedUserWithRole(app, org.id, 'developer', 'project', SYSTEM_ROLES.DEVELOPER.permissions)
      const token = await getToken(app, admin.user.email, admin.plainPassword)

      const revoke = await app.inject({
        method: 'DELETE',
        url: `/orgs/${org.id}/users/${target.user.id}/roles/${target.role.id}`,
        headers: getAuthHeader(token),
      })

      expect(revoke.statusCode).toBe(204)

      const rows = await app.db
        .select()
        .from(schema.userRoles)
        .where(and(eq(schema.userRoles.userId, target.user.id), eq(schema.userRoles.roleId, target.role.id)))

      expect(rows).toHaveLength(0)
      await expect(rbac.can(target.user.id, 'code:write')).resolves.toBe(false)
    })

    it('cannot delete system roles', async () => {
      const { org } = await seedOrg(app)
      const admin = await seedUserWithRole(app, org.id, 'org_admin', 'org', SYSTEM_ROLES.ORG_ADMIN.permissions)
      const token = await getToken(app, admin.user.email, admin.plainPassword)

      const { role } = await seedRole(app, org.id, 'super_admin', undefined, {
        permissions: ['*'],
        scope: 'platform',
        isSystem: true,
      })

      const response = await app.inject({
        method: 'DELETE',
        url: `/orgs/${org.id}/roles/${role.id}`,
        headers: getAuthHeader(token),
      })

      expect([400, 403, 500]).toContain(response.statusCode)
    })
  })
})
