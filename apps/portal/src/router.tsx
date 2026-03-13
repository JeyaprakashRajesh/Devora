import {
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from '@tanstack/react-router'
import App from './App'
import { AppShell } from './components/layout/AppShell'
import { useAuthStore } from './store/auth.store'
import { LoginPage } from './pages/auth/LoginPage'
import { RegisterPage } from './pages/auth/RegisterPage'
import { DashboardPage } from './pages/dashboard/DashboardPage'
import { IdePage } from './pages/ide/IdePage'

const rootRoute = createRootRoute({
  component: App,
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => {
    const token = useAuthStore.getState().token
    throw redirect({ to: token ? '/dashboard' : '/login' })
  },
})

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
})

const registerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/register',
  component: RegisterPage,
})

const protectedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'app',
  component: AppShell,
  beforeLoad: () => {
    const token = useAuthStore.getState().token
    if (!token) {
      throw redirect({ to: '/login' })
    }
  },
})

const dashboardRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/dashboard',
  component: DashboardPage,
})

const ideRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/ide',
  component: IdePage,
})

const ideWorkspaceRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/ide/$workspaceId',
  component: IdePage,
})

const sandboxesRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/sandboxes',
  component: DashboardPage,
})

const projectsRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/projects',
  component: DashboardPage,
})

const issuesRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/issues',
  component: DashboardPage,
})

const boardRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/board',
  component: DashboardPage,
})

const chatRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/chat',
  component: DashboardPage,
})

const prsRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/prs',
  component: DashboardPage,
})

const deploymentsRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/deployments',
  component: DashboardPage,
})

const targetsRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/targets',
  component: DashboardPage,
})

const dashboardsRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/dashboards',
  component: DashboardPage,
})

const alertsRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/alerts',
  component: DashboardPage,
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  registerRoute,
  protectedRoute.addChildren([
    dashboardRoute,
    ideWorkspaceRoute,
    ideRoute,
    sandboxesRoute,
    projectsRoute,
    issuesRoute,
    boardRoute,
    chatRoute,
    prsRoute,
    deploymentsRoute,
    targetsRoute,
    dashboardsRoute,
    alertsRoute,
  ]),
])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
