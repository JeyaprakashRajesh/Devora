export type IssueStatus = 'open' | 'in_progress' | 'closed'
export type IssuePriority = 'low' | 'medium' | 'high' | 'critical'
export type IssueType = 'task' | 'bug' | 'feature' | 'epic'
export type PRStatus = 'open' | 'merged' | 'closed' | 'draft'
export type PipelineStatus = 'queued' | 'running' | 'passed' | 'failed' | 'cancelled'

export interface Project {
  id: string
  orgId: string
  name: string
  slug: string
  description?: string
  visibility: 'private' | 'internal' | 'public'
  defaultBranch: string
  createdBy: string
  createdAt: Date
}

export interface Issue {
  id: string
  projectId: string
  number: number
  title: string
  body?: string
  status: IssueStatus
  priority: IssuePriority
  type: IssueType
  assigneeIds: string[]
  createdBy: string
  createdAt: Date
}

export interface PipelineRun {
  id: string
  pipelineId: string
  projectId: string
  status: PipelineStatus
  commitSha?: string
  branch?: string
  startedAt?: Date
  finishedAt?: Date
}
