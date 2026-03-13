import { and, eq } from 'drizzle-orm'
import type { Db } from '@devora/db'
import { schema } from '@devora/db'
import type { Logger } from '@devora/logger'
import { subscribe, Subjects, type SandboxCreatedEvent } from '@devora/nats'
import type { NatsConnection } from 'nats'

const { organizations, users } = schema

export function registerSandboxSubscribers(
  nc: NatsConnection,
  db: Db,
  logger: Logger,
) {
  subscribe<SandboxCreatedEvent>(nc, Subjects.SANDBOX_CREATED, async (event) => {
    const [user] = await db
      .select({ id: users.id, orgId: users.orgId })
      .from(users)
      .where(and(eq(users.id, event.userId), eq(users.orgId, event.orgId)))
      .limit(1)

    const [organization] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.id, event.orgId))
      .limit(1)

    if (!user || !organization) {
      logger.warn({
        workspaceId: event.workspaceId,
        userId: event.userId,
        orgId: event.orgId,
        hasUser: Boolean(user),
        hasOrg: Boolean(organization),
      }, 'Sandbox created event failed auth context verification')
      return
    }

    logger.info({ workspaceId: event.workspaceId, userId: event.userId, orgId: event.orgId }, 'Sandbox created event verified against auth context')
  })
}
