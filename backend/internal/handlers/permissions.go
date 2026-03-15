package handlers

import (
	"context"
	"errors"
	"strings"

	"github.com/devora/devora/internal/db"
	"github.com/devora/devora/internal/middleware"
	"github.com/devora/devora/internal/models"
	"github.com/devora/devora/internal/utils"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type createPermissionRequest struct {
	Name        string  `json:"name"`
	Description *string `json:"description"`
	ProjectID   *string `json:"project_id"`
	AccessLevel string  `json:"access_level"`
}

type updatePermissionRequest struct {
	Name        *string `json:"name"`
	Description *string `json:"description"`
	AccessLevel *string `json:"access_level"`
}

type permissionAssignmentRequest struct {
	PermissionID string `json:"permission_id"`
}

type effectivePermission struct {
	models.ProjectPermission
	SourceName string `json:"source_name"`
	SourceType string `json:"source_type"`
}

func ListPermissions(c *gin.Context) {
	ctx := context.Background()
	orgID := c.GetString("orgID")
	if orgID == "" {
		utils.Unauthorized(c)
		return
	}

	type permissionWithUsage struct {
		models.ProjectPermission
		UserCount  int `json:"user_count"`
		GroupCount int `json:"group_count"`
	}

	rows, err := db.Pool.Query(ctx, `
		SELECT pp.id, pp.org_id, pp.name, pp.description,
		       pp.project_id, p.name AS project_name,
		       pp.access_level, pp.created_by, pp.created_at,
		       (SELECT COUNT(*) FROM user_permissions up WHERE up.permission_id = pp.id) AS user_count,
		       (SELECT COUNT(*) FROM group_permissions gp WHERE gp.permission_id = pp.id) AS group_count
		FROM project_permissions pp
		LEFT JOIN projects p ON p.id = pp.project_id
		WHERE pp.org_id = $1
		ORDER BY pp.created_at DESC
	`, orgID)
	if err != nil {
		utils.InternalError(c, err)
		return
	}
	defer rows.Close()

	all := make([]permissionWithUsage, 0)
	byProject := make(map[string]gin.H)
	orgWide := make([]permissionWithUsage, 0)

	for rows.Next() {
		var perm permissionWithUsage
		if scanErr := rows.Scan(
			&perm.ID,
			&perm.OrgID,
			&perm.Name,
			&perm.Description,
			&perm.ProjectID,
			&perm.ProjectName,
			&perm.AccessLevel,
			&perm.CreatedBy,
			&perm.CreatedAt,
			&perm.UserCount,
			&perm.GroupCount,
		); scanErr != nil {
			utils.InternalError(c, scanErr)
			return
		}
		all = append(all, perm)

		if perm.ProjectID == nil {
			orgWide = append(orgWide, perm)
			continue
		}

		pid := *perm.ProjectID
		bucket, ok := byProject[pid]
		if !ok {
			bucket = gin.H{
				"project_name": valueOrDefault(perm.ProjectName, "Unknown project"),
				"permissions":  []permissionWithUsage{},
			}
		}
		bucket["permissions"] = append(bucket["permissions"].([]permissionWithUsage), perm)
		byProject[pid] = bucket
	}
	if rows.Err() != nil {
		utils.InternalError(c, rows.Err())
		return
	}

	utils.OK(c, gin.H{
		"all":       all,
		"by_project": byProject,
		"org_wide":  orgWide,
	})
}

func CreatePermission(c *gin.Context) {
	ctx := context.Background()
	orgID := c.GetString("orgID")
	actorID := c.GetString("userID")
	if orgID == "" || actorID == "" {
		utils.Unauthorized(c)
		return
	}

	var req createPermissionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Invalid request body")
		return
	}

	req.Name = strings.TrimSpace(req.Name)
	req.AccessLevel = strings.TrimSpace(req.AccessLevel)
	if req.Name == "" || req.AccessLevel == "" {
		utils.BadRequest(c, "name and access_level are required")
		return
	}
	if req.AccessLevel != "read" && req.AccessLevel != "write" && req.AccessLevel != "full" {
		utils.BadRequest(c, "access_level must be read, write or full")
		return
	}

	if req.ProjectID != nil {
		pid := strings.TrimSpace(*req.ProjectID)
		if pid == "" {
			req.ProjectID = nil
		} else {
			req.ProjectID = &pid
			var exists bool
			err := db.Pool.QueryRow(ctx,
				"SELECT EXISTS(SELECT 1 FROM projects WHERE id = $1 AND org_id = $2)",
				pid, orgID,
			).Scan(&exists)
			if err != nil {
				utils.InternalError(c, err)
				return
			}
			if !exists {
				utils.NotFound(c, "Project not found")
				return
			}
		}
	}

	var existingID string
	err := db.Pool.QueryRow(ctx,
		"SELECT id FROM project_permissions WHERE org_id = $1 AND name = $2",
		orgID, req.Name,
	).Scan(&existingID)
	if err == nil {
		utils.Conflict(c, "Permission name already exists")
		return
	}
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		utils.InternalError(c, err)
		return
	}

	var perm models.ProjectPermission
	err = db.Pool.QueryRow(ctx, `
		INSERT INTO project_permissions
		  (id, org_id, name, description, project_id, access_level, created_by)
		VALUES
		  ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id, org_id, name, description, project_id,
		          access_level, created_by, created_at
	`, uuid.New().String(), orgID, req.Name, req.Description, req.ProjectID, req.AccessLevel, actorID).Scan(
		&perm.ID,
		&perm.OrgID,
		&perm.Name,
		&perm.Description,
		&perm.ProjectID,
		&perm.AccessLevel,
		&perm.CreatedBy,
		&perm.CreatedAt,
	)
	if err != nil {
		utils.InternalError(c, err)
		return
	}

	if err = writeAuditLog(ctx, orgID, actorID, "permission.created", "project_permission", perm.ID, map[string]interface{}{
		"name":         perm.Name,
		"project_id":   perm.ProjectID,
		"access_level": perm.AccessLevel,
	}); err != nil {
		utils.InternalError(c, err)
		return
	}

	c.JSON(201, gin.H{"data": perm})
}

