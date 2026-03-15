package handlers

// PIPELINE DEPLOY USAGE:
// In a pipeline YAML step, reference the container by name:
//
// jobs:
//   deploy:
//     needs: [build]
//     steps:
//       - name: Deploy to container
//         run: |
//           docker exec devora-myapp sh -c "
//             cd /app &&
//             git pull &&
//             npm install --production &&
//             pm2 restart app
//           "
//
// The container name in docker exec is always: devora-{container_name}
// where container_name is the name field in deploy_containers table.

import (
	"context"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/devora/devora/internal/activity"
	"github.com/devora/devora/internal/db"
	"github.com/devora/devora/internal/pipeline"
	"github.com/devora/devora/internal/utils"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

var validContainerName = regexp.MustCompile(`^[a-z0-9-]+$`)

type deployContainer struct {
	ID           string          `json:"id"`
	OrgID        string          `json:"org_id"`
	ProjectID    *string         `json:"project_id"`
	ProjectName  *string         `json:"project_name,omitempty"`
	ProjectSlug  *string         `json:"project_slug,omitempty"`
	Name         string          `json:"name"`
	DockerID     *string         `json:"docker_id"`
	Image        string          `json:"image"`
	Status       string          `json:"status"`
	HostPort     *int            `json:"host_port"`
	InternalPort *int            `json:"internal_port"`
	EnvVars      json.RawMessage `json:"env_vars"`
	CreatedBy    *string         `json:"created_by"`
	CreatedAt    time.Time       `json:"created_at"`
	UpdatedAt    time.Time       `json:"updated_at"`
}

// ─────────────────────────────────────────────────────
// ListContainers — GET /api/deploy/containers
// ─────────────────────────────────────────────────────
func ListContainers(c *gin.Context) {
	ctx := context.Background()
	orgID := c.GetString("orgID")

	rows, err := db.Pool.Query(ctx,
		`SELECT dc.id, dc.org_id, dc.project_id, dc.name, dc.docker_id, dc.image,
		        dc.status, dc.host_port, dc.internal_port, dc.env_vars,
		        dc.created_by, dc.created_at, dc.updated_at,
		        p.name AS project_name, p.slug AS project_slug
		 FROM deploy_containers dc
		 LEFT JOIN projects p ON p.id = dc.project_id
		 WHERE dc.org_id = $1
		 ORDER BY dc.created_at DESC`,
		orgID,
	)
	if err != nil {
		utils.InternalError(c, err)
		return
	}
	defer rows.Close()

	var containers []deployContainer
	for rows.Next() {
		var dc deployContainer
		if err := rows.Scan(
			&dc.ID, &dc.OrgID, &dc.ProjectID, &dc.Name, &dc.DockerID, &dc.Image,
			&dc.Status, &dc.HostPort, &dc.InternalPort, &dc.EnvVars,
			&dc.CreatedBy, &dc.CreatedAt, &dc.UpdatedAt,
			&dc.ProjectName, &dc.ProjectSlug,
		); err != nil {
			utils.InternalError(c, err)
			return
		}
		if dc.DockerID != nil && *dc.DockerID != "" {
			liveStatus := pipeline.GetContainerStatus(*dc.DockerID)
			if liveStatus != dc.Status && liveStatus != "not found" {
				db.Pool.Exec(ctx,
					`UPDATE deploy_containers SET status=$1, updated_at=NOW() WHERE id=$2`,
					liveStatus, dc.ID,
				)
				dc.Status = liveStatus
			}
		}
		containers = append(containers, dc)
	}
	if containers == nil {
		containers = []deployContainer{}
	}
	utils.OK(c, containers)
}

// ─────────────────────────────────────────────────────
// CreateContainer — POST /api/deploy/containers
// ─────────────────────────────────────────────────────
type createContainerRequest struct {
	Name         string            `json:"name"`
	Image        string            `json:"image"`
	HostPort     int               `json:"host_port"`
	InternalPort int               `json:"internal_port"`
	EnvVars      map[string]string `json:"env_vars"`
	ProjectID    *string           `json:"project_id"`
}

func CreateContainer(c *gin.Context) {
	ctx := context.Background()
	orgID := c.GetString("orgID")
	userID := c.GetString("userID")

	var req createContainerRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Invalid request body")
		return
	}

	req.Name = strings.TrimSpace(req.Name)
	req.Image = strings.TrimSpace(req.Image)

	if req.Name == "" {
		utils.BadRequest(c, "name is required")
		return
	}
	if req.Image == "" {
		utils.BadRequest(c, "image is required")
		return
	}
	if req.HostPort == 0 {
		utils.BadRequest(c, "host_port is required")
		return
	}
	if !validContainerName.MatchString(req.Name) {
		utils.BadRequest(c, "Name must be lowercase letters, numbers, hyphens")
		return
	}

	var existingID string
	err := db.Pool.QueryRow(ctx,
		`SELECT id FROM deploy_containers WHERE org_id=$1 AND name=$2`,
		orgID, req.Name,
	).Scan(&existingID)
	if err == nil {
		utils.Conflict(c, "Container name already exists")
		return
	}

	if req.ProjectID != nil {
		var projID string
		if err := db.Pool.QueryRow(ctx,
			`SELECT id FROM projects WHERE id=$1 AND org_id=$2`,
			*req.ProjectID, orgID,
		).Scan(&projID); err != nil {
			utils.NotFound(c, "Project not found")
			return
		}
	}

	if req.InternalPort == 0 {
		req.InternalPort = 3000
	}
	if req.EnvVars == nil {
		req.EnvVars = map[string]string{}
	}

	if err := pipeline.PullImage(req.Image); err != nil {
		utils.BadRequest(c, "Cannot pull image: "+err.Error())
		return
	}

	dockerID, err := pipeline.CreateContainer(
		req.Name, req.Image, req.HostPort, req.InternalPort, req.EnvVars,
	)
	if err != nil {
		utils.InternalError(c, err)
		return
	}

	envJSON, _ := json.Marshal(req.EnvVars)

	var dc deployContainer
	if err := db.Pool.QueryRow(ctx,
		`INSERT INTO deploy_containers
		   (id, org_id, project_id, name, docker_id, image,
		    status, host_port, internal_port, env_vars, created_by)
		 VALUES ($1, $2, $3, $4, $5, $6, 'stopped', $7, $8, $9, $10)
		 RETURNING id, org_id, project_id, name, docker_id, image,
		           status, host_port, internal_port, env_vars,
		           created_by, created_at, updated_at`,
		uuid.New().String(), orgID, req.ProjectID, req.Name, dockerID, req.Image,
		req.HostPort, req.InternalPort, string(envJSON), userID,
	).Scan(
		&dc.ID, &dc.OrgID, &dc.ProjectID, &dc.Name, &dc.DockerID, &dc.Image,
		&dc.Status, &dc.HostPort, &dc.InternalPort, &dc.EnvVars,
		&dc.CreatedBy, &dc.CreatedAt, &dc.UpdatedAt,
	); err != nil {
		utils.InternalError(c, err)
		return
	}

	projectID := ""
	if req.ProjectID != nil {
		projectID = *req.ProjectID
	}
	activity.Log(projectID, userID, "container.created", map[string]interface{}{
		"container_id":   dc.ID,
		"container_name": dc.Name,
		"image":          dc.Image,
	})

	utils.Created(c, dc)
}

