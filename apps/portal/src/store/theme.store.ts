import { create } from 'zustand'

export type Theme = 'dark' | 'light'

type ThemeState = {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

const getInitialTheme = (): Theme => {
  if (typeof window === 'undefined') {
    return 'dark'
  }

  const stored = window.localStorage.getItem('devora-theme')
  return stored === 'light' || stored === 'dark' ? stored : 'dark'
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: getInitialTheme(),
  setTheme: (theme) => {
    window.localStorage.setItem('devora-theme', theme)
    set({ theme })
  },
  toggleTheme: () => {
    const nextTheme: Theme = get().theme === 'dark' ? 'light' : 'dark'
    window.localStorage.setItem('devora-theme', nextTheme)
    set({ theme: nextTheme })
  },
}))
