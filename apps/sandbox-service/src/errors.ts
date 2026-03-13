import { DevoraError } from '@devora/errors'

export class WorkspaceNotFoundError extends DevoraError {
  constructor(workspaceId: string) {
    super('GEN_003', `Workspace '${workspaceId}' not found`, 404)
  }
}

export class WorkspaceTimeoutError extends DevoraError {
  constructor(workspaceId: string) {
    super('GEN_002', `Workspace '${workspaceId}' timed out waiting to become ready`, 504)
  }
}

export class WorkspaceFailedError extends DevoraError {
  constructor(workspaceId: string, reason?: string) {
    super(
      'GEN_002',
      `Workspace '${workspaceId}' failed to start${reason ? `: ${reason}` : ''}`,
      500,
    )
  }
}

export class WorkspaceOwnershipError extends DevoraError {
  constructor() {
    super('AUTH_002', 'You do not have access to this workspace', 403)
  }
}

export class SandboxInfrastructureUnavailableError extends DevoraError {
  constructor(reason?: string) {
    super(
      'GEN_002',
      reason ?? 'Sandbox infrastructure is unavailable. Ensure Kubernetes is reachable.',
      503,
    )
  }
}