func UpdatePermission(c *gin.Context) {
	ctx := context.Background()
	orgID := c.GetString("orgID")
	if orgID == "" {
		utils.Unauthorized(c)
		return
	}

	permID := c.Param("id")
	perm, err := loadProjectPermission(ctx, permID, orgID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			utils.NotFound(c, "Permission not found")
			return
		}
		utils.InternalError(c, err)
		return
	}

	var req updatePermissionRequest
	if err = c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Invalid request body")
		return
	}

	name := perm.Name
	if req.Name != nil {
		name = strings.TrimSpace(*req.Name)
		if name == "" {
			utils.BadRequest(c, "name cannot be empty")
			return
		}
	}
	desc := perm.Description
	if req.Description != nil {
		desc = req.Description
	}
	access := perm.AccessLevel
	if req.AccessLevel != nil {
		access = strings.TrimSpace(*req.AccessLevel)
		if access != "read" && access != "write" && access != "full" {
			utils.BadRequest(c, "access_level must be read, write or full")
			return
		}
	}

	err = db.Pool.QueryRow(ctx, `
		UPDATE project_permissions
		SET name = $1, description = $2, access_level = $3
		WHERE id = $4 AND org_id = $5
		RETURNING id, org_id, name, description, project_id,
		          access_level, created_by, created_at
	`, name, desc, access, permID, orgID).Scan(
		&perm.ID,
		&perm.OrgID,
		&perm.Name,
		&perm.Description,
		&perm.ProjectID,
		&perm.AccessLevel,
		&perm.CreatedBy,
		&perm.CreatedAt,
	)
	if err != nil {
		utils.InternalError(c, err)
		return
	}

	utils.OK(c, perm)
}

