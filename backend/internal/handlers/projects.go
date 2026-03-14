package handlers

import (
	"context"
	"errors"
	"log"
	"os"
	"regexp"
	"strings"

	"github.com/devora/devora/internal/activity"
	"github.com/devora/devora/internal/db"
	"github.com/devora/devora/internal/gitea"
	"github.com/devora/devora/internal/models"
	"github.com/devora/devora/internal/utils"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
)

var projectSlugRegex = regexp.MustCompile(`^[a-z0-9-]{2,}$`)

type createProjectRequest struct {
	Name        string  `json:"name"`
	Slug        string  `json:"slug"`
	Description *string `json:"description"`
	Visibility  *string `json:"visibility"`
}

type updateProjectRequest struct {
	Name          *string `json:"name"`
	Description   *string `json:"description"`
	Visibility    *string `json:"visibility"`
	DefaultBranch *string `json:"default_branch"`
}

type addProjectMemberRequest struct {
	UserID string  `json:"user_id"`
	RoleID *string `json:"role_id"`
}

type addProjectGroupRequest struct {
	GroupID string  `json:"group_id"`
	RoleID  *string `json:"role_id"`
}

type projectMemberItem struct {
	ID          string  `json:"id"`
	Email       string  `json:"email"`
	Username    string  `json:"username"`
	DisplayName *string `json:"display_name"`
	Status      string  `json:"status"`
	CreatedAt   string  `json:"created_at"`
	RoleID      *string `json:"role_id,omitempty"`
	RoleName    *string `json:"role_name,omitempty"`
	AddedAt     *string `json:"added_at,omitempty"`
	ViaGroup    *string `json:"via_group,omitempty"`
}

func CreateProject(c *gin.Context) {
	ctx := context.Background()
	orgID := c.GetString("orgID")
	userID := c.GetString("userID")
	if orgID == "" || userID == "" {
		utils.Unauthorized(c)
		return
	}

	var req createProjectRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Invalid request body")
		return
	}

	req.Name = strings.TrimSpace(req.Name)
	req.Slug = strings.TrimSpace(req.Slug)
	if req.Name == "" || req.Slug == "" {
		utils.BadRequest(c, "name and slug are required")
		return
	}
	if !projectSlugRegex.MatchString(req.Slug) {
		utils.BadRequest(c, "Slug must be lowercase letters, numbers and hyphens only")
		return
	}

	visibility := "private"
	if req.Visibility != nil && strings.TrimSpace(*req.Visibility) != "" {
		visibility = strings.TrimSpace(*req.Visibility)
	}
	if visibility != "private" && visibility != "internal" && visibility != "public" {
		utils.BadRequest(c, "visibility must be private, internal or public")
		return
	}

	var existingID string
	err := db.Pool.QueryRow(ctx,
		"SELECT id FROM projects WHERE org_id = $1 AND slug = $2",
		orgID, req.Slug,
	).Scan(&existingID)
	if err == nil {
		utils.Conflict(c, "Project slug already exists")
		return
	}
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		utils.InternalError(c, err)
		return
	}

	var orgSlug string
	err = db.Pool.QueryRow(ctx, "SELECT slug FROM organizations WHERE id = $1", orgID).Scan(&orgSlug)
	if err != nil {
		utils.InternalError(c, err)
		return
	}

	tx, err := db.Pool.Begin(ctx)
	if err != nil {
		utils.InternalError(c, err)
		return
	}
	defer tx.Rollback(ctx)

	var project models.Project
	err = tx.QueryRow(ctx, `
		INSERT INTO projects
		  (org_id, name, slug, description, visibility, default_branch, created_by)
		VALUES
		  ($1, $2, $3, $4, $5, 'main', $6)
		RETURNING id, org_id, name, slug, description, visibility,
		          gitea_repo_id, gitea_repo_url, gitea_clone_url,
		          default_branch, created_by, archived_at, created_at, updated_at
	`, orgID, req.Name, req.Slug, req.Description, visibility, userID).Scan(
		&project.ID,
		&project.OrgID,
		&project.Name,
		&project.Slug,
		&project.Description,
		&project.Visibility,
		&project.GiteaRepoID,
		&project.GiteaRepoURL,
		&project.GiteaCloneURL,
		&project.DefaultBranch,
		&project.CreatedBy,
		&project.ArchivedAt,
		&project.CreatedAt,
		&project.UpdatedAt,
	)
	if err != nil {
		utils.InternalError(c, err)
		return
	}

	_, err = tx.Exec(ctx,
		"INSERT INTO project_members (project_id, user_id, added_by) VALUES ($1, $2, $2)",
		project.ID, userID,
	)
	if err != nil {
		utils.InternalError(c, err)
		return
	}

	if err = tx.Commit(ctx); err != nil {
		utils.InternalError(c, err)
		return
	}

	if gitea.Default != nil {
		if err = gitea.Default.CreateOrg(orgSlug, orgSlug); err != nil {
			log.Printf("warning: failed to ensure Gitea org %s: %v", orgSlug, err)
		}

		repoID, cloneURL, repoErr := gitea.Default.CreateRepo(orgSlug, project.Slug)
		if repoErr != nil {
			log.Printf("warning: failed to create Gitea repo for project %s: %v", project.ID, repoErr)
		} else {
			_, upErr := db.Pool.Exec(ctx,
				"UPDATE projects SET gitea_repo_id = $1, gitea_clone_url = $2, updated_at = NOW() WHERE id = $3",
				repoID, cloneURL, project.ID,
			)
			if upErr != nil {
				log.Printf("warning: failed to persist Gitea repo metadata for project %s: %v", project.ID, upErr)
			} else {
				project.GiteaRepoID = &repoID
				project.GiteaCloneURL = &cloneURL
			}
		}

		webhookURL := strings.TrimSuffix(os.Getenv("BACKEND_URL"), "/") + "/api/internal/webhook"
		if webhookURL != "/api/internal/webhook" {
			if hookErr := gitea.Default.CreateWebhook(orgSlug, project.Slug, webhookURL); hookErr != nil {
				log.Printf("warning: failed to register Gitea webhook for project %s: %v", project.ID, hookErr)
			}
		}
	}

	activity.Log(project.ID, userID, "project.created", map[string]interface{}{"name": project.Name})
	if err = writeAuditLog(ctx, orgID, userID, "project.created", "project", project.ID, map[string]interface{}{"name": project.Name, "slug": project.Slug}); err != nil {
		utils.InternalError(c, err)
		return
	}

	utils.Created(c, project)
}

