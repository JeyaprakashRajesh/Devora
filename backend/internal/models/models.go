package models

import (
  "encoding/json"
  "time"
)

type Organization struct {
  ID        string    `json:"id"`
  Name      string    `json:"name"`
  Slug      string    `json:"slug"`
  OwnerID   *string   `json:"owner_id"`
  CreatedAt time.Time `json:"created_at"`
  UpdatedAt time.Time `json:"updated_at"`
}

type User struct {
  ID           string     `json:"id"`
  OrgID        string     `json:"org_id"`
  Email        string     `json:"email"`
  Username     string     `json:"username"`
  DisplayName  *string    `json:"display_name"`
  Status       string     `json:"status"`
  IsOrgOwner   bool       `json:"is_org_owner"`
  LastSeenAt   *time.Time `json:"last_seen_at"`
  CreatedAt    time.Time  `json:"created_at"`
  UpdatedAt    time.Time  `json:"updated_at"`
}

type Resource struct {
  ID    string `json:"id"`
  Name  string `json:"name"`
  Label string `json:"label"`
}

type Permission struct {
  ID          string  `json:"id"`
  ResourceID  string  `json:"resource_id"`
  Action      string  `json:"action"`
  Label       string  `json:"label"`
  Description *string `json:"description"`
}

type Role struct {
  ID          string       `json:"id"`
  OrgID       string       `json:"org_id"`
  Name        string       `json:"name"`
  Description *string      `json:"description"`
  IsSystem    bool         `json:"is_system"`
  CreatedAt   time.Time    `json:"created_at"`
  UpdatedAt   time.Time    `json:"updated_at"`
  Permissions []Permission `json:"permissions,omitempty"`
}

type UserGroup struct {
  ID          string    `json:"id"`
  OrgID       string    `json:"org_id"`
  Name        string    `json:"name"`
  Description *string   `json:"description"`
  CreatedAt   time.Time `json:"created_at"`
  MemberCount int       `json:"member_count,omitempty"`
}

type AuditLog struct {
  ID           string                 `json:"id"`
  OrgID        *string                `json:"org_id"`
  ActorID      *string                `json:"actor_id"`
  Action       string                 `json:"action"`
  ResourceType *string                `json:"resource_type"`
  ResourceID   *string                `json:"resource_id"`
  Metadata     map[string]interface{} `json:"metadata"`
  CreatedAt    time.Time              `json:"created_at"`
}

type Project struct {
  ID            string     `json:"id"`
  OrgID         string     `json:"org_id"`
  Name          string     `json:"name"`
  Slug          string     `json:"slug"`
  Description   *string    `json:"description"`
  Visibility    string     `json:"visibility"`
  GiteaRepoID   *int64     `json:"gitea_repo_id"`
  GiteaRepoURL  *string    `json:"gitea_repo_url"`
  GiteaCloneURL *string    `json:"gitea_clone_url"`
  DefaultBranch string     `json:"default_branch"`
  CreatedBy     *string    `json:"created_by"`
  ArchivedAt    *time.Time `json:"archived_at"`
  CreatedAt     time.Time  `json:"created_at"`
  UpdatedAt     time.Time  `json:"updated_at"`
  MemberCount   int        `json:"member_count,omitempty"`
}

type ProjectMember struct {
  ProjectID string    `json:"project_id"`
  UserID    string    `json:"user_id"`
  RoleID    *string   `json:"role_id"`
  AddedBy   *string   `json:"added_by"`
  AddedAt   time.Time `json:"added_at"`
  User      *User     `json:"user,omitempty"`
  Role      *Role     `json:"role,omitempty"`
}

type Issue struct {
  ID          string     `json:"id"`
  ProjectID   string     `json:"project_id"`
  Number      int        `json:"number"`
  Title       string     `json:"title"`
  Body        *string    `json:"body"`
  Status      string     `json:"status"`
  Priority    string     `json:"priority"`
  Type        string     `json:"type"`
  AssigneeIDs []string   `json:"assignee_ids"`
  CreatedBy   *string    `json:"created_by"`
  ClosedBy    *string    `json:"closed_by"`
  ClosedAt    *time.Time `json:"closed_at"`
  DueDate     *string    `json:"due_date"`
  CreatedAt   time.Time  `json:"created_at"`
  UpdatedAt   time.Time  `json:"updated_at"`
}

