import { Outlet, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { useAuthStore } from '../../store/auth.store'

export function AppShell() {
  const token = useAuthStore((state) => state.token)
  const navigate = useNavigate()

  useEffect(() => {
    if (!token) {
      navigate({ to: '/login' })
    }
  }, [token, navigate])

  if (!token) {
    return null
  }

  return (
    <div className="min-h-screen bg-bg-base">
      <TopBar />
      <Sidebar />
      <main className="ml-[220px] pt-12">
        <div className="h-[calc(100vh-48px)] overflow-y-auto p-6">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