func ListProjects(c *gin.Context) {
	ctx := context.Background()
	orgID := c.GetString("orgID")
	userID := c.GetString("userID")
	if orgID == "" || userID == "" {
		utils.Unauthorized(c)
		return
	}

	isOrgAdmin, err := hasOrgProjectManage(ctx, userID)
	if err != nil {
		utils.InternalError(c, err)
		return
	}

	query := `
		SELECT p.id, p.org_id, p.name, p.slug, p.description, p.visibility,
		       p.gitea_repo_id, p.gitea_repo_url, p.gitea_clone_url, p.default_branch,
		       p.created_by, p.archived_at, p.created_at, p.updated_at,
		       COUNT(pm.user_id) as member_count
		FROM projects p
		LEFT JOIN project_members pm ON pm.project_id = p.id
		WHERE p.org_id = $1 AND p.archived_at IS NULL
		GROUP BY p.id
		ORDER BY p.created_at DESC
	`
	args := []interface{}{orgID}
	if !isOrgAdmin {
		query = `
			SELECT p.id, p.org_id, p.name, p.slug, p.description, p.visibility,
			       p.gitea_repo_id, p.gitea_repo_url, p.gitea_clone_url, p.default_branch,
			       p.created_by, p.archived_at, p.created_at, p.updated_at,
			       COUNT(pm2.user_id) as member_count
			FROM projects p
			JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = $2
			LEFT JOIN project_members pm2 ON pm2.project_id = p.id
			WHERE p.org_id = $1 AND p.archived_at IS NULL
			GROUP BY p.id
			ORDER BY p.created_at DESC
		`
		args = []interface{}{orgID, userID}
	}

	rows, err := db.Pool.Query(ctx, query, args...)
	if err != nil {
		utils.InternalError(c, err)
		return
	}
	defer rows.Close()

	projects := make([]models.Project, 0)
	for rows.Next() {
		var project models.Project
		if scanErr := rows.Scan(
			&project.ID,
			&project.OrgID,
			&project.Name,
			&project.Slug,
			&project.Description,
			&project.Visibility,
			&project.GiteaRepoID,
			&project.GiteaRepoURL,
			&project.GiteaCloneURL,
			&project.DefaultBranch,
			&project.CreatedBy,
			&project.ArchivedAt,
			&project.CreatedAt,
			&project.UpdatedAt,
			&project.MemberCount,
		); scanErr != nil {
			utils.InternalError(c, scanErr)
			return
		}
		projects = append(projects, project)
	}
	if rows.Err() != nil {
		utils.InternalError(c, rows.Err())
		return
	}

	utils.OK(c, projects)
}

