import { useQuery } from '@tanstack/react-query'
import {
  CheckCircle,
  CircleDot,
  Copy,
  FolderPlus,
  GitMerge,
  GitPullRequest,
  Link as LinkIcon,
  UserPlus,
  XCircle,
} from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import Avatar from '../../../components/ui/Avatar'
import Button from '../../../components/ui/Button'
import Card from '../../../components/ui/Card'
import Spinner from '../../../components/ui/Spinner'
import { api } from '../../../lib/api'
import { timeAgo } from '../../../lib/format'
import type { ProjectMember } from '../types'
import { asStringRecord, textOrDash, unwrapData } from '../utils'
import { useProject } from './ProjectLayout'

type ActivityItem = {
  id: string
  type: string
  metadata?: Record<string, unknown>
  created_at: string
}

function activityText(item: ActivityItem): { text: string; icon: JSX.Element } {
  const metadata = asStringRecord(item.metadata)
  const issueNumber = metadata.issue_number as number | undefined
  const title = String(metadata.title ?? '')
  const branch = String(metadata.branch ?? '')

  if (item.type === 'project.created') {
    return {
      text: 'Project created',
      icon: <FolderPlus className="w-4 h-4 text-accent-amber" />,
    }
  }
  if (item.type === 'issue.created') {
    return {
      text: `Issue #${issueNumber ?? '-'} opened: ${title || 'Untitled issue'}`,
      icon: <CircleDot className="w-4 h-4 text-accent-blue" />,
    }
  }
  if (item.type === 'issue.closed') {
    return {
      text: `Issue #${issueNumber ?? '-'} closed`,
      icon: <CheckCircle className="w-4 h-4 text-accent-green" />,
    }
  }
  if (item.type === 'mr.opened') {
    return {
      text: `MR #${metadata.mr_number ?? '-'} opened: ${title || 'Untitled MR'}`,
      icon: <GitPullRequest className="w-4 h-4 text-accent-violet" />,
    }
  }
  if (item.type === 'mr.merged') {
    return {
      text: `MR #${metadata.mr_number ?? '-'} merged`,
      icon: <GitMerge className="w-4 h-4 text-accent-green" />,
    }
  }
  if (item.type === 'pipeline.passed') {
    return {
      text: `Pipeline passed on ${branch || 'branch'}`,
      icon: <CheckCircle className="w-4 h-4 text-accent-green" />,
    }
  }
  if (item.type === 'pipeline.failed') {
    return {
      text: `Pipeline failed on ${branch || 'branch'}`,
      icon: <XCircle className="w-4 h-4 text-accent-red" />,
    }
  }
  if (item.type === 'project.member_added') {
    return {
      text: 'New member added',
      icon: <UserPlus className="w-4 h-4 text-accent-blue" />,
    }
  }
  return {
    text: item.type,
    icon: <CircleDot className="w-4 h-4 text-text-muted" />,
  }
}

export default function OverviewPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const { project } = useProject()

  const activityQuery = useQuery({
    queryKey: ['project-activity', projectId],
    queryFn: async () => {
      const res = await api.get(`/projects/${projectId}/activity?limit=20`)
      return unwrapData<ActivityItem[]>(res.data)
    },
    enabled: Boolean(projectId),
  })

  const membersQuery = useQuery({
    queryKey: ['project-members', projectId],
    queryFn: async () => {
      const res = await api.get(`/projects/${projectId}/members`)
      return unwrapData<{ members: ProjectMember[]; total: number }>(res.data)
    },
    enabled: Boolean(projectId),
  })

  const members = membersQuery.data?.members ?? []

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      <div className="xl:col-span-2">
        <Card header="Recent Activity" padding="none">
          {activityQuery.isLoading ? (
            <div className="py-12 flex justify-center">
              <Spinner size="lg" />
            </div>
          ) : null}

          {activityQuery.isError ? (
            <div className="py-8 px-4 text-sm text-accent-red">Failed to load activity.</div>
          ) : null}

          {!activityQuery.isLoading && !activityQuery.isError && (activityQuery.data ?? []).length === 0 ? (
            <div className="py-8 px-4 text-sm text-text-muted">No activity yet</div>
          ) : null}

          {(activityQuery.data ?? []).map((item) => {
            const parsed = activityText(item)
            return (
              <div
                key={item.id}
                className="flex items-start gap-3 px-4 py-3 border-b border-border last:border-0"
              >
                <span className="mt-0.5">{parsed.icon}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-text-primary">{parsed.text}</p>
                  <p className="text-xs text-text-muted mt-0.5">{timeAgo(item.created_at)}</p>
                </div>
              </div>
            )
          })}
        </Card>
      </div>

      <div>
        <Card header={`Members (${members.length})`} padding="none">
          {membersQuery.isLoading ? (
            <div className="py-8 flex justify-center">
              <Spinner size="md" />
            </div>
          ) : null}

          {!membersQuery.isLoading && members.length === 0 ? (
            <p className="px-4 py-4 text-sm text-text-muted">No members yet</p>
          ) : null}

          {members.slice(0, 8).map((member) => (
            <div key={member.id} className="flex items-center gap-2 px-4 py-2 border-b border-border last:border-0">
              <Avatar size="sm" name={member.display_name ?? member.username} />
              <div className="min-w-0">
                <p className="text-sm text-text-primary truncate">{member.display_name ?? member.username}</p>
                <p className="text-xs text-text-muted truncate">{member.role_name ?? 'Member'}</p>
              </div>
            </div>
          ))}

          {members.length > 8 ? (
            <div className="px-4 py-3 border-t border-border">
              <Link to="../settings" className="text-xs text-accent-blue hover:underline">
                View all {members.length} members
              </Link>
            </div>
          ) : null}
        </Card>

        <Card className="mt-4" header="Repository" padding="md">
          <div className="flex items-start gap-2">
            <LinkIcon className="w-4 h-4 text-text-muted mt-0.5" />
            <p className="text-xs font-mono text-text-muted truncate flex-1">
              {textOrDash(project.gitea_clone_url)}
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (project.gitea_clone_url) {
                  void navigator.clipboard.writeText(project.gitea_clone_url)
                }
              }}
            >
              <Copy className="w-4 h-4" />
            </Button>
          </div>

          {project.gitea_repo_url ? (
            <a
              href={project.gitea_repo_url}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-accent-blue hover:underline mt-3 inline-block"
            >
              Open in Gitea
            </a>
          ) : null}
        </Card>
      </div>
    </div>
  )
}