func DeletePermission(c *gin.Context) {
	ctx := context.Background()
	orgID := c.GetString("orgID")
	if orgID == "" {
		utils.Unauthorized(c)
		return
	}

	permID := c.Param("id")
	if _, err := loadProjectPermission(ctx, permID, orgID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			utils.NotFound(c, "Permission not found")
			return
		}
		utils.InternalError(c, err)
		return
	}

	var userCount int
	err := db.Pool.QueryRow(ctx,
		"SELECT COUNT(*) FROM user_permissions WHERE permission_id = $1",
		permID,
	).Scan(&userCount)
	if err != nil {
		utils.InternalError(c, err)
		return
	}

	var groupCount int
	err = db.Pool.QueryRow(ctx,
		"SELECT COUNT(*) FROM group_permissions WHERE permission_id = $1",
		permID,
	).Scan(&groupCount)
	if err != nil {
		utils.InternalError(c, err)
		return
	}

	if userCount > 0 || groupCount > 0 {
		utils.Conflict(c, "Permission is in use. Remove from all users and groups first.")
		return
	}

	_, err = db.Pool.Exec(ctx,
		"DELETE FROM project_permissions WHERE id = $1 AND org_id = $2",
		permID, orgID,
	)
	if err != nil {
		utils.InternalError(c, err)
		return
	}

	utils.OK(c, gin.H{"message": "Deleted"})
}

func GetUserEffectivePermissions(c *gin.Context) {
	ctx := context.Background()
	orgID := c.GetString("orgID")
	if orgID == "" {
		utils.Unauthorized(c)
		return
	}

	userID := c.Param("id")
	if _, err := ensureUserInOrg(ctx, userID, orgID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			utils.NotFound(c, "User not found")
			return
		}
		utils.InternalError(c, err)
		return
	}

	groupPerms, err := queryGroupPermissions(ctx, userID)
	if err != nil {
		utils.InternalError(c, err)
		return
	}
	directPerms, err := queryDirectPermissions(ctx, userID)
	if err != nil {
		utils.InternalError(c, err)
		return
	}

	allMap := make(map[string]models.ProjectPermission)
	for _, gp := range groupPerms {
		allMap[gp.ID] = gp.ProjectPermission
	}
	for _, dp := range directPerms {
		allMap[dp.ID] = dp.ProjectPermission
	}

	all := make([]models.ProjectPermission, 0, len(allMap))
	for _, p := range allMap {
		all = append(all, p)
	}

	utils.OK(c, gin.H{
		"group_permissions":  groupPerms,
		"direct_permissions": directPerms,
		"all":                all,
	})
}

func AssignPermissionToUser(c *gin.Context) {
	ctx := context.Background()
	orgID := c.GetString("orgID")
	actorID := c.GetString("userID")
	if orgID == "" || actorID == "" {
		utils.Unauthorized(c)
		return
	}

	targetUserID := c.Param("id")
	if _, err := ensureUserInOrg(ctx, targetUserID, orgID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			utils.NotFound(c, "User not found")
			return
		}
		utils.InternalError(c, err)
		return
	}

	var req permissionAssignmentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Invalid request body")
		return
	}
	req.PermissionID = strings.TrimSpace(req.PermissionID)
	if req.PermissionID == "" {
		utils.BadRequest(c, "permission_id is required")
		return
	}

	if _, err := loadProjectPermission(ctx, req.PermissionID, orgID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			utils.NotFound(c, "Permission not found")
			return
		}
		utils.InternalError(c, err)
		return
	}

	var viaGroupCount int
	err := db.Pool.QueryRow(ctx, `
		SELECT COUNT(*)
		FROM user_group_members ugm
		JOIN group_permissions gp ON gp.group_id = ugm.group_id
		WHERE ugm.user_id = $1
		  AND gp.permission_id = $2
	`, targetUserID, req.PermissionID).Scan(&viaGroupCount)
	if err != nil {
		utils.InternalError(c, err)
		return
	}
	if viaGroupCount > 0 {
		utils.Conflict(c, "Already granted via a group")
		return
	}

	var directID string
	err = db.Pool.QueryRow(ctx,
		"SELECT id FROM user_permissions WHERE user_id = $1 AND permission_id = $2",
		targetUserID, req.PermissionID,
	).Scan(&directID)
	if err == nil {
		utils.Conflict(c, "Already directly assigned")
		return
	}
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		utils.InternalError(c, err)
		return
	}

	_, err = db.Pool.Exec(ctx, `
		INSERT INTO user_permissions (id, user_id, permission_id, granted_by)
		VALUES ($1, $2, $3, $4)
	`, uuid.New().String(), targetUserID, req.PermissionID, actorID)
	if err != nil {
		utils.InternalError(c, err)
		return
	}

	middleware.ClearUserPermissionCache(targetUserID)
	if err = writeAuditLog(ctx, orgID, actorID, "permission.assigned_user", "user", targetUserID, map[string]interface{}{
		"permission_id": req.PermissionID,
	}); err != nil {
		utils.InternalError(c, err)
		return
	}

	c.JSON(201, gin.H{"data": gin.H{"message": "Permission assigned"}})
}

