import { createContext, useContext } from 'react'
import { Navigate, NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  CircleDot,
  Code2,
  GitMerge,
  LayoutDashboard,
  LayoutGrid,
  Settings,
  Zap,
} from 'lucide-react'
import Badge from '../../../components/ui/Badge'
import Spinner from '../../../components/ui/Spinner'
import { api } from '../../../lib/api'
import { useAuthStore } from '../../../store/auth'
import type { Project } from '../types'
import { unwrapData } from '../utils'

interface ProjectContextType {
  project: Project
  refetch: () => void
}

export const ProjectContext = createContext<ProjectContextType | undefined>(undefined)

export function useProject() {
  const ctx = useContext(ProjectContext)
  if (!ctx) {
    throw new Error('useProject must be used inside ProjectLayout')
  }
  return ctx
}

function visibilityBadge(visibility: Project['visibility']) {
  if (visibility === 'public') return <Badge variant="success">Public</Badge>
  if (visibility === 'internal') return <Badge variant="info">Internal</Badge>
  return <Badge variant="default">Private</Badge>
}

function tabClass(isActive: boolean, accent: 'amber' | 'violet' = 'amber') {
  return [
    'h-10 border-b-2 inline-flex items-center gap-2 text-sm whitespace-nowrap',
    isActive
      ? accent === 'amber'
        ? 'border-accent-amber text-text-primary'
        : 'border-accent-violet text-accent-violet'
      : 'border-transparent text-text-secondary hover:text-text-primary',
  ].join(' ')
}

export default function ProjectLayout() {
  const { projectId } = useParams<{ projectId: string }>()
  const can = useAuthStore((s) => s.can)
  const navigate = useNavigate()
  const location = useLocation()
  const isIde = location.pathname.endsWith('/ide')

  if (!can('project', 'read')) {
    return <Navigate to="/dashboard" replace />
  }

  const projectQuery = useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => {
      const res = await api.get(`/projects/${projectId}`)
      return unwrapData<Project>(res.data)
    },
    enabled: Boolean(projectId),
  })

  if (projectQuery.isLoading) {
    return (
      <div className="py-16 flex justify-center">
        <Spinner size="lg" />
      </div>
    )
  }

  if (!projectQuery.data || projectQuery.isError) {
    return <div className="text-sm text-accent-red">Failed to load project.</div>
  }

  const project = projectQuery.data

  return (
    <ProjectContext.Provider value={{ project, refetch: () => void projectQuery.refetch() }}>
      <div className="-mx-6 -mt-6 h-full flex flex-col">
        <div className="bg-bg-surface border-b border-border px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h1 className="text-base font-semibold text-text-primary">{project.name}</h1>
            {visibilityBadge(project.visibility)}
          </div>
          <button
            type="button"
            onClick={() => navigate(`/projects/${projectId}/ide`)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded bg-accent-violet/15 text-accent-violet border border-accent-violet/30 hover:bg-accent-violet/25 transition-colors"
          >
            <Code2 className="w-3.5 h-3.5" />
            Open IDE
          </button>
        </div>

        {!isIde ? (
          <div className="bg-bg-surface border-b border-border px-6">
            <div className="flex items-center gap-4 overflow-x-auto">
              <NavLink to="" end className={({ isActive }) => tabClass(isActive)}>
                <LayoutDashboard className="w-4 h-4" />
                Overview
              </NavLink>

              <NavLink to="issues" className={({ isActive }) => tabClass(isActive)}>
                <CircleDot className="w-4 h-4" />
                Issues
              </NavLink>

              <NavLink to="board" className={({ isActive }) => tabClass(isActive)}>
                <LayoutGrid className="w-4 h-4" />
                Board
              </NavLink>

              <NavLink to="mrs" className={({ isActive }) => tabClass(isActive)}>
                <GitMerge className="w-4 h-4" />
                Merge Requests
              </NavLink>

              <NavLink to="pipelines" className={({ isActive }) => tabClass(isActive)}>
                <Zap className="w-4 h-4" />
                Pipelines
              </NavLink>

              <NavLink to="ide" className={({ isActive }) => tabClass(isActive, 'violet')}>
                <Code2 className="w-4 h-4" />
                IDE
              </NavLink>

              {can('project', 'manage') ? (
                <NavLink to="settings" className={({ isActive }) => tabClass(isActive)}>
                  <Settings className="w-4 h-4" />
                  Settings
                </NavLink>
              ) : null}
            </div>
          </div>
        ) : null}

        <main className={isIde ? 'flex-1 overflow-hidden' : 'flex-1 overflow-y-auto px-6 py-6'}>
          <Outlet />
        </main>
      </div>
    </ProjectContext.Provider>
  )
}
