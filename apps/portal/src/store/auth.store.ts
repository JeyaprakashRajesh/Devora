import { create } from 'zustand'

type User = {
  id: string
  name?: string
  displayName?: string
  username?: string
  email: string
  role?: string
}

type Org = {
  id: string
  name: string
}

type AuthPayload = {
  token: string
  user: User
  org: Org | null
  permissions?: string[]
}

type AuthState = {
  token: string | null
  user: User | null
  org: Org | null
  permissions: string[]
  setAuth: (payload: AuthPayload) => void
  clearAuth: () => void
  can: (permission: string) => boolean
}

const storageKey = 'devora-auth'

const loadInitialAuth = (): Pick<AuthState, 'token' | 'user' | 'org' | 'permissions'> => {
  if (typeof window === 'undefined') {
    return { token: null, user: null, org: null, permissions: [] }
  }

  const raw = window.localStorage.getItem(storageKey)
  if (!raw) {
    return { token: null, user: null, org: null, permissions: [] }
  }

  try {
    const parsed = JSON.parse(raw) as Pick<AuthState, 'token' | 'user' | 'org' | 'permissions'>
    return {
      token: parsed.token ?? null,
      user: parsed.user ?? null,
      org: parsed.org ?? null,
      permissions: Array.isArray(parsed.permissions) ? parsed.permissions : [],
    }
  } catch {
    return { token: null, user: null, org: null, permissions: [] }
  }
}

const persistAuth = (state: Pick<AuthState, 'token' | 'user' | 'org' | 'permissions'>): void => {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(storageKey, JSON.stringify(state))
}

export const useAuthStore = create<AuthState>((set, get) => {
  const initial = loadInitialAuth()

  return {
    ...initial,
    setAuth: (payload) => {
      const nextState = {
        token: payload.token,
        user: payload.user,
        org: payload.org ?? null,
        permissions: Array.isArray(payload.permissions) ? payload.permissions : [],
      }
      persistAuth(nextState)
      set(nextState)
    },
    clearAuth: () => {
      window.localStorage.removeItem(storageKey)
      set({ token: null, user: null, org: null, permissions: [] })
    },
    can: (permission) => get().permissions.includes(permission),
  }
})