func RemovePermissionFromUser(c *gin.Context) {
	ctx := context.Background()
	orgID := c.GetString("orgID")
	actorID := c.GetString("userID")
	if orgID == "" || actorID == "" {
		utils.Unauthorized(c)
		return
	}

	userID := c.Param("id")
	permissionID := c.Param("permissionId")
	_, err := db.Pool.Exec(ctx,
		"DELETE FROM user_permissions WHERE user_id = $1 AND permission_id = $2",
		userID, permissionID,
	)
	if err != nil {
		utils.InternalError(c, err)
		return
	}

	middleware.ClearUserPermissionCache(userID)
	if err = writeAuditLog(ctx, orgID, actorID, "permission.removed_user", "user", userID, map[string]interface{}{
		"permission_id": permissionID,
	}); err != nil {
		utils.InternalError(c, err)
		return
	}

	utils.OK(c, gin.H{"message": "Permission removed"})
}

func AssignPermissionToGroup(c *gin.Context) {
	ctx := context.Background()
	orgID := c.GetString("orgID")
	actorID := c.GetString("userID")
	if orgID == "" || actorID == "" {
		utils.Unauthorized(c)
		return
	}

	groupID := c.Param("id")
	if _, err := ensureGroupInOrg(ctx, groupID, orgID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			utils.NotFound(c, "Group not found")
			return
		}
		utils.InternalError(c, err)
		return
	}

	var req permissionAssignmentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Invalid request body")
		return
	}
	req.PermissionID = strings.TrimSpace(req.PermissionID)
	if req.PermissionID == "" {
		utils.BadRequest(c, "permission_id is required")
		return
	}

	if _, err := loadProjectPermission(ctx, req.PermissionID, orgID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			utils.NotFound(c, "Permission not found")
			return
		}
		utils.InternalError(c, err)
		return
	}

	var exists int
	err := db.Pool.QueryRow(ctx,
		"SELECT COUNT(*) FROM group_permissions WHERE group_id = $1 AND permission_id = $2",
		groupID, req.PermissionID,
	).Scan(&exists)
	if err != nil {
		utils.InternalError(c, err)
		return
	}
	if exists > 0 {
		utils.Conflict(c, "Permission already assigned to group")
		return
	}

	tx, err := db.Pool.Begin(ctx)
	if err != nil {
		utils.InternalError(c, err)
		return
	}
	defer tx.Rollback(ctx)

	if _, err = tx.Exec(ctx,
		"INSERT INTO group_permissions (group_id, permission_id) VALUES ($1, $2)",
		groupID, req.PermissionID,
	); err != nil {
		utils.InternalError(c, err)
		return
	}

	memberRows, err := tx.Query(ctx,
		"SELECT user_id FROM user_group_members WHERE group_id = $1",
		groupID,
	)
	if err != nil {
		utils.InternalError(c, err)
		return
	}
	memberIDs := make([]string, 0)
	for memberRows.Next() {
		var userID string
		if scanErr := memberRows.Scan(&userID); scanErr != nil {
			memberRows.Close()
			utils.InternalError(c, scanErr)
			return
		}
		memberIDs = append(memberIDs, userID)
	}
	memberRows.Close()
	if memberRows.Err() != nil {
		utils.InternalError(c, memberRows.Err())
		return
	}

	for _, memberID := range memberIDs {
		if _, err = tx.Exec(ctx,
			"DELETE FROM user_permissions WHERE user_id = $1 AND permission_id = $2",
			memberID, req.PermissionID,
		); err != nil {
			utils.InternalError(c, err)
			return
		}
	}

	if err = tx.Commit(ctx); err != nil {
		utils.InternalError(c, err)
		return
	}

	for _, memberID := range memberIDs {
		middleware.ClearUserPermissionCache(memberID)
	}

	if err = writeAuditLog(ctx, orgID, actorID, "permission.assigned_group", "group", groupID, map[string]interface{}{
		"permission_id": req.PermissionID,
	}); err != nil {
		utils.InternalError(c, err)
		return
	}

	c.JSON(201, gin.H{"data": gin.H{"message": "Permission assigned to group"}})
}