func GetProject(c *gin.Context) {
	ctx := context.Background()
	orgID := c.GetString("orgID")
	userID := c.GetString("userID")
	if orgID == "" || userID == "" {
		utils.Unauthorized(c)
		return
	}

	projectID := c.Param("id")
	project, err := loadProjectForOrg(ctx, projectID, orgID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			utils.NotFound(c, "Project not found")
			return
		}
		utils.InternalError(c, err)
		return
	}

	allowed, err := canAccessProject(ctx, projectID, userID)
	if err != nil {
		utils.InternalError(c, err)
		return
	}
	if !allowed {
		utils.Forbidden(c)
		return
	}

	err = db.Pool.QueryRow(ctx, "SELECT COUNT(*) FROM project_members WHERE project_id = $1", projectID).Scan(&project.MemberCount)
	if err != nil {
		utils.InternalError(c, err)
		return
	}

	utils.OK(c, project)
}

func UpdateProject(c *gin.Context) {
	ctx := context.Background()
	orgID := c.GetString("orgID")
	userID := c.GetString("userID")
	if orgID == "" || userID == "" {
		utils.Unauthorized(c)
		return
	}

	projectID := c.Param("id")
	if _, err := loadProjectForOrg(ctx, projectID, orgID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			utils.NotFound(c, "Project not found")
			return
		}
		utils.InternalError(c, err)
		return
	}

	var req updateProjectRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Invalid request body")
		return
	}

	setClauses := make([]string, 0, 4)
	args := make([]interface{}, 0, 8)
	argPos := 1

	if req.Name != nil {
		name := strings.TrimSpace(*req.Name)
		if name == "" {
			utils.BadRequest(c, "name cannot be empty")
			return
		}
		setClauses = append(setClauses, "name = $1")
		args = append(args, name)
		argPos++
	}
	if req.Description != nil {
		setClauses = append(setClauses, "description = $"+itoa(argPos))
		args = append(args, req.Description)
		argPos++
	}
	if req.Visibility != nil {
		visibility := strings.TrimSpace(*req.Visibility)
		if visibility != "private" && visibility != "internal" && visibility != "public" {
			utils.BadRequest(c, "visibility must be private, internal or public")
			return
		}
		setClauses = append(setClauses, "visibility = $"+itoa(argPos))
		args = append(args, visibility)
		argPos++
	}
	if req.DefaultBranch != nil {
		branch := strings.TrimSpace(*req.DefaultBranch)
		if branch == "" {
			utils.BadRequest(c, "default_branch cannot be empty")
			return
		}
		setClauses = append(setClauses, "default_branch = $"+itoa(argPos))
		args = append(args, branch)
		argPos++
	}

	if len(setClauses) == 0 {
		utils.BadRequest(c, "No updatable fields provided")
		return
	}

	query := `UPDATE projects SET ` + strings.Join(setClauses, ", ") + `, updated_at = NOW() WHERE id = $` + itoa(argPos) + ` AND org_id = $` + itoa(argPos+1) + `
	RETURNING id, org_id, name, slug, description, visibility, gitea_repo_id, gitea_repo_url, gitea_clone_url, default_branch, created_by, archived_at, created_at, updated_at`
	args = append(args, projectID, orgID)

	var updated models.Project
	err := db.Pool.QueryRow(ctx, query, args...).Scan(
		&updated.ID,
		&updated.OrgID,
		&updated.Name,
		&updated.Slug,
		&updated.Description,
		&updated.Visibility,
		&updated.GiteaRepoID,
		&updated.GiteaRepoURL,
		&updated.GiteaCloneURL,
		&updated.DefaultBranch,
		&updated.CreatedBy,
		&updated.ArchivedAt,
		&updated.CreatedAt,
		&updated.UpdatedAt,
	)
	if err != nil {
		utils.InternalError(c, err)
		return
	}

	activity.Log(projectID, userID, "project.updated", map[string]interface{}{"name": updated.Name})
	if err = writeAuditLog(ctx, orgID, userID, "project.updated", "project", projectID, map[string]interface{}{"name": updated.Name}); err != nil {
		utils.InternalError(c, err)
		return
	}

	utils.OK(c, updated)
}

