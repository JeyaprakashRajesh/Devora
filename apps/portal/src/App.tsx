import { Outlet } from '@tanstack/react-router'
import { useTheme } from './hooks/useTheme'

function App() {
  useTheme()

  return <Outlet />
}

export default App
