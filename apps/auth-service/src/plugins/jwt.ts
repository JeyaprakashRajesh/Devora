import fp from 'fastify-plugin'
import { FastifyInstance } from 'fastify'
import fastifyJwt from '@fastify/jwt'
import { config } from '../config.js'

export const jwtPlugin = fp(async (app: FastifyInstance) => {
  await app.register(fastifyJwt, {
    secret: config.JWT_SECRET,
    sign: {
      expiresIn: config.JWT_EXPIRES_IN,
    },
  })
})
