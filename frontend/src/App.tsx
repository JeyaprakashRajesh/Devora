import type { ReactNode } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import AppShell from './components/layout/AppShell'
import { useTheme } from './hooks/useTheme'
import { queryClient } from './lib/queryClient'
import LoginPage from './pages/auth/LoginPage'
import RegisterPage from './pages/auth/RegisterPage'
import DashboardPage from './pages/dashboard/DashboardPage'
import UsersPage from './pages/admin/UsersPage'
import InviteUserPage from './pages/admin/InviteUserPage'
import UserDetailPage from './pages/admin/UserDetailPage'
import RolesPage from './pages/admin/RolesPage'
import NewRolePage from './pages/admin/NewRolePage'
import RoleDetailPage from './pages/admin/RoleDetailPage'
import GroupsPage from './pages/admin/GroupsPage'
import GroupDetailPage from './pages/admin/GroupDetailPage'

function ThemeProvider({ children }: { children: ReactNode }) {
  useTheme()
  return <>{children}</>
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ThemeProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/" element={<AppShell />}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<DashboardPage />} />
              <Route path="admin">
                <Route path="users" element={<UsersPage />} />
                <Route path="users/invite" element={<InviteUserPage />} />
                <Route path="users/:id" element={<UserDetailPage />} />
                <Route path="roles" element={<RolesPage />} />
                <Route path="roles/new" element={<NewRolePage />} />
                <Route path="roles/:id" element={<RoleDetailPage />} />
                <Route path="groups" element={<GroupsPage />} />
                <Route path="groups/:id" element={<GroupDetailPage />} />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </ThemeProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
