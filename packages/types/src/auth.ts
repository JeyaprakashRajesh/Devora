export type OrgPlan = 'starter' | 'pro' | 'enterprise'
export type UserStatus = 'active' | 'suspended' | 'invited'
export type RoleScope = 'platform' | 'org' | 'project'

export interface Organization {
  id: string
  name: string
  slug: string
  plan: OrgPlan
  settings: Record<string, unknown>
  createdAt: Date
}

export interface User {
  id: string
  orgId: string
  email: string
  username: string
  displayName?: string
  avatarUrl?: string
  status: UserStatus
  lastSeenAt?: Date
  createdAt: Date
}

export interface Role {
  id: string
  orgId?: string
  name: string
  scope: RoleScope
  permissions: string[]
  isSystem: boolean
}

export interface Session {
  id: string
  userId: string
  expiresAt: Date
}

export interface JwtPayload {
  sub: string        // user id
  org: string        // org id
  roles: string[]    // role ids
  iat: number
  exp: number
}
