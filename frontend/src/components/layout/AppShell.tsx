import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '../../store/auth'
import Sidebar from './Sidebar'
import TopBar from './TopBar'

export default function AppShell() {
  const token = useAuthStore((s) => s.token)

  if (!token) {
    return <Navigate to="/login" replace />
  }

  return (
    <div className="flex h-screen overflow-hidden bg-bg-base">
      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
