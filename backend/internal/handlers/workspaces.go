package handlers

import (
	"context"
	"errors"
	"fmt"
	"log"
	"os"
	"os/exec"
	"strings"

	"github.com/devora/devora/internal/db"
	"github.com/devora/devora/internal/pipeline"
	"github.com/devora/devora/internal/utils"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type openWorkspaceRequest struct {
	ProjectID string `json:"project_id"`
}

type commitWorkspaceRequest struct {
	Message string `json:"message"`
}

type workspaceProjectInfo struct {
	ID            string
	Slug          string
	GiteaCloneURL *string
	DefaultBranch string
	OrgSlug       string
}

type workspaceRecord struct {
	ID        string `json:"id"`
	ProjectID string `json:"project_id"`
	UserID    string `json:"user_id"`
	Path      string `json:"path"`
	Status    string `json:"status"`
	CreatedAt string `json:"created_at"`
	UpdatedAt string `json:"updated_at"`
}

func ideContainerName() string {
	return strings.TrimSpace(os.Getenv("IDE_CONTAINER_NAME"))
}

func workspaceIDEURL(path string) string {
	return fmt.Sprintf("http://localhost:3000/ide/?folder=%s", path)
}

func workspaceStatusMessage(status string) string {
	switch status {
	case "cloning":
		return "Cloning repository, please wait..."
	case "ready":
		return "Workspace ready"
	case "error":
		return "Workspace setup failed. Click retry."
	case "stopped":
		return "Workspace stopped"
	default:
		return "Workspace status unknown"
	}
}

func hasProjectWorkspaceAccess(ctx context.Context, projectID, userID string) (bool, error) {
	var memberCount int
	err := db.Pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM project_members
		 WHERE project_id=$1 AND user_id=$2`,
		projectID, userID,
	).Scan(&memberCount)
	if err != nil {
		return false, err
	}
	if memberCount > 0 {
		return true, nil
	}

	var adminCount int
	err = db.Pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM user_roles ur
		 JOIN role_permissions rp ON rp.role_id = ur.role_id
		 JOIN permissions p ON p.id = rp.permission_id
		 JOIN resources res ON res.id = p.resource_id
		 WHERE ur.user_id=$1
		   AND res.name='project'
		   AND (p.action='manage' OR p.action='read')
		   AND (
			 (ur.resource_type IS NULL AND ur.resource_id IS NULL)
			 OR (ur.resource_type = 'project' AND ur.resource_id::text = $2)
		   )
		   AND (ur.expires_at IS NULL OR ur.expires_at > NOW())`,
		userID, projectID,
	).Scan(&adminCount)
	if err != nil {
		return false, err
	}

	return adminCount > 0, nil
}

