export type Visibility = 'private' | 'internal' | 'public'

export interface Project {
  id: string
  org_id: string
  name: string
  slug: string
  description?: string
  visibility: Visibility
  gitea_repo_id?: number
  gitea_repo_url?: string
  gitea_clone_url?: string
  default_branch: string
  created_by?: string
  created_at: string
  updated_at: string
  member_count?: number
}

export interface ProjectMember {
  id: string
  email: string
  username: string
  display_name?: string
  status: string
  role_id?: string
  role_name?: string
  added_at?: string
  via_group?: string
}

export interface GroupItem {
  id: string
  name: string
  description?: string
  member_count?: number
}

export interface RoleItem {
  id: string
  name: string
}

export interface UserItem {
  id: string
  email: string
  username: string
  display_name?: string
}

export interface Issue {
  id: string
  project_id: string
  number: number
  title: string
  body?: string
  status: 'open' | 'in_progress' | 'closed'
  priority: 'low' | 'medium' | 'high' | 'critical'
  type: 'task' | 'bug' | 'feature'
  assignee_ids: string[]
  assignees?: Array<{
    id: string
    username: string
    display_name?: string
    email: string
  }>
  created_by?: string
  created_at: string
  updated_at: string
}

export interface IssueComment {
  id: string
  body: string
  created_at: string
  author?: {
    id: string
    username: string
    display_name?: string
  }
}

export interface MergeRequest {
  id: string
  project_id: string
  number: number
  title: string
  body?: string
  status: 'open' | 'merged' | 'closed' | 'draft'
  source_branch: string
  target_branch: string
  author_id?: string
  created_at: string
  updated_at: string
  merged_at?: string
  author?: {
    id: string
    username: string
    display_name?: string
    email?: string
  }
  author_name?: string
  author_display?: string
}

export interface MRComment {
  id: string
  body: string
  created_at: string
  author?: {
    id: string
    username: string
    display_name?: string
  }
}

export interface Pipeline {
  id: string
  project_id: string
  name: string
  definition: Record<string, unknown>
  trigger: Record<string, unknown>
  created_at: string
  run_count: number
}

export interface PipelineRun {
  id: string
  pipeline_id?: string
  project_id: string
  status: 'queued' | 'running' | 'passed' | 'failed' | 'cancelled'
  trigger_type?: string
  trigger_actor?: string
  commit_sha?: string
  branch?: string
  started_at?: string
  finished_at?: string
  created_at: string
  jobs?: PipelineJob[]
}

export interface PipelineJob {
  id: string
  name: string
  status: 'pending' | 'queued' | 'running' | 'passed' | 'failed' | 'skipped' | 'cancelled'
  exit_code?: number
  started_at?: string
  finished_at?: string
  logs?: string
  log_size?: number
}

export interface DeployContainer {
  id: string
  org_id: string
  project_id?: string
  project_name?: string
  name: string
  docker_id?: string
  image: string
  status: 'running' | 'stopped' | 'error' | 'creating'
  host_port?: number
  internal_port?: number
  env_vars?: Record<string, string>
  created_at: string
  updated_at: string
}