func RemovePermissionFromGroup(c *gin.Context) {
	ctx := context.Background()
	groupID := c.Param("id")
	permissionID := c.Param("permissionId")

	_, err := db.Pool.Exec(ctx,
		"DELETE FROM group_permissions WHERE group_id = $1 AND permission_id = $2",
		groupID, permissionID,
	)
	if err != nil {
		utils.InternalError(c, err)
		return
	}

	utils.OK(c, gin.H{"message": "Permission removed from group"})
}

func loadProjectPermission(ctx context.Context, permissionID, orgID string) (*models.ProjectPermission, error) {
	var perm models.ProjectPermission
	err := db.Pool.QueryRow(ctx, `
		SELECT pp.id, pp.org_id, pp.name, pp.description,
		       pp.project_id, p.name AS project_name,
		       pp.access_level, pp.created_by, pp.created_at
		FROM project_permissions pp
		LEFT JOIN projects p ON p.id = pp.project_id
		WHERE pp.id = $1 AND pp.org_id = $2
	`, permissionID, orgID).Scan(
		&perm.ID,
		&perm.OrgID,
		&perm.Name,
		&perm.Description,
		&perm.ProjectID,
		&perm.ProjectName,
		&perm.AccessLevel,
		&perm.CreatedBy,
		&perm.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &perm, nil
}

func queryGroupPermissions(ctx context.Context, userID string) ([]effectivePermission, error) {
	rows, err := db.Pool.Query(ctx, `
		SELECT pp.id, pp.org_id, pp.name, pp.description,
		       pp.project_id, p.name AS project_name,
		       pp.access_level, pp.created_by, pp.created_at,
		       ug.name AS source_name,
		       'group' AS source_type
		FROM user_group_members ugm
		JOIN group_permissions gp ON gp.group_id = ugm.group_id
		JOIN project_permissions pp ON pp.id = gp.permission_id
		LEFT JOIN user_groups ug ON ug.id = ugm.group_id
		LEFT JOIN projects p ON p.id = pp.project_id
		WHERE ugm.user_id = $1
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]effectivePermission, 0)
	for rows.Next() {
		var item effectivePermission
		if scanErr := rows.Scan(
			&item.ID,
			&item.OrgID,
			&item.Name,
			&item.Description,
			&item.ProjectID,
			&item.ProjectName,
			&item.AccessLevel,
			&item.CreatedBy,
			&item.CreatedAt,
			&item.SourceName,
			&item.SourceType,
		); scanErr != nil {
			return nil, scanErr
		}
		items = append(items, item)
	}
	if rows.Err() != nil {
		return nil, rows.Err()
	}

	return items, nil
}

func queryDirectPermissions(ctx context.Context, userID string) ([]effectivePermission, error) {
	rows, err := db.Pool.Query(ctx, `
		SELECT pp.id, pp.org_id, pp.name, pp.description,
		       pp.project_id, p.name AS project_name,
		       pp.access_level, pp.created_by, pp.created_at,
		       'direct' AS source_name,
		       'direct' AS source_type
		FROM user_permissions up
		JOIN project_permissions pp ON pp.id = up.permission_id
		LEFT JOIN projects p ON p.id = pp.project_id
		WHERE up.user_id = $1
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]effectivePermission, 0)
	for rows.Next() {
		var item effectivePermission
		if scanErr := rows.Scan(
			&item.ID,
			&item.OrgID,
			&item.Name,
			&item.Description,
			&item.ProjectID,
			&item.ProjectName,
			&item.AccessLevel,
			&item.CreatedBy,
			&item.CreatedAt,
			&item.SourceName,
			&item.SourceType,
		); scanErr != nil {
			return nil, scanErr
		}
		items = append(items, item)
	}
	if rows.Err() != nil {
		return nil, rows.Err()
	}

	return items, nil
}

func valueOrDefault(s *string, fallback string) string {
	if s == nil || strings.TrimSpace(*s) == "" {
		return fallback
	}
	return *s
}
