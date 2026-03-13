import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { AuthService } from '../services/auth.service.js'
import { authenticate } from '../middleware/authenticate.js'

const registerSchema = z.object({
  orgName:  z.string().min(2),
  orgSlug:  z.string().min(2).regex(/^[a-z0-9-]+$/).optional(),
  email:    z.string().email(),
  password: z.string().min(8),
  username: z.string().min(2).optional(),
  name:     z.string().min(2).optional(),
})

const loginSchema = z.object({
  email:    z.string().email(),
  password: z.string(),
})

const refreshSchema = z.object({
  sessionId: z.string().uuid(),
})

const forgotPasswordSchema = z.object({
  email: z.string().email(),
})

const resetPasswordSchema = z.object({
  token:       z.string().uuid(),
  newPassword: z.string().min(8),
})

export async function authRoutes(app: FastifyInstance) {
  const authService = new AuthService(app.db, app.redis)

  const slugify = (value: string): string =>
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')

  // POST /auth/register
  app.post('/register', async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({
        code: 'GEN_001',
        message: 'Validation failed',
        details: parsed.error.issues,
      })
    }

    const body = parsed.data
    const orgSlug = body.orgSlug ?? slugify(body.orgName)
    const username = body.username ?? body.name ?? body.email.split('@')[0]

    const result = await authService.register({
      orgName: body.orgName,
      orgSlug,
      email: body.email,
      password: body.password,
      username,
    }, app.nc)

    const login = await authService.login({ email: body.email, password: body.password }, app)

    return reply.code(201).send({
      token: login.token,
      sessionId: login.sessionId,
      user: login.user,
      org: result.org,
    })
  })

  // POST /auth/login
  app.post('/login', async (request, reply) => {
    const body = loginSchema.parse(request.body)
    const result = await authService.login(body, app)
    return reply.send(result)
  })

  // POST /auth/logout
  app.post('/logout', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const payload = request.user as any
    await authService.logout(payload.sessionId, app.redis)
    return reply.code(204).send()
  })

  // GET /auth/me
  app.get('/me', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const payload = request.user as any
    const profile = await authService.getMe(payload.sub, app.db)
    return reply.send(profile)
  })

  // POST /auth/refresh — re-issue JWT from a valid session
  app.post('/refresh', async (request, reply) => {
    const { sessionId } = refreshSchema.parse(request.body)
    const result = await authService.refresh(sessionId, app)
    return reply.send(result)
  })

  // POST /auth/forgot-password — generate reset token
  app.post('/forgot-password', async (request, reply) => {
    const { email } = forgotPasswordSchema.parse(request.body)
    const result = await authService.forgotPassword(email)
    // Always 200 to avoid user enumeration. Token omitted in real production.
    return reply.send({ message: 'If that email exists, a reset link has been sent.' })
  })

  // POST /auth/reset-password — consume reset token and update password
  app.post('/reset-password', async (request, reply) => {
    const { token, newPassword } = resetPasswordSchema.parse(request.body)
    await authService.resetPassword(token, newPassword)
    return reply.send({ message: 'Password updated successfully.' })
  })
}
