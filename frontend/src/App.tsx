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
import GroupsPage from './pages/admin/GroupsPage'
import GroupDetailPage from './pages/admin/GroupDetailPage'
import PermissionsPage from './pages/admin/PermissionsPage'
import RolesPage from './pages/admin/RolesPage'
import NewRolePage from './pages/admin/NewRolePage'
import RoleDetailPage from './pages/admin/RoleDetailPage'
import ProjectsPage from './pages/projects/ProjectsPage'
import NewProjectPage from './pages/projects/NewProjectPage'
import ProjectLayout from './pages/projects/[projectId]/ProjectLayout'
import OverviewPage from './pages/projects/[projectId]/OverviewPage'
import IssuesPage from './pages/projects/[projectId]/IssuesPage'
import NewIssuePage from './pages/projects/[projectId]/NewIssuePage'
import IssuePage from './pages/projects/[projectId]/IssuePage'
import BoardPage from './pages/projects/[projectId]/BoardPage'
import MergeRequestsPage from './pages/projects/[projectId]/MergeRequestsPage'
import MrDetailPage from './pages/projects/[projectId]/MrDetailPage'
import PipelinesPage from './pages/projects/[projectId]/PipelinesPage'
import PipelineRunPage from './pages/projects/[projectId]/PipelineRunPage'
import SettingsPage from './pages/projects/[projectId]/SettingsPage'
import IdePage from './pages/projects/[projectId]/IdePage'
import ContainersPage from './pages/deploy/ContainersPage'
import ContainerDetailPage from './pages/deploy/ContainerDetailPage'
import OnboardingPage from './pages/auth/OnboardingPage'

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
            <Route path="/onboarding" element={<OnboardingPage />} />
            <Route path="/" element={<AppShell />}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<DashboardPage />} />
              <Route path="admin">
                <Route path="users" element={<UsersPage />} />
                <Route path="users/invite" element={<InviteUserPage />} />
                <Route path="users/:id" element={<UserDetailPage />} />
                <Route path="groups" element={<GroupsPage />} />
                <Route path="groups/:id" element={<GroupDetailPage />} />
                <Route path="permissions" element={<PermissionsPage />} />
                <Route path="roles" element={<RolesPage />} />
                <Route path="roles/new" element={<NewRolePage />} />
                <Route path="roles/:id" element={<RoleDetailPage />} />
              </Route>

              <Route path="projects">
                <Route index element={<ProjectsPage />} />
                <Route path="new" element={<NewProjectPage />} />
                <Route path=":projectId" element={<ProjectLayout />}>
                  <Route index element={<OverviewPage />} />
                  <Route path="issues">
                    <Route index element={<IssuesPage />} />
                    <Route path="new" element={<NewIssuePage />} />
                    <Route path=":number" element={<IssuePage />} />
                  </Route>
                  <Route path="board" element={<BoardPage />} />
                  <Route path="mrs">
                    <Route index element={<MergeRequestsPage />} />
                    <Route path=":number" element={<MrDetailPage />} />
                  </Route>
                  <Route path="pipelines" element={<PipelinesPage />} />
                  <Route path="runs/:runId" element={<PipelineRunPage />} />
                  <Route path="settings" element={<SettingsPage />} />
                  <Route path="ide" element={<IdePage />} />
                </Route>
              </Route>

              <Route path="deploy">
                <Route path="containers" element={<ContainersPage />} />
                <Route path="containers/:id" element={<ContainerDetailPage />} />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </ThemeProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
