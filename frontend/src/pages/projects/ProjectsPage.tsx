import { useNavigate, Navigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { FolderGit2, GitBranch } from 'lucide-react'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Spinner from '../../components/ui/Spinner'
import { api } from '../../lib/api'
import { timeAgo } from '../../lib/format'
import { useAuthStore } from '../../store/auth'
import type { Project } from './types'
import { unwrapData } from './utils'

function visibilityBadge(visibility: Project['visibility']) {
  if (visibility === 'public') return <Badge variant="success">Public</Badge>
  if (visibility === 'internal') return <Badge variant="info">Internal</Badge>
  return <Badge variant="default">Private</Badge>
}

export default function ProjectsPage() {
  const navigate = useNavigate()
  const can = useAuthStore((s) => s.can)

  if (!can('project', 'read')) {
    return <Navigate to="/dashboard" replace />
  }

  const projectsQuery = useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const res = await api.get('/projects')
      return unwrapData<Project[]>(res.data)
    },
  })

  const projects = projectsQuery.data ?? []

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-text-primary">Projects</h1>
          <p className="text-sm text-text-muted mt-0.5">{projects.length} projects</p>
        </div>
        {can('project', 'create') ? (
          <Button size="sm" onClick={() => navigate('/projects/new')}>
            New Project
          </Button>
        ) : null}
      </div>

      {projectsQuery.isLoading ? (
        <div className="py-16 flex justify-center">
          <Spinner size="lg" />
        </div>
      ) : null}

      {projectsQuery.isError ? (
        <div className="mt-6 text-sm text-accent-red">Failed to load projects.</div>
      ) : null}

      {!projectsQuery.isLoading && !projectsQuery.isError && projects.length === 0 ? (
        <Card className="mt-6" padding="md">
          <div className="py-10 flex flex-col items-center text-center gap-3">
            <FolderGit2 className="w-10 h-10 text-text-muted" />
            <p className="text-sm text-text-secondary">No projects yet</p>
            {can('project', 'create') ? (
              <Button size="sm" onClick={() => navigate('/projects/new')}>
                Create your first project
              </Button>
            ) : null}
          </div>
        </Card>
      ) : null}

      {!projectsQuery.isLoading && !projectsQuery.isError && projects.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 mt-6">
          {projects.map((project) => (
            <button
              key={project.id}
              type="button"
              onClick={() => navigate(`/projects/${project.id}`)}
              className="text-left"
            >
              <Card
                padding="md"
                className="h-full transition-colors hover:border-accent-amber/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="font-semibold text-text-primary leading-tight">{project.name}</p>
                  {visibilityBadge(project.visibility)}
                </div>

                <p className="text-sm text-text-muted mt-1 min-h-[40px] overflow-hidden">
                  {project.description?.trim() || 'No description'}
                </p>

                <div className="mt-4 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs text-text-muted">
                    <span>{project.member_count ?? 0} members</span>
                    <span className="text-border-strong">•</span>
                    <GitBranch className="w-3.5 h-3.5" />
                    <span>{project.default_branch}</span>
                  </div>
                  <span className="text-xs text-text-muted">{timeAgo(project.created_at)}</span>
                </div>
              </Card>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
