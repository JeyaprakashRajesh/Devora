/**
 * Unit tests for sandbox route input sanitization / validation.
 * Covers UUID parsing, body schema validation (projectId), and query clamping.
 */
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { ValidationError } from '@devora/errors'

// ── replicate the schemas used in workspaces routes ────────────────────────

const workspaceIdSchema = z.string().uuid()
const createWorkspaceSchema = z.object({
  projectId: z.string().uuid().optional(),
})
const logsQuerySchema = z.object({
  tailLines: z.preprocess(
    (value) => {
      if (value === undefined) return 100
      const parsed = Number(value)
      if (Number.isNaN(parsed)) return value
      return Math.min(1000, Math.max(1, parsed))
    },
    z.coerce.number().min(1).max(1000).default(100),
  ),
})

function parseWorkspaceId(value: string): string {
  const result = workspaceIdSchema.safeParse(value)
  if (!result.success) throw new ValidationError('Invalid workspace ID')
  return result.data
}

// ── UUID validation ────────────────────────────────────────────────────────

describe('parseWorkspaceId()', () => {
  it('accepts a valid UUID v4', () => {
    const id = '550e8400-e29b-41d4-a716-446655440000'
    expect(parseWorkspaceId(id)).toBe(id)
  })

  it('throws ValidationError for plain string', () => {
    expect(() => parseWorkspaceId('not-a-uuid')).toThrow(ValidationError)
  })

  it('throws ValidationError for empty string', () => {
    expect(() => parseWorkspaceId('')).toThrow(ValidationError)
  })

  it('throws ValidationError for numeric string', () => {
    expect(() => parseWorkspaceId('12345')).toThrow(ValidationError)
  })

  it('throws ValidationError for SQL injection attempt', () => {
    expect(() => parseWorkspaceId("1'; DROP TABLE workspaces; --")).toThrow(ValidationError)
  })

  it('throws ValidationError for path traversal attempt', () => {
    expect(() => parseWorkspaceId('../../etc/passwd')).toThrow(ValidationError)
  })

  it('throws ValidationError for XSS attempt', () => {
    expect(() => parseWorkspaceId('<script>alert(1)</script>')).toThrow(ValidationError)
  })
})

// ── Create workspace body validation ───────────────────────────────────────

describe('createWorkspaceSchema (projectId validation)', () => {
  it('accepts empty body (no projectId)', () => {
    const result = createWorkspaceSchema.safeParse({})
    expect(result.success).toBe(true)
    expect(result.data?.projectId).toBeUndefined()
  })

  it('accepts valid UUID projectId', () => {
    const result = createWorkspaceSchema.safeParse({
      projectId: '550e8400-e29b-41d4-a716-446655440000',
    })
    expect(result.success).toBe(true)
  })

  it('rejects non-UUID projectId string', () => {
    const result = createWorkspaceSchema.safeParse({ projectId: 'not-a-uuid' })
    expect(result.success).toBe(false)
  })

  it('rejects numeric projectId', () => {
    const result = createWorkspaceSchema.safeParse({ projectId: 12345 })
    expect(result.success).toBe(false)
  })

  it('rejects injection in projectId', () => {
    const result = createWorkspaceSchema.safeParse({
      projectId: "'; DROP TABLE workspaces; --",
    })
    expect(result.success).toBe(false)
  })
})

// ── Logs query clamping ─────────────────────────────────────────────────────

describe('logsQuerySchema (tailLines clamping)', () => {
  it('defaults to 100 when not provided', () => {
    const result = logsQuerySchema.safeParse({})
    expect(result.success).toBe(true)
    expect(result.data?.tailLines).toBe(100)
  })

  it('clamps tailLines to max 1000', () => {
    const result = logsQuerySchema.safeParse({ tailLines: '5000' })
    expect(result.success).toBe(true)
    expect(result.data?.tailLines).toBe(1000)
  })

  it('clamps tailLines to min 1', () => {
    const result = logsQuerySchema.safeParse({ tailLines: '0' })
    expect(result.success).toBe(true)
    expect(result.data?.tailLines).toBe(1)
  })

  it('accepts valid tailLines value', () => {
    const result = logsQuerySchema.safeParse({ tailLines: '50' })
    expect(result.success).toBe(true)
    expect(result.data?.tailLines).toBe(50)
  })

  it('clamps negative tailLines to 1', () => {
    const result = logsQuerySchema.safeParse({ tailLines: '-10' })
    expect(result.success).toBe(true)
    expect(result.data?.tailLines).toBe(1)
  })
})
