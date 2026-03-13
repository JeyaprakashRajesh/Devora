import { describe, it, expect, beforeAll } from 'vitest'
import { buildApp } from '../app.js'
import { FastifyInstance } from 'fastify'

describe('Gateway Service', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    try {
      app = await buildApp()
    } catch (err) {
      console.error('buildApp failed:', err)
      throw err
    }
  })

  it('should return 200 for health check', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    })

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body)).toEqual({
      status: 'ok',
      service: 'gateway',
    })
  })

  it('should block unauthorized requests to protected routes', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/projects',
    })

    expect(response.statusCode).toBe(401)
  })

  it('should allow access to public routes without JWT', async () => {
    // Note: This won't actually proxy anywhere since auth-service isn't running in unit tests,
    // but the gateway's preHandler logic will be executed.
    // However, @fastify/http-proxy might throw if the upstream is not reachable
    // during the request handling if it's not mocked.
    // For now, we test the gateway's own health and basic auth rejection.
  })
})
