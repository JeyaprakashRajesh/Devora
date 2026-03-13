import { and, desc, eq, gt } from 'drizzle-orm'
import type { Db } from '@devora/db'
import { schema } from '@devora/db'
import type { Logger } from '@devora/logger'
import {
  subscribe,
  Subjects,
  type SandboxCreatedEvent,
  type SandboxResourceSpikeEvent,
  type SandboxStoppedEvent,
} from '@devora/nats'
import type { NatsConnection } from 'nats'

const { notifications } = schema

async function createNotification(
  db: Db,
  payload: typeof notifications.$inferInsert,
) {
  await db.insert(notifications).values(payload)
}

export function registerSandboxSubscribers(
  nc: NatsConnection,
  db: Db,
  logger: Logger,
) {
  subscribe<SandboxStoppedEvent>(nc, Subjects.SANDBOX_STOPPED, async (event) => {
    if (event.reason === 'manual' || event.reason === 'deleted') {
      return
    }

    if (event.reason === 'idle') {
      await createNotification(db, {
        userId: event.userId,
        orgId: event.orgId,
        type: 'sandbox_idle_stopped',
        title: 'Your workspace was stopped',
        body: 'Your workspace was automatically stopped after 30 minutes of inactivity. Your files are preserved.',
        actionUrl: '/ide',
        sourceType: 'workspace',
        sourceId: event.workspaceId,
      })
      return
    }

    await createNotification(db, {
      userId: event.userId,
      orgId: event.orgId,
      type: 'sandbox_error',
      title: 'Your workspace stopped unexpectedly',
      body: 'Your workspace encountered an error and was stopped. Please try restarting.',
      actionUrl: `/ide/${event.workspaceId}`,
      sourceType: 'workspace',
      sourceId: event.workspaceId,
    })
  })

  subscribe<SandboxResourceSpikeEvent>(nc, Subjects.SANDBOX_RESOURCE_SPIKE, async (event) => {
    // Memory spikes are already filtered upstream to >90% of the workspace limit.
    const severeMemorySpike = event.memory > 0
    if (event.cpu <= 95 && !severeMemorySpike) {
      return
    }

    const cutoff = new Date(Date.now() - 30 * 60_000)
    const [recentNotification] = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(and(
        eq(notifications.type, 'sandbox_resource_spike'),
        eq(notifications.sourceId, event.workspaceId),
        gt(notifications.createdAt, cutoff),
      ))
      .orderBy(desc(notifications.createdAt))
      .limit(1)

    if (recentNotification) {
      return
    }

    await createNotification(db, {
      userId: event.userId,
      orgId: event.orgId,
      type: 'sandbox_resource_spike',
      title: 'High resource usage detected',
      body: `Your workspace is using ${Math.round(event.cpu)}% CPU. Consider stopping unused processes.`,
      actionUrl: `/ide/${event.workspaceId}`,
      sourceType: 'workspace',
      sourceId: event.workspaceId,
    })
  })

  subscribe<SandboxCreatedEvent>(nc, Subjects.SANDBOX_CREATED, async (event) => {
    logger.info({ workspaceId: event.workspaceId, userId: event.userId }, 'Sandbox created event received')
  })
}