import { useEffect } from 'react'
import { useThemeStore } from '../store/theme.store'

export const useTheme = (): { theme: 'dark' | 'light'; toggleTheme: () => void } => {
  const theme = useThemeStore((state) => state.theme)
  const toggleTheme = useThemeStore((state) => state.toggleTheme)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  return { theme, toggleTheme }
}
