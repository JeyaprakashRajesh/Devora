import { and, desc, eq, lt } from 'drizzle-orm'
import type { Db } from '@devora/db'
import { schema } from '@devora/db'
import type { Logger } from '@devora/logger'
import {
  subscribe,
  Subjects,
  type SandboxCreatedEvent,
  type SandboxResourceSpikeEvent,
  type SandboxStartedEvent,
  type SandboxStoppedEvent,
} from '@devora/nats'
import type { NatsConnection } from 'nats'

const { sandboxActivities } = schema

function roundDurationMinutes(durationMs: number): number {
  return Math.round((durationMs / 60_000) * 100) / 100
}

export function registerSandboxSubscribers(
  nc: NatsConnection,
  db: Db,
  logger: Logger,
) {
  subscribe<SandboxCreatedEvent>(nc, Subjects.SANDBOX_CREATED, async (event) => {
    await db.insert(sandboxActivities).values({
      workspaceId: event.workspaceId,
      userId: event.userId,
      orgId: event.orgId,
      eventType: 'created',
      metadata: {
        projectId: event.projectId,
        podName: event.podName,
      },
      recordedAt: new Date(event.createdAt),
    })
  })

  subscribe<SandboxStartedEvent>(nc, Subjects.SANDBOX_STARTED, async (event) => {
    await db.insert(sandboxActivities).values({
      workspaceId: event.workspaceId,
      userId: event.userId,
      orgId: event.orgId,
      eventType: 'started',
      metadata: {
        podName: event.podName,
      },
      recordedAt: new Date(event.startedAt),
    })
  })

  subscribe<SandboxStoppedEvent>(nc, Subjects.SANDBOX_STOPPED, async (event) => {
    const stoppedAt = new Date(event.stoppedAt)
    const [startedEvent] = await db
      .select({ recordedAt: sandboxActivities.recordedAt })
      .from(sandboxActivities)
      .where(and(
        eq(sandboxActivities.workspaceId, event.workspaceId),
        eq(sandboxActivities.eventType, 'started'),
        lt(sandboxActivities.recordedAt, stoppedAt),
      ))
      .orderBy(desc(sandboxActivities.recordedAt))
      .limit(1)

    const durationMinutes = startedEvent
      ? roundDurationMinutes(stoppedAt.getTime() - startedEvent.recordedAt.getTime())
      : undefined

    if (durationMinutes !== undefined) {
      logger.info({ workspaceId: event.workspaceId, durationMinutes }, 'Workspace session duration recorded')
    }

    await db.insert(sandboxActivities).values({
      workspaceId: event.workspaceId,
      userId: event.userId,
      orgId: event.orgId,
      eventType: 'stopped',
      metadata: {
        reason: event.reason,
        ...(durationMinutes !== undefined ? { durationMinutes } : {}),
      },
      recordedAt: stoppedAt,
    })
  })

  subscribe<SandboxResourceSpikeEvent>(nc, Subjects.SANDBOX_RESOURCE_SPIKE, async (event) => {
    await db.insert(sandboxActivities).values({
      workspaceId: event.workspaceId,
      userId: event.userId,
      orgId: event.orgId,
      eventType: 'resource_spike',
      metadata: {
        cpu: event.cpu,
        memory: event.memory,
      },
      recordedAt: new Date(event.detectedAt),
    })
  })
}