type IssueComment struct {
  ID        string    `json:"id"`
  IssueID   string    `json:"issue_id"`
  AuthorID  string    `json:"author_id"`
  Body      string    `json:"body"`
  CreatedAt time.Time `json:"created_at"`
  UpdatedAt time.Time `json:"updated_at"`
  Author    *User     `json:"author,omitempty"`
}

type MergeRequest struct {
  ID           string     `json:"id"`
  ProjectID    string     `json:"project_id"`
  Number       int        `json:"number"`
  Title        string     `json:"title"`
  Body         *string    `json:"body"`
  Status       string     `json:"status"`
  SourceBranch string     `json:"source_branch"`
  TargetBranch string     `json:"target_branch"`
  AuthorID     *string    `json:"author_id"`
  MergedBy     *string    `json:"merged_by"`
  MergedAt     *time.Time `json:"merged_at"`
  GiteaPRID    *int       `json:"gitea_pr_id"`
  HeadSHA      *string    `json:"head_sha"`
  CreatedAt    time.Time  `json:"created_at"`
  UpdatedAt    time.Time  `json:"updated_at"`
  Author       *User      `json:"author,omitempty"`
}

type Pipeline struct {
  ID         string          `json:"id"`
  ProjectID  string          `json:"project_id"`
  Name       string          `json:"name"`
  Definition json.RawMessage `json:"definition"`
  Trigger    json.RawMessage `json:"trigger"`
  CreatedBy  *string         `json:"created_by"`
  CreatedAt  time.Time       `json:"created_at"`
}

type PipelineRun struct {
  ID           string        `json:"id"`
  PipelineID   *string       `json:"pipeline_id"`
  ProjectID    string        `json:"project_id"`
  Status       string        `json:"status"`
  TriggerType  *string       `json:"trigger_type"`
  TriggerActor *string       `json:"trigger_actor"`
  CommitSHA    *string       `json:"commit_sha"`
  Branch       *string       `json:"branch"`
  StartedAt    *time.Time    `json:"started_at"`
  FinishedAt   *time.Time    `json:"finished_at"`
  CreatedAt    time.Time     `json:"created_at"`
  Jobs         []PipelineJob `json:"jobs,omitempty"`
}

type PipelineJob struct {
  ID         string     `json:"id"`
  RunID      string     `json:"run_id"`
  Name       string     `json:"name"`
  Status     string     `json:"status"`
  Logs       string     `json:"logs"`
  ExitCode   *int       `json:"exit_code"`
  StartedAt  *time.Time `json:"started_at"`
  FinishedAt *time.Time `json:"finished_at"`
  CreatedAt  time.Time  `json:"created_at"`
}

type DeployContainer struct {
  ID           string            `json:"id"`
  OrgID        string            `json:"org_id"`
  ProjectID    *string           `json:"project_id"`
  Name         string            `json:"name"`
  DockerID     *string           `json:"docker_id"`
  Image        string            `json:"image"`
  Status       string            `json:"status"`
  HostPort     *int              `json:"host_port"`
  InternalPort int               `json:"internal_port"`
  EnvVars      map[string]string `json:"env_vars"`
  CreatedBy    *string           `json:"created_by"`
  CreatedAt    time.Time         `json:"created_at"`
  UpdatedAt    time.Time         `json:"updated_at"`
}

type ProjectActivity struct {
  ID        string                 `json:"id"`
  ProjectID string                 `json:"project_id"`
  ActorID   *string                `json:"actor_id"`
  Type      string                 `json:"type"`
  Metadata  map[string]interface{} `json:"metadata"`
  CreatedAt time.Time              `json:"created_at"`
  Actor     *User                  `json:"actor,omitempty"`
}
