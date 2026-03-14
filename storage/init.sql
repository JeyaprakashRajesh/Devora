CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ORGANIZATIONS
CREATE TABLE organizations (
	id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
	name       TEXT NOT NULL,
	slug       TEXT UNIQUE NOT NULL,
	owner_id   UUID,
	created_at TIMESTAMPTZ DEFAULT NOW(),
	updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- USERS
CREATE TABLE users (
	id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
	org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
	email         TEXT UNIQUE NOT NULL,
	username      TEXT NOT NULL,
	display_name  TEXT,
	password_hash TEXT,
	status        TEXT DEFAULT 'active' CHECK (status IN ('active','suspended','invited')),
	is_org_owner  BOOLEAN DEFAULT FALSE,
	last_seen_at  TIMESTAMPTZ,
	created_at    TIMESTAMPTZ DEFAULT NOW(),
	updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Add owner FK after users table exists
ALTER TABLE organizations
	ADD CONSTRAINT fk_org_owner FOREIGN KEY (owner_id) REFERENCES users(id);

-- RESOURCES (things permissions apply to)
CREATE TABLE resources (
	id    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
	name  TEXT UNIQUE NOT NULL,
	label TEXT NOT NULL
);

-- PERMISSIONS (actions on resources)
CREATE TABLE permissions (
	id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
	resource_id UUID NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
	action      TEXT NOT NULL,
	label       TEXT NOT NULL,
	description TEXT,
	UNIQUE(resource_id, action)
);

-- ROLES
CREATE TABLE roles (
	id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
	org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
	name        TEXT NOT NULL,
	description TEXT,
	is_system   BOOLEAN DEFAULT FALSE,
	created_by  UUID REFERENCES users(id),
	created_at  TIMESTAMPTZ DEFAULT NOW(),
	updated_at  TIMESTAMPTZ DEFAULT NOW(),
	UNIQUE(org_id, name)
);

-- ROLE PERMISSIONS (toggle on/off)
CREATE TABLE role_permissions (
	role_id       UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
	permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
	PRIMARY KEY (role_id, permission_id)
);

-- USER ROLES (assign role to user, optionally scoped to one resource)
CREATE TABLE user_roles (
	id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
	user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	role_id       UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
	resource_type TEXT,
	resource_id   UUID,
	granted_by    UUID REFERENCES users(id),
	expires_at    TIMESTAMPTZ,
	created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- USER GROUPS
CREATE TABLE user_groups (
	id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
	org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
	name        TEXT NOT NULL,
	description TEXT,
	created_by  UUID REFERENCES users(id),
	created_at  TIMESTAMPTZ DEFAULT NOW(),
	UNIQUE(org_id, name)
);

CREATE TABLE user_group_members (
	group_id UUID NOT NULL REFERENCES user_groups(id) ON DELETE CASCADE,
	user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	PRIMARY KEY (group_id, user_id)
);

CREATE TABLE group_roles (
	group_id UUID NOT NULL REFERENCES user_groups(id) ON DELETE CASCADE,
	role_id  UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
	PRIMARY KEY (group_id, role_id)
);

-- SESSIONS
CREATE TABLE sessions (
	id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
	user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	token_hash TEXT UNIQUE NOT NULL,
	expires_at TIMESTAMPTZ NOT NULL,
	created_at TIMESTAMPTZ DEFAULT NOW()
);

-- AUDIT LOG
CREATE TABLE audit_logs (
	id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
	org_id        UUID REFERENCES organizations(id),
	actor_id      UUID REFERENCES users(id),
	action        TEXT NOT NULL,
	resource_type TEXT,
	resource_id   UUID,
	metadata      JSONB DEFAULT '{}',
	created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- SEED: 8 resources
INSERT INTO resources (name, label) VALUES
	('user',       'Users'),
	('role',       'Roles'),
	('group',      'User Groups'),
	('project',    'Projects'),
	('repository', 'Repositories'),
	('pipeline',   'Pipelines'),
	('deployment', 'Deployments'),
	('org',        'Organization');

-- SEED: 5 actions x 8 resources = 40 permissions
INSERT INTO permissions (resource_id, action, label)
SELECT r.id, a.action, r.label || ' — ' || initcap(a.action)
FROM resources r
CROSS JOIN (VALUES ('create'),('read'),('update'),('delete'),('manage')) AS a(action);

-- ─────────────────────────────────────
-- PHASE 2: PROJECT MANAGEMENT SCHEMA
-- ─────────────────────────────────────

-- PROJECTS
CREATE TABLE projects (
	id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
	org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
	name            TEXT NOT NULL,
	slug            TEXT NOT NULL,
	description     TEXT,
	visibility      TEXT DEFAULT 'private'
		CHECK (visibility IN ('private','internal','public')),
	gitea_repo_id   INTEGER,
	gitea_repo_url  TEXT,
	gitea_clone_url TEXT,
	default_branch  TEXT DEFAULT 'main',
	created_by      UUID REFERENCES users(id),
	archived_at     TIMESTAMPTZ,
	created_at      TIMESTAMPTZ DEFAULT NOW(),
	updated_at      TIMESTAMPTZ DEFAULT NOW(),
	UNIQUE(org_id, slug)
);

-- PROJECT MEMBERS (individual user assignment)
CREATE TABLE project_members (
	project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
	user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	role_id    UUID REFERENCES roles(id),
	added_by   UUID REFERENCES users(id),
	added_at   TIMESTAMPTZ DEFAULT NOW(),
	PRIMARY KEY (project_id, user_id)
);

-- PROJECT GROUP ASSIGNMENTS (assign entire group to project)
CREATE TABLE project_groups (
	project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
	group_id   UUID NOT NULL REFERENCES user_groups(id) ON DELETE CASCADE,
	role_id    UUID REFERENCES roles(id),
	added_by   UUID REFERENCES users(id),
	added_at   TIMESTAMPTZ DEFAULT NOW(),
	PRIMARY KEY (project_id, group_id)
);

-- ISSUES
CREATE TABLE issues (
	id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
	project_id   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
	number       INTEGER NOT NULL,
	title        TEXT NOT NULL,
	body         TEXT,
	status       TEXT DEFAULT 'open'
		CHECK (status IN ('open','in_progress','closed')),
	priority     TEXT DEFAULT 'medium'
		CHECK (priority IN ('low','medium','high','critical')),
	type         TEXT DEFAULT 'task'
		CHECK (type IN ('task','bug','feature')),
	assignee_ids UUID[] DEFAULT '{}',
	created_by   UUID REFERENCES users(id),
	closed_by    UUID REFERENCES users(id),
	closed_at    TIMESTAMPTZ,
	due_date     DATE,
	created_at   TIMESTAMPTZ DEFAULT NOW(),
	updated_at   TIMESTAMPTZ DEFAULT NOW(),
	UNIQUE(project_id, number)
);

-- Auto-increment issue number per project
CREATE SEQUENCE IF NOT EXISTS issue_number_seq;

CREATE OR REPLACE FUNCTION next_issue_number(p_project_id UUID)
RETURNS INTEGER AS $$
DECLARE
	next_num INTEGER;
BEGIN
	SELECT COALESCE(MAX(number), 0) + 1
	INTO next_num
	FROM issues
	WHERE project_id = p_project_id;
	RETURN next_num;
END;
$$ LANGUAGE plpgsql;

-- ISSUE COMMENTS
CREATE TABLE issue_comments (
	id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
	issue_id   UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
	author_id  UUID NOT NULL REFERENCES users(id),
	body       TEXT NOT NULL,
	created_at TIMESTAMPTZ DEFAULT NOW(),
	updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- MERGE REQUESTS
CREATE TABLE merge_requests (
	id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
	project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
	number        INTEGER NOT NULL,
	title         TEXT NOT NULL,
	body          TEXT,
	status        TEXT DEFAULT 'open'
		CHECK (status IN ('open','merged','closed','draft')),
	source_branch TEXT NOT NULL,
	target_branch TEXT NOT NULL,
	author_id     UUID REFERENCES users(id),
	merged_by     UUID REFERENCES users(id),
	merged_at     TIMESTAMPTZ,
	gitea_pr_id   INTEGER,
	head_sha      TEXT,
	diff_stats    JSONB DEFAULT '{}',
	created_at    TIMESTAMPTZ DEFAULT NOW(),
	updated_at    TIMESTAMPTZ DEFAULT NOW(),
	UNIQUE(project_id, number)
);

-- MERGE REQUEST COMMENTS
CREATE TABLE mr_comments (
	id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
	mr_id       UUID NOT NULL REFERENCES merge_requests(id) ON DELETE CASCADE,
	author_id   UUID NOT NULL REFERENCES users(id),
	body        TEXT NOT NULL,
	file_path   TEXT,
	line_number INTEGER,
	commit_sha  TEXT,
	created_at  TIMESTAMPTZ DEFAULT NOW(),
	updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- PIPELINES (pipeline definitions)
CREATE TABLE pipelines (
	id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
	project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
	name       TEXT NOT NULL,
	definition JSONB NOT NULL,
	trigger    JSONB NOT NULL,
	created_by UUID REFERENCES users(id),
	created_at TIMESTAMPTZ DEFAULT NOW(),
	updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- PIPELINE RUNS (individual executions)
CREATE TABLE pipeline_runs (
	id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
	pipeline_id   UUID REFERENCES pipelines(id) ON DELETE SET NULL,
	project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
	status        TEXT DEFAULT 'queued'
		CHECK (status IN ('queued','running','passed','failed','cancelled')),
	trigger_type  TEXT CHECK (trigger_type IN ('push','manual','schedule','pr')),
	trigger_actor UUID REFERENCES users(id),
	commit_sha    TEXT,
	branch        TEXT,
	started_at    TIMESTAMPTZ,
	finished_at   TIMESTAMPTZ,
	created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- PIPELINE JOBS (individual jobs within a run)
CREATE TABLE pipeline_jobs (
	id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
	run_id      UUID NOT NULL REFERENCES pipeline_runs(id) ON DELETE CASCADE,
	name        TEXT NOT NULL,
	status      TEXT DEFAULT 'pending'
		CHECK (status IN ('pending','running','passed','failed','cancelled','skipped')),
	logs        TEXT DEFAULT '',
	exit_code   INTEGER,
	started_at  TIMESTAMPTZ,
	finished_at TIMESTAMPTZ,
	created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- DEPLOYMENT CONTAINERS
-- Docker containers on host machine allocated by admin for project deployments
CREATE TABLE deploy_containers (
	id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
	org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
	project_id    UUID REFERENCES projects(id) ON DELETE SET NULL,
	name          TEXT NOT NULL,
	docker_id     TEXT,
	image         TEXT NOT NULL,
	status        TEXT DEFAULT 'stopped'
		CHECK (status IN ('stopped','running','error','creating')),
	host_port     INTEGER,
	internal_port INTEGER DEFAULT 3000,
	env_vars      JSONB DEFAULT '{}',
	created_by    UUID REFERENCES users(id),
	created_at    TIMESTAMPTZ DEFAULT NOW(),
	updated_at    TIMESTAMPTZ DEFAULT NOW(),
	UNIQUE(org_id, name)
);

-- WORKSPACES (code-server IDE instances — used in Phase 3)
CREATE TABLE workspaces (
	id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
	project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
	user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	path       TEXT NOT NULL,
	status     TEXT DEFAULT 'stopped'
		CHECK (status IN ('stopped','cloning','ready','error')),
	created_at TIMESTAMPTZ DEFAULT NOW(),
	updated_at TIMESTAMPTZ DEFAULT NOW(),
	UNIQUE(project_id, user_id)
);

-- PROJECT ACTIVITY FEED
CREATE TABLE project_activity (
	id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
	project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
	actor_id   UUID REFERENCES users(id),
	type       TEXT NOT NULL,
	metadata   JSONB DEFAULT '{}',
	created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_project_activity_project_id
	ON project_activity(project_id, created_at DESC);

CREATE INDEX idx_pipeline_runs_project_id
	ON pipeline_runs(project_id, created_at DESC);

CREATE INDEX idx_issues_project_id
	ON issues(project_id, created_at DESC);

CREATE INDEX idx_merge_requests_project_id
	ON merge_requests(project_id, created_at DESC);