// getDeployContainer is a shared DB lookup helper.
func getDeployContainer(ctx context.Context, id, orgID string) (*deployContainer, bool) {
	var dc deployContainer
	err := db.Pool.QueryRow(ctx,
		`SELECT dc.id, dc.org_id, dc.project_id, dc.name, dc.docker_id, dc.image,
		        dc.status, dc.host_port, dc.internal_port, dc.env_vars,
		        dc.created_by, dc.created_at, dc.updated_at,
		        p.name AS project_name, NULL::TEXT AS project_slug
		 FROM deploy_containers dc
		 LEFT JOIN projects p ON p.id = dc.project_id
		 WHERE dc.id=$1 AND dc.org_id=$2`,
		id, orgID,
	).Scan(
		&dc.ID, &dc.OrgID, &dc.ProjectID, &dc.Name, &dc.DockerID, &dc.Image,
		&dc.Status, &dc.HostPort, &dc.InternalPort, &dc.EnvVars,
		&dc.CreatedBy, &dc.CreatedAt, &dc.UpdatedAt,
		&dc.ProjectName, &dc.ProjectSlug,
	)
	if err != nil {
		return nil, false
	}
	return &dc, true
}

// ─────────────────────────────────────────────────────
// GetContainer — GET /api/deploy/containers/:id
// ─────────────────────────────────────────────────────
func GetContainer(c *gin.Context) {
	ctx := context.Background()
	orgID := c.GetString("orgID")
	id := c.Param("id")

	dc, ok := getDeployContainer(ctx, id, orgID)
	if !ok {
		utils.NotFound(c, "Container not found")
		return
	}

	if dc.DockerID != nil && *dc.DockerID != "" {
		liveStatus := pipeline.GetContainerStatus(*dc.DockerID)
		if liveStatus != dc.Status && liveStatus != "not found" {
			db.Pool.Exec(ctx,
				`UPDATE deploy_containers SET status=$1, updated_at=NOW() WHERE id=$2`,
				liveStatus, id,
			)
			dc.Status = liveStatus
		}
	}

	utils.OK(c, dc)
}