func OpenWorkspace(c *gin.Context) {
	ctx := context.Background()
	userID := c.GetString("userID")
	orgID := c.GetString("orgID")
	if userID == "" || orgID == "" {
		utils.Unauthorized(c)
		return
	}

	var req openWorkspaceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Invalid request body")
		return
	}
	req.ProjectID = strings.TrimSpace(req.ProjectID)
	if req.ProjectID == "" {
		utils.BadRequest(c, "project_id is required")
		return
	}

	var project workspaceProjectInfo
	err := db.Pool.QueryRow(ctx, `
		SELECT p.id, p.slug, p.gitea_clone_url, p.default_branch,
		       o.slug as org_slug
		FROM projects p
		JOIN organizations o ON o.id = p.org_id
		WHERE p.id=$1 AND p.org_id=$2
	`, req.ProjectID, orgID).Scan(
		&project.ID,
		&project.Slug,
		&project.GiteaCloneURL,
		&project.DefaultBranch,
		&project.OrgSlug,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			utils.NotFound(c, "Project not found")
			return
		}
		utils.InternalError(c, err)
		return
	}

	allowed, err := hasProjectWorkspaceAccess(ctx, req.ProjectID, userID)
	if err != nil {
		utils.InternalError(c, err)
		return
	}
	if !allowed {
		utils.Forbidden(c)
		return
	}

	uid8 := userID
	if len(uid8) > 8 {
		uid8 = uid8[:8]
	}
	path := fmt.Sprintf("/home/coder/workspaces/%s-%s", project.Slug, uid8)

	var wsID, wsStatus, wsPath string
	err = db.Pool.QueryRow(ctx,
		`SELECT id, status, path
		 FROM workspaces
		 WHERE project_id=$1 AND user_id=$2`,
		req.ProjectID, userID,
	).Scan(&wsID, &wsStatus, &wsPath)

	switch {
	case err == nil:
		if wsStatus == "ready" {
			container := ideContainerName()
			if container == "" {
				utils.InternalError(c, errors.New("IDE_CONTAINER_NAME is not configured"))
				return
			}
			out, cmdErr := pipeline.ExecInContainer(
				container,
				"test -d "+wsPath+" && echo exists || echo missing",
			)
			if cmdErr == nil && strings.TrimSpace(out) == "exists" {
				c.JSON(200, gin.H{"data": gin.H{
					"workspace_id": wsID,
					"status":       "ready",
					"path":         wsPath,
					"ide_url":      workspaceIDEURL(wsPath),
					"message":      "Workspace ready",
				}})
				return
			}

			if _, upErr := db.Pool.Exec(ctx,
				"UPDATE workspaces SET status='cloning', updated_at=NOW() WHERE id=$1",
				wsID,
			); upErr != nil {
				utils.InternalError(c, upErr)
				return
			}
			go cloneAndSetup(wsID, wsPath, project, userID)
			c.JSON(202, gin.H{"data": gin.H{
				"workspace_id": wsID,
				"status":       "cloning",
				"message":      "Workspace is being prepared...",
			}})
			return
		}

		if wsStatus == "cloning" {
			c.JSON(202, gin.H{"data": gin.H{
				"workspace_id": wsID,
				"status":       "cloning",
				"message":      "Workspace is being prepared...",
			}})
			return
		}

		if _, upErr := db.Pool.Exec(ctx,
			"UPDATE workspaces SET status='cloning', updated_at=NOW() WHERE id=$1",
			wsID,
		); upErr != nil {
			utils.InternalError(c, upErr)
			return
		}

		go cloneAndSetup(wsID, wsPath, project, userID)
		c.JSON(202, gin.H{"data": gin.H{
			"workspace_id": wsID,
			"status":       "cloning",
			"message":      "Workspace is being prepared...",
		}})
		return

	case errors.Is(err, pgx.ErrNoRows):
		wsID = uuid.NewString()
		if _, insErr := db.Pool.Exec(ctx,
			`INSERT INTO workspaces (id, project_id, user_id, path, status)
			 VALUES ($1, $2, $3, $4, 'cloning')`,
			wsID, req.ProjectID, userID, path,
		); insErr != nil {
			utils.InternalError(c, insErr)
			return
		}

		go cloneAndSetup(wsID, path, project, userID)
		c.JSON(202, gin.H{"data": gin.H{
			"workspace_id": wsID,
			"status":       "cloning",
			"message":      "Workspace is being prepared...",
		}})
		return

	default:
		utils.InternalError(c, err)
		return
	}
}