func ArchiveProject(c *gin.Context) {
	ctx := context.Background()
	orgID := c.GetString("orgID")
	userID := c.GetString("userID")
	if orgID == "" || userID == "" {
		utils.Unauthorized(c)
		return
	}

	projectID := c.Param("id")
	if _, err := loadProjectForOrg(ctx, projectID, orgID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			utils.NotFound(c, "Project not found")
			return
		}
		utils.InternalError(c, err)
		return
	}

	_, err := db.Pool.Exec(ctx, "UPDATE projects SET archived_at = NOW(), updated_at = NOW() WHERE id = $1 AND org_id = $2", projectID, orgID)
	if err != nil {
		utils.InternalError(c, err)
		return
	}

	activity.Log(projectID, userID, "project.archived", nil)
	if err = writeAuditLog(ctx, orgID, userID, "project.archived", "project", projectID, nil); err != nil {
		utils.InternalError(c, err)
		return
	}

	utils.OK(c, gin.H{"message": "Project archived"})
}

func DeleteProject(c *gin.Context) {
	ctx := context.Background()
	orgID := c.GetString("orgID")
	userID := c.GetString("userID")
	if orgID == "" || userID == "" {
		utils.Unauthorized(c)
		return
	}

	projectID := c.Param("id")
	project, err := loadProjectForOrg(ctx, projectID, orgID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			utils.NotFound(c, "Project not found")
			return
		}
		utils.InternalError(c, err)
		return
	}

	var orgSlug string
	err = db.Pool.QueryRow(ctx, "SELECT slug FROM organizations WHERE id = $1", orgID).Scan(&orgSlug)
	if err != nil {
		utils.InternalError(c, err)
		return
	}

	activity.Log(projectID, userID, "project.deleted", map[string]interface{}{"name": project.Name})

	tx, err := db.Pool.Begin(ctx)
	if err != nil {
		utils.InternalError(c, err)
		return
	}
	defer tx.Rollback(ctx)

	steps := []string{
		"DELETE FROM project_activity WHERE project_id = $1",
		"DELETE FROM pipeline_jobs WHERE run_id IN (SELECT id FROM pipeline_runs WHERE project_id = $1)",
		"DELETE FROM pipeline_runs WHERE project_id = $1",
		"DELETE FROM pipelines WHERE project_id = $1",
		"DELETE FROM mr_comments WHERE mr_id IN (SELECT id FROM merge_requests WHERE project_id = $1)",
		"DELETE FROM merge_requests WHERE project_id = $1",
		"DELETE FROM issue_comments WHERE issue_id IN (SELECT id FROM issues WHERE project_id = $1)",
		"DELETE FROM issues WHERE project_id = $1",
		"DELETE FROM project_groups WHERE project_id = $1",
		"DELETE FROM project_members WHERE project_id = $1",
		"DELETE FROM projects WHERE id = $1",
	}
	for _, q := range steps {
		if _, err = tx.Exec(ctx, q, projectID); err != nil {
			utils.InternalError(c, err)
			return
		}
	}

	if err = tx.Commit(ctx); err != nil {
		utils.InternalError(c, err)
		return
	}

	if gitea.Default != nil {
		if repoErr := gitea.Default.DeleteRepo(orgSlug, project.Slug); repoErr != nil {
			log.Printf("warning: failed to delete Gitea repo for project %s: %v", project.ID, repoErr)
		}
	}

	if err = writeAuditLog(ctx, orgID, userID, "project.deleted", "project", projectID, map[string]interface{}{"name": project.Name}); err != nil {
		utils.InternalError(c, err)
		return
	}

	utils.OK(c, gin.H{"message": "Project deleted"})
}

