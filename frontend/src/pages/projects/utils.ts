export function unwrapData<T>(payload: unknown): T {
  const wrapped = payload as { data?: T }
  return (wrapped?.data ?? payload) as T
}

export function textOrDash(value?: string | null): string {
  if (!value) return '—'
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : '—'
}

export function asStringRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }
  return value as Record<string, unknown>
}