func cloneAndSetup(
	workspaceID string,
	path string,
	project workspaceProjectInfo,
	userID string,
) {
	ctx := context.Background()
	_ = userID

	container := ideContainerName()
	if container == "" {
		log.Printf("workspace: IDE_CONTAINER_NAME is not configured")
		_, _ = db.Pool.Exec(ctx,
			`UPDATE workspaces SET status='error', updated_at=NOW()
			 WHERE id=$1`, workspaceID)
		return
	}

	// Ensure the mounted volume is writable by the code-server user.
	fixPermCmd := exec.Command("docker", "exec", "-u", "0:0", container, "sh", "-c",
		"mkdir -p /home/coder/workspaces && chown -R 1000:1000 /home/coder/workspaces")
	if out, permErr := fixPermCmd.CombinedOutput(); permErr != nil {
		log.Printf("workspace: failed to fix workspace permissions: %s %v", strings.TrimSpace(string(out)), permErr)
		_, _ = db.Pool.Exec(ctx,
			`UPDATE workspaces SET status='error', updated_at=NOW()
			 WHERE id=$1`, workspaceID)
		return
	}

	cloneURL := fmt.Sprintf("http://%s:%s@gitea:3001/%s/%s.git",
		os.Getenv("GITEA_ADMIN_USER"),
		os.Getenv("GITEA_ADMIN_PASSWORD"),
		project.OrgSlug,
		project.Slug,
	)

	_, _ = pipeline.ExecInContainer(container, "rm -rf "+path)
	_, _ = pipeline.ExecInContainer(container, "mkdir -p $(dirname "+path+")")

	out, err := pipeline.ExecInContainer(container,
		fmt.Sprintf("git clone %s %s 2>&1", cloneURL, path))
	if err != nil {
		log.Printf("workspace: clone failed for %s: %s %v", path, out, err)
		_, _ = db.Pool.Exec(ctx,
			`UPDATE workspaces SET status='error', updated_at=NOW()
			 WHERE id=$1`, workspaceID)
		return
	}

	_, _ = pipeline.ExecInContainer(container,
		fmt.Sprintf("git -C %s config user.email 'user@devora.local'", path))
	_, _ = pipeline.ExecInContainer(container,
		fmt.Sprintf("git -C %s config user.name 'Devora User'", path))

	credLine := fmt.Sprintf(
		"http://%s:%s@gitea:3001",
		os.Getenv("GITEA_ADMIN_USER"),
		os.Getenv("GITEA_ADMIN_PASSWORD"),
	)
	_, _ = pipeline.ExecInContainer(container,
		fmt.Sprintf("echo '%s' > /home/coder/.git-credentials", credLine))
	_, _ = pipeline.ExecInContainer(container,
		"git config --global credential.helper store")

	_, _ = db.Pool.Exec(ctx,
		`UPDATE workspaces SET status='ready', updated_at=NOW()
		 WHERE id=$1`, workspaceID)

	log.Printf("workspace: ready at %s", path)
}

func GetWorkspace(c *gin.Context) {
	ctx := context.Background()
	userID := c.GetString("userID")
	if userID == "" {
		utils.Unauthorized(c)
		return
	}

	workspaceID := strings.TrimSpace(c.Param("id"))
	var ws workspaceRecord
	err := db.Pool.QueryRow(ctx, `
		SELECT id, project_id, user_id, path, status,
		       created_at::text, updated_at::text
		FROM workspaces
		WHERE id=$1 AND user_id=$2
	`, workspaceID, userID).Scan(
		&ws.ID,
		&ws.ProjectID,
		&ws.UserID,
		&ws.Path,
		&ws.Status,
		&ws.CreatedAt,
		&ws.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			utils.NotFound(c, "Workspace not found")
			return
		}
		utils.InternalError(c, err)
		return
	}

	utils.OK(c, gin.H{
		"id":         ws.ID,
		"project_id": ws.ProjectID,
		"user_id":    ws.UserID,
		"path":       ws.Path,
		"status":     ws.Status,
		"created_at": ws.CreatedAt,
		"updated_at": ws.UpdatedAt,
		"ide_url":    workspaceIDEURL(ws.Path),
	})
}

func GetWorkspaceStatus(c *gin.Context) {
	ctx := context.Background()
	userID := c.GetString("userID")
	if userID == "" {
		utils.Unauthorized(c)
		return
	}

	workspaceID := strings.TrimSpace(c.Param("id"))
	var id, status, path string
	err := db.Pool.QueryRow(ctx, `
		SELECT id, status, path
		FROM workspaces
		WHERE id=$1 AND user_id=$2
	`, workspaceID, userID).Scan(&id, &status, &path)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			utils.NotFound(c, "Workspace not found")
			return
		}
		utils.InternalError(c, err)
		return
	}

	resp := gin.H{
		"status":  status,
		"message": workspaceStatusMessage(status),
	}
	if status == "ready" {
		resp["ide_url"] = workspaceIDEURL(path)
	}

	utils.OK(c, resp)
}