func ListProjectMembers(c *gin.Context) {
	ctx := context.Background()
	orgID := c.GetString("orgID")
	userID := c.GetString("userID")
	if orgID == "" || userID == "" {
		utils.Unauthorized(c)
		return
	}

	projectID := c.Param("id")
	if _, err := loadProjectForOrg(ctx, projectID, orgID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			utils.NotFound(c, "Project not found")
			return
		}
		utils.InternalError(c, err)
		return
	}

	allowed, err := canAccessProject(ctx, projectID, userID)
	if err != nil {
		utils.InternalError(c, err)
		return
	}
	if !allowed {
		utils.Forbidden(c)
		return
	}

	rows, err := db.Pool.Query(ctx, `
		SELECT u.id, u.email, u.username, u.display_name,
		       u.status, u.created_at::text,
		       pm.role_id::text, pm.added_at::text,
		       r.name
		FROM project_members pm
		JOIN users u ON u.id = pm.user_id
		LEFT JOIN roles r ON r.id = pm.role_id
		WHERE pm.project_id = $1
		ORDER BY pm.added_at ASC
	`, projectID)
	if err != nil {
		utils.InternalError(c, err)
		return
	}
	defer rows.Close()

	membersByID := make(map[string]projectMemberItem)
	for rows.Next() {
		var item projectMemberItem
		if scanErr := rows.Scan(
			&item.ID,
			&item.Email,
			&item.Username,
			&item.DisplayName,
			&item.Status,
			&item.CreatedAt,
			&item.RoleID,
			&item.AddedAt,
			&item.RoleName,
		); scanErr != nil {
			utils.InternalError(c, scanErr)
			return
		}
		membersByID[item.ID] = item
	}
	if rows.Err() != nil {
		utils.InternalError(c, rows.Err())
		return
	}

	groupRows, err := db.Pool.Query(ctx, `
		SELECT u.id, u.email, u.username, u.display_name,
		       u.status, ug.name as via_group
		FROM project_groups pg
		JOIN user_groups ug ON ug.id = pg.group_id
		JOIN user_group_members ugm ON ugm.group_id = ug.id
		JOIN users u ON u.id = ugm.user_id
		WHERE pg.project_id = $1
	`, projectID)
	if err != nil {
		utils.InternalError(c, err)
		return
	}
	defer groupRows.Close()

	for groupRows.Next() {
		var item projectMemberItem
		var viaGroup string
		if scanErr := groupRows.Scan(&item.ID, &item.Email, &item.Username, &item.DisplayName, &item.Status, &viaGroup); scanErr != nil {
			utils.InternalError(c, scanErr)
			return
		}
		if existing, ok := membersByID[item.ID]; ok {
			if existing.ViaGroup == nil {
				existing.ViaGroup = &viaGroup
				membersByID[item.ID] = existing
			}
			continue
		}
		item.ViaGroup = &viaGroup
		membersByID[item.ID] = item
	}
	if groupRows.Err() != nil {
		utils.InternalError(c, groupRows.Err())
		return
	}

	members := make([]projectMemberItem, 0, len(membersByID))
	for _, item := range membersByID {
		members = append(members, item)
	}

	utils.OK(c, gin.H{"members": members, "total": len(members)})
}

func AddProjectMember(c *gin.Context) {
	ctx := context.Background()
	orgID := c.GetString("orgID")
	actorID := c.GetString("userID")
	if orgID == "" || actorID == "" {
		utils.Unauthorized(c)
		return
	}

	projectID := c.Param("id")
	if _, err := loadProjectForOrg(ctx, projectID, orgID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			utils.NotFound(c, "Project not found")
			return
		}
		utils.InternalError(c, err)
		return
	}

	var req addProjectMemberRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Invalid request body")
		return
	}
	req.UserID = strings.TrimSpace(req.UserID)
	if req.UserID == "" {
		utils.BadRequest(c, "user_id is required")
		return
	}

	if _, err := ensureUserInOrg(ctx, req.UserID, orgID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			utils.NotFound(c, "User not found")
			return
		}
		utils.InternalError(c, err)
		return
	}

	var existing int
	err := db.Pool.QueryRow(ctx,
		"SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2",
		projectID, req.UserID,
	).Scan(&existing)
	if err == nil {
		utils.Conflict(c, "User is already a project member")
		return
	}
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		utils.InternalError(c, err)
		return
	}

	if req.RoleID != nil && strings.TrimSpace(*req.RoleID) != "" {
		if _, err = ensureRoleInOrg(ctx, strings.TrimSpace(*req.RoleID), orgID); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				utils.NotFound(c, "Role not found")
				return
			}
			utils.InternalError(c, err)
			return
		}
	}

	_, err = db.Pool.Exec(ctx,
		"INSERT INTO project_members (project_id, user_id, role_id, added_by) VALUES ($1, $2, $3, $4)",
		projectID, req.UserID, req.RoleID, actorID,
	)
	if err != nil {
		utils.InternalError(c, err)
		return
	}

	activity.Log(projectID, actorID, "project.member_added", map[string]interface{}{"user_id": req.UserID})
	if err = writeAuditLog(ctx, orgID, actorID, "project.member_added", "project", projectID, map[string]interface{}{"user_id": req.UserID}); err != nil {
		utils.InternalError(c, err)
		return
	}

	utils.Created(c, gin.H{"message": "Member added"})
}

