import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface User {
  id: string
  org_id: string
  email: string
  username: string
  display_name?: string
  status: string
  is_org_owner: boolean
  created_at: string
}

export interface Org {
  id: string
  name: string
  slug: string
}

interface AuthState {
  user: User | null
  org: Org | null
  token: string | null
  permissions: string[]
  setAuth: (user: User, org: Org, token: string, permissions: string[]) => void
  clearAuth: () => void
  can: (resource: string, action: string) => boolean
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      org: null,
      token: null,
      permissions: [],
      setAuth: (user, org, token, permissions) =>
        set({ user, org, token, permissions }),
      clearAuth: () =>
        set({ user: null, org: null, token: null, permissions: [] }),
      can: (resource, action) => {
        const { permissions } = get()
        return (
          permissions.includes(`${resource}:manage`) ||
          permissions.includes(`${resource}:${action}`)
        )
      },
    }),
    { name: 'devora-auth' }
  )
)