// ─────────────────────────────────────────────────────
// StartContainer — POST /api/deploy/containers/:id/start
// ─────────────────────────────────────────────────────
func StartContainer(c *gin.Context) {
	ctx := context.Background()
	orgID := c.GetString("orgID")
	userID := c.GetString("userID")
	id := c.Param("id")

	dc, ok := getDeployContainer(ctx, id, orgID)
	if !ok {
		utils.NotFound(c, "Container not found")
		return
	}
	if dc.DockerID == nil || *dc.DockerID == "" {
		c.JSON(422, gin.H{"error": "Container has no Docker ID"})
		return
	}
	if dc.Status == "running" {
		utils.OK(c, gin.H{"message": "Already running"})
		return
	}
	if err := pipeline.StartContainer(*dc.DockerID); err != nil {
		utils.InternalError(c, err)
		return
	}
	db.Pool.Exec(ctx,
		`UPDATE deploy_containers SET status='running', updated_at=NOW() WHERE id=$1`,
		id,
	)
	projectID := ""
	if dc.ProjectID != nil {
		projectID = *dc.ProjectID
	}
	activity.Log(projectID, userID, "container.started", map[string]interface{}{
		"container_id":   dc.ID,
		"container_name": dc.Name,
	})
	utils.OK(c, gin.H{"message": "Container started", "status": "running"})
}

// ─────────────────────────────────────────────────────
// StopContainer — POST /api/deploy/containers/:id/stop
// ─────────────────────────────────────────────────────
func StopContainer(c *gin.Context) {
	ctx := context.Background()
	orgID := c.GetString("orgID")
	userID := c.GetString("userID")
	id := c.Param("id")

	dc, ok := getDeployContainer(ctx, id, orgID)
	if !ok {
		utils.NotFound(c, "Container not found")
		return
	}
	if dc.DockerID == nil || *dc.DockerID == "" {
		c.JSON(422, gin.H{"error": "Container has no Docker ID"})
		return
	}
	if dc.Status == "stopped" {
		utils.OK(c, gin.H{"message": "Already stopped"})
		return
	}
	if err := pipeline.StopContainer(*dc.DockerID); err != nil {
		utils.InternalError(c, err)
		return
	}
	db.Pool.Exec(ctx,
		`UPDATE deploy_containers SET status='stopped', updated_at=NOW() WHERE id=$1`,
		id,
	)
	projectID := ""
	if dc.ProjectID != nil {
		projectID = *dc.ProjectID
	}
	activity.Log(projectID, userID, "container.stopped", map[string]interface{}{
		"container_id":   dc.ID,
		"container_name": dc.Name,
	})
	utils.OK(c, gin.H{"message": "Container stopped", "status": "stopped"})
}

