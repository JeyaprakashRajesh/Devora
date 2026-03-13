import { z } from 'zod'

const isTest = process.env.NODE_ENV === 'test'

const booleanLike = z.preprocess((value) => {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
      return true
    }
    if (normalized === 'false' || normalized === '0' || normalized === 'no') {
      return false
    }
  }
  return value
}, z.boolean())

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4005),
  DATABASE_URL: z.string().url(),
  NATS_URL: z.string().default('nats://localhost:4222'),
  JWT_SECRET: z.string().min(32),
  K8S_NAMESPACE: z.string().default('devora-sandboxes'),
  K8S_IN_CLUSTER: booleanLike.default(false),
  KUBECONFIG_PATH: z.string().optional().default('~/.kube/config'),
  K8S_FAIL_FAST: booleanLike.default(isTest ? false : true),
  WORKSPACE_IMAGE: z.string().default('devora/workspace:latest'),
  WORKSPACE_STORAGE_CLASS: z.string().default('standard'),
  WORKSPACE_DEFAULT_CPU: z.string().default('2'),
  WORKSPACE_DEFAULT_MEMORY: z.string().default('2Gi'),
  WORKSPACE_DEFAULT_STORAGE: z.string().default('10Gi'),
  OLLAMA_URL: z.string().default('http://localhost:11434'),
  PLATFORM_API_URL: z.string().default('http://localhost:4000'),
  IDLE_TIMEOUT_MINUTES: z.coerce.number().default(30),
})

export const config = schema.parse(process.env)
export type Config = typeof config
