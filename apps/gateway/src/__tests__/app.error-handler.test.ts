import { describe, expect, it } from 'vitest'
import { isUpstreamNetworkError } from '../app.js'

describe('isUpstreamNetworkError', () => {
  it('returns true for undici socket errors', () => {
    expect(isUpstreamNetworkError({ code: 'UND_ERR_SOCKET' })).toBe(true)
  })

  it('returns true for common connection failures', () => {
    expect(isUpstreamNetworkError({ code: 'ECONNREFUSED' })).toBe(true)
    expect(isUpstreamNetworkError({ code: 'ETIMEDOUT' })).toBe(true)
  })

  it('returns false for unrelated errors', () => {
    expect(isUpstreamNetworkError({ code: 'FST_ERR_VALIDATION' })).toBe(false)
    expect(isUpstreamNetworkError(new Error('oops'))).toBe(false)
    expect(isUpstreamNetworkError(null)).toBe(false)
  })
})