func RemoveProjectMember(c *gin.Context) {
	ctx := context.Background()
	orgID := c.GetString("orgID")
	actorID := c.GetString("userID")
	if orgID == "" || actorID == "" {
		utils.Unauthorized(c)
		return
	}

	projectID := c.Param("id")
	targetUserID := strings.TrimSpace(c.Param("userId"))
	project, err := loadProjectForOrg(ctx, projectID, orgID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			utils.NotFound(c, "Project not found")
			return
		}
		utils.InternalError(c, err)
		return
	}

	if project.CreatedBy != nil && targetUserID == *project.CreatedBy {
		c.JSON(403, gin.H{"error": "Cannot remove project creator"})
		return
	}

	_, err = db.Pool.Exec(ctx,
		"DELETE FROM project_members WHERE project_id = $1 AND user_id = $2",
		projectID, targetUserID,
	)
	if err != nil {
		utils.InternalError(c, err)
		return
	}

	activity.Log(projectID, actorID, "project.member_removed", map[string]interface{}{"user_id": targetUserID})
	if err = writeAuditLog(ctx, orgID, actorID, "project.member_removed", "project", projectID, map[string]interface{}{"user_id": targetUserID}); err != nil {
		utils.InternalError(c, err)
		return
	}

	utils.OK(c, gin.H{"message": "Member removed"})
}

func AddProjectGroup(c *gin.Context) {
	ctx := context.Background()
	orgID := c.GetString("orgID")
	actorID := c.GetString("userID")
	if orgID == "" || actorID == "" {
		utils.Unauthorized(c)
		return
	}

	projectID := c.Param("id")
	if _, err := loadProjectForOrg(ctx, projectID, orgID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			utils.NotFound(c, "Project not found")
			return
		}
		utils.InternalError(c, err)
		return
	}

	var req addProjectGroupRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Invalid request body")
		return
	}
	req.GroupID = strings.TrimSpace(req.GroupID)
	if req.GroupID == "" {
		utils.BadRequest(c, "group_id is required")
		return
	}

	if _, err := ensureGroupInOrg(ctx, req.GroupID, orgID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			utils.NotFound(c, "Group not found")
			return
		}
		utils.InternalError(c, err)
		return
	}

	var existing int
	err := db.Pool.QueryRow(ctx,
		"SELECT 1 FROM project_groups WHERE project_id = $1 AND group_id = $2",
		projectID, req.GroupID,
	).Scan(&existing)
	if err == nil {
		utils.Conflict(c, "Group already assigned to project")
		return
	}
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		utils.InternalError(c, err)
		return
	}

	if req.RoleID != nil && strings.TrimSpace(*req.RoleID) != "" {
		if _, err = ensureRoleInOrg(ctx, strings.TrimSpace(*req.RoleID), orgID); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				utils.NotFound(c, "Role not found")
				return
			}
			utils.InternalError(c, err)
			return
		}
	}

	_, err = db.Pool.Exec(ctx,
		"INSERT INTO project_groups (project_id, group_id, role_id, added_by) VALUES ($1, $2, $3, $4)",
		projectID, req.GroupID, req.RoleID, actorID,
	)
	if err != nil {
		utils.InternalError(c, err)
		return
	}

	_, err = db.Pool.Exec(ctx, `
		INSERT INTO project_members (project_id, user_id, role_id, added_by)
		SELECT $1, ugm.user_id, $3, NULL
		FROM user_group_members ugm
		WHERE ugm.group_id = $2
		ON CONFLICT (project_id, user_id) DO NOTHING
	`, projectID, req.GroupID, req.RoleID)
	if err != nil {
		utils.InternalError(c, err)
		return
	}

	activity.Log(projectID, actorID, "project.group_added", map[string]interface{}{"group_id": req.GroupID})
	if err = writeAuditLog(ctx, orgID, actorID, "project.group_added", "project", projectID, map[string]interface{}{"group_id": req.GroupID}); err != nil {
		utils.InternalError(c, err)
		return
	}

	utils.Created(c, gin.H{"message": "Group added to project"})
}