// ─────────────────────────────────────────────────────
// DeleteContainer — DELETE /api/deploy/containers/:id
// ─────────────────────────────────────────────────────
func DeleteContainer(c *gin.Context) {
	ctx := context.Background()
	orgID := c.GetString("orgID")
	userID := c.GetString("userID")
	id := c.Param("id")

	dc, ok := getDeployContainer(ctx, id, orgID)
	if !ok {
		utils.NotFound(c, "Container not found")
		return
	}
	if dc.DockerID != nil && *dc.DockerID != "" {
		if dc.Status == "running" {
			pipeline.StopContainer(*dc.DockerID)
		}
		pipeline.RemoveContainer(*dc.DockerID)
	}
	db.Pool.Exec(ctx, `DELETE FROM deploy_containers WHERE id=$1`, id)

	projectID := ""
	if dc.ProjectID != nil {
		projectID = *dc.ProjectID
	}
	activity.Log(projectID, userID, "container.deleted", map[string]interface{}{
		"container_id":   dc.ID,
		"container_name": dc.Name,
	})
	utils.OK(c, gin.H{"message": "Container deleted"})
}

// ─────────────────────────────────────────────────────
// StreamContainerLogs — GET /api/deploy/containers/:id/logs
// SSE: streams live Docker logs
// ─────────────────────────────────────────────────────
func StreamContainerLogs(c *gin.Context) {
	ctx := context.Background()
	orgID := c.GetString("orgID")
	id := c.Param("id")

	dc, ok := getDeployContainer(ctx, id, orgID)
	if !ok {
		utils.NotFound(c, "Container not found")
		return
	}
	if dc.DockerID == nil || *dc.DockerID == "" {
		c.JSON(422, gin.H{"error": "No Docker ID"})
		return
	}

	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")

	done := c.Request.Context().Done()
	pipeline.StreamContainerLogs(
		*dc.DockerID,
		func(line string) {
			fmt.Fprintf(c.Writer, "data: %s\n\n", escapeSSE(line))
			c.Writer.Flush()
		},
		done,
	)
}

func escapeSSE(s string) string {
	return strings.ReplaceAll(s, "\n", "\\n")
}

// ─────────────────────────────────────────────────────
// AssignContainer — POST /api/deploy/containers/:id/assign
// ─────────────────────────────────────────────────────
type assignContainerRequest struct {
	ProjectID *string `json:"project_id"`
}

func AssignContainer(c *gin.Context) {
	ctx := context.Background()
	orgID := c.GetString("orgID")
	userID := c.GetString("userID")
	id := c.Param("id")

	dc, ok := getDeployContainer(ctx, id, orgID)
	if !ok {
		utils.NotFound(c, "Container not found")
		return
	}

	var req assignContainerRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Invalid request body")
		return
	}

	if req.ProjectID != nil {
		var projID string
		if err := db.Pool.QueryRow(ctx,
			`SELECT id FROM projects WHERE id=$1 AND org_id=$2`,
			*req.ProjectID, orgID,
		).Scan(&projID); err != nil {
			utils.NotFound(c, "Project not found")
			return
		}
	}

	db.Pool.Exec(ctx,
		`UPDATE deploy_containers SET project_id=$1, updated_at=NOW() WHERE id=$2`,
		req.ProjectID, id,
	)

	projectID := ""
	if req.ProjectID != nil {
		projectID = *req.ProjectID
	}
	activity.Log(projectID, userID, "container.assigned", map[string]interface{}{
		"container_id":   dc.ID,
		"container_name": dc.Name,
		"project_id":     projectID,
	})
	utils.OK(c, gin.H{"message": "Container assigned", "project_id": req.ProjectID})
}