func CommitWorkspace(c *gin.Context) {
	ctx := context.Background()
	userID := c.GetString("userID")
	if userID == "" {
		utils.Unauthorized(c)
		return
	}

	workspaceID := strings.TrimSpace(c.Param("id"))
	var workspace workspaceRecord
	err := db.Pool.QueryRow(ctx, `
		SELECT id, project_id, user_id, path, status,
		       created_at::text, updated_at::text
		FROM workspaces
		WHERE id=$1 AND user_id=$2
	`, workspaceID, userID).Scan(
		&workspace.ID,
		&workspace.ProjectID,
		&workspace.UserID,
		&workspace.Path,
		&workspace.Status,
		&workspace.CreatedAt,
		&workspace.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			utils.NotFound(c, "Workspace not found")
			return
		}
		utils.InternalError(c, err)
		return
	}

	if workspace.Status != "ready" {
		c.JSON(422, gin.H{"error": "Workspace is not ready"})
		return
	}

	var req commitWorkspaceRequest
	if err = c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Invalid request body")
		return
	}
	req.Message = strings.TrimSpace(req.Message)
	if req.Message == "" {
		utils.BadRequest(c, "message is required")
		return
	}

	var email, username string
	var displayName *string
	err = db.Pool.QueryRow(ctx,
		"SELECT email, username, display_name FROM users WHERE id=$1",
		userID,
	).Scan(&email, &username, &displayName)
	if err != nil {
		utils.InternalError(c, err)
		return
	}

	gitName := username
	if displayName != nil && strings.TrimSpace(*displayName) != "" {
		gitName = strings.TrimSpace(*displayName)
	}

	gitEnv := map[string]string{
		"GIT_AUTHOR_NAME":     gitName,
		"GIT_AUTHOR_EMAIL":    email,
		"GIT_COMMITTER_NAME":  gitName,
		"GIT_COMMITTER_EMAIL": email,
	}

	container := ideContainerName()
	if container == "" {
		utils.InternalError(c, errors.New("IDE_CONTAINER_NAME is not configured"))
		return
	}

	out, err := pipeline.ExecInContainerWithEnv(
		container,
		fmt.Sprintf("git -C %s add -A 2>&1", workspace.Path),
		gitEnv,
	)
	if err != nil {
		c.JSON(422, gin.H{"error": "git add failed: " + out})
		return
	}

	statusOut, _ := pipeline.ExecInContainer(container,
		fmt.Sprintf("git -C %s status --porcelain", workspace.Path))
	if strings.TrimSpace(statusOut) == "" {
		utils.OK(c, gin.H{"message": "Nothing to commit"})
		return
	}

	safeMsg := strings.ReplaceAll(req.Message, "'", "")
	out, err = pipeline.ExecInContainerWithEnv(
		container,
		fmt.Sprintf("git -C %s commit -m '%s' 2>&1", workspace.Path, safeMsg),
		gitEnv,
	)
	if err != nil {
		c.JSON(422, gin.H{"error": "git commit failed: " + out})
		return
	}

	out, err = pipeline.ExecInContainerWithEnv(
		container,
		fmt.Sprintf("git -C %s push 2>&1", workspace.Path),
		gitEnv,
	)
	if err != nil {
		c.JSON(422, gin.H{"error": "git push failed: " + out})
		return
	}

	utils.OK(c, gin.H{
		"message":       "Committed and pushed successfully",
		"commit_output": out,
	})
}

func DeleteWorkspace(c *gin.Context) {
	ctx := context.Background()
	userID := c.GetString("userID")
	if userID == "" {
		utils.Unauthorized(c)
		return
	}

	workspaceID := strings.TrimSpace(c.Param("id"))
	var path string
	err := db.Pool.QueryRow(ctx,
		"SELECT path FROM workspaces WHERE id=$1 AND user_id=$2",
		workspaceID, userID,
	).Scan(&path)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			utils.NotFound(c, "Workspace not found")
			return
		}
		utils.InternalError(c, err)
		return
	}

	container := ideContainerName()
	if container == "" {
		utils.InternalError(c, errors.New("IDE_CONTAINER_NAME is not configured"))
		return
	}

	_, _ = pipeline.ExecInContainer(container, "rm -rf "+path)

	if _, err = db.Pool.Exec(ctx,
		"DELETE FROM workspaces WHERE id=$1",
		workspaceID,
	); err != nil {
		utils.InternalError(c, err)
		return
	}

	utils.OK(c, gin.H{"message": "Workspace deleted"})
}