func RemoveProjectGroup(c *gin.Context) {
	ctx := context.Background()
	orgID := c.GetString("orgID")
	actorID := c.GetString("userID")
	if orgID == "" || actorID == "" {
		utils.Unauthorized(c)
		return
	}

	projectID := c.Param("id")
	groupID := strings.TrimSpace(c.Param("groupId"))
	if _, err := loadProjectForOrg(ctx, projectID, orgID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			utils.NotFound(c, "Project not found")
			return
		}
		utils.InternalError(c, err)
		return
	}

	var exists int
	err := db.Pool.QueryRow(ctx,
		"SELECT 1 FROM project_groups WHERE project_id = $1 AND group_id = $2",
		projectID, groupID,
	).Scan(&exists)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			utils.NotFound(c, "Project group assignment not found")
			return
		}
		utils.InternalError(c, err)
		return
	}

	_, err = db.Pool.Exec(ctx, "DELETE FROM project_groups WHERE project_id = $1 AND group_id = $2", projectID, groupID)
	if err != nil {
		utils.InternalError(c, err)
		return
	}

	_, err = db.Pool.Exec(ctx, `
		DELETE FROM project_members pm
		WHERE pm.project_id = $1
		  AND pm.user_id IN (
			SELECT ugm.user_id FROM user_group_members ugm
			WHERE ugm.group_id = $2
		  )
		  AND pm.added_by IS NULL
	`, projectID, groupID)
	if err != nil {
		utils.InternalError(c, err)
		return
	}

	activity.Log(projectID, actorID, "project.group_removed", map[string]interface{}{"group_id": groupID})
	if err = writeAuditLog(ctx, orgID, actorID, "project.group_removed", "project", projectID, map[string]interface{}{"group_id": groupID}); err != nil {
		utils.InternalError(c, err)
		return
	}

	utils.OK(c, gin.H{"message": "Group removed from project"})
}

func loadProjectForOrg(ctx context.Context, projectID, orgID string) (models.Project, error) {
	var project models.Project
	err := db.Pool.QueryRow(ctx, `
		SELECT id, org_id, name, slug, description, visibility,
		       gitea_repo_id, gitea_repo_url, gitea_clone_url,
		       default_branch, created_by, archived_at, created_at, updated_at
		FROM projects
		WHERE id = $1 AND org_id = $2
	`, projectID, orgID).Scan(
		&project.ID,
		&project.OrgID,
		&project.Name,
		&project.Slug,
		&project.Description,
		&project.Visibility,
		&project.GiteaRepoID,
		&project.GiteaRepoURL,
		&project.GiteaCloneURL,
		&project.DefaultBranch,
		&project.CreatedBy,
		&project.ArchivedAt,
		&project.CreatedAt,
		&project.UpdatedAt,
	)
	return project, err
}

func hasOrgProjectManage(ctx context.Context, userID string) (bool, error) {
	var count int
	err := db.Pool.QueryRow(ctx, `
		SELECT COUNT(*)
		FROM user_roles ur
		JOIN role_permissions rp ON rp.role_id = ur.role_id
		JOIN permissions p ON p.id = rp.permission_id
		JOIN resources res ON res.id = p.resource_id
		WHERE ur.user_id = $1
		  AND res.name = 'project'
		  AND p.action = 'manage'
		  AND ur.resource_type IS NULL
		  AND ur.resource_id IS NULL
		  AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
	`, userID).Scan(&count)
	if err != nil {
		return false, err
	}
	return count > 0, nil
}

func canAccessProject(ctx context.Context, projectID, userID string) (bool, error) {
	isAdmin, err := hasOrgProjectManage(ctx, userID)
	if err != nil {
		return false, err
	}
	if isAdmin {
		return true, nil
	}

	var hasMembership int
	err = db.Pool.QueryRow(ctx,
		"SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2",
		projectID, userID,
	).Scan(&hasMembership)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return false, nil
		}
		return false, err
	}
	return true, nil
}
