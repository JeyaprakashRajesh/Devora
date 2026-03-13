import { ErrorCode } from './codes'

export class DevoraError extends Error {
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
