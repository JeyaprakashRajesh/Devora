package handlers

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/devora/devora/internal/db"
	"github.com/devora/devora/internal/middleware"
	"github.com/devora/devora/internal/models"
	"github.com/devora/devora/internal/utils"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
)

type createRoleRequest struct {
	Name        string  `json:"name"`
	Description *string `json:"description"`
}

type updateRoleRequest struct {
	Name        *string `json:"name"`
	Description *string `json:"description"`
}

type setRolePermissionsRequest struct {
	PermissionIDs []string `json:"permission_ids"`
}

type roleListItem struct {
	ID              string  `json:"id"`
	Name            string  `json:"name"`
	Description     *string `json:"description"`
	IsSystem        bool    `json:"is_system"`
	CreatedAt       time.Time `json:"created_at"`
	PermissionCount int     `json:"permission_count"`
}

type rolePermission struct {
	ID          string  `json:"id"`
	Resource    string  `json:"resource"`
	Action      string  `json:"action"`
	Label       string  `json:"label"`
	Description *string `json:"description,omitempty"`
}

type rolePermissionToggleItem struct {
	ID            string  `json:"id"`
	Resource      string  `json:"resource"`
	ResourceLabel string  `json:"resource_label"`
	Action        string  `json:"action"`
	Label         string  `json:"label"`
	Description   *string `json:"description"`
	Enabled       bool    `json:"enabled"`
}

type permissionGroupResource struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Label string `json:"label"`
}

type permissionGroup struct {
	Resource    permissionGroupResource `json:"resource"`
	Permissions []models.Permission     `json:"permissions"`
}

func ListRoles(c *gin.Context) {
	ctx := context.Background()
	orgID := c.GetString("orgID")
	if orgID == "" {
		utils.Unauthorized(c)
		return
	}

	rows, err := db.Pool.Query(ctx, `
		SELECT id, name, description, is_system, created_at,
		       (SELECT COUNT(*) FROM role_permissions rp WHERE rp.role_id = r.id) as permission_count
		FROM roles r
		WHERE org_id = $1
		ORDER BY is_system DESC, created_at ASC
	`, orgID)
	if err != nil {
		utils.InternalError(c, err)
		return
	}
	defer rows.Close()

	roles := make([]roleListItem, 0)
	for rows.Next() {
		var item roleListItem
		if scanErr := rows.Scan(&item.ID, &item.Name, &item.Description, &item.IsSystem, &item.CreatedAt, &item.PermissionCount); scanErr != nil {
			utils.InternalError(c, scanErr)
			return
		}
		roles = append(roles, item)
	}
	if rows.Err() != nil {
		utils.InternalError(c, rows.Err())
		return
	}

	utils.OK(c, roles)
}

func CreateRole(c *gin.Context) {
	ctx := context.Background()
	orgID := c.GetString("orgID")
	actorID := c.GetString("userID")
	if orgID == "" || actorID == "" {
		utils.Unauthorized(c)
		return
	}

	var req createRoleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Invalid request body")
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		utils.BadRequest(c, "name is required")
		return
	}

	var existingID string
	err := db.Pool.QueryRow(ctx,
		"SELECT id FROM roles WHERE org_id = $1 AND name = $2",
		orgID, req.Name,
	).Scan(&existingID)
	if err == nil {
		utils.Conflict(c, "Role name already exists")
		return
	}
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		utils.InternalError(c, err)
		return
	}

	var role models.Role
	err = db.Pool.QueryRow(ctx, `
		INSERT INTO roles (org_id, name, description, is_system, created_by)
		VALUES ($1, $2, $3, false, $4)
		RETURNING id, org_id, name, description, is_system, created_at, updated_at
	`, orgID, req.Name, req.Description, actorID).Scan(
		&role.ID,
		&role.OrgID,
		&role.Name,
		&role.Description,
		&role.IsSystem,
		&role.CreatedAt,
		&role.UpdatedAt,
	)
	if err != nil {
		utils.InternalError(c, err)
		return
	}

	if err = writeAuditLog(ctx, orgID, actorID, "role.created", "role", role.ID, map[string]interface{}{
		"name": role.Name,
	}); err != nil {
		utils.InternalError(c, err)
		return
	}

	utils.Created(c, role)
}

func GetRole(c *gin.Context) {
	ctx := context.Background()
	orgID := c.GetString("orgID")
	if orgID == "" {
		utils.Unauthorized(c)
		return
	}

	roleID := c.Param("id")
	var role models.Role
	err := db.Pool.QueryRow(ctx, `
		SELECT id, org_id, name, description, is_system, created_at, updated_at
		FROM roles
		WHERE id = $1 AND org_id = $2
	`, roleID, orgID).Scan(
		&role.ID,
		&role.OrgID,
		&role.Name,
		&role.Description,
		&role.IsSystem,
		&role.CreatedAt,
		&role.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			utils.NotFound(c, "Role not found")
			return
		}
		utils.InternalError(c, err)
		return
	}

	rows, err := db.Pool.Query(ctx, `
		SELECT p.id, res.name as resource, p.action, p.label
		FROM role_permissions rp
		JOIN permissions p ON p.id = rp.permission_id
		JOIN resources res ON res.id = p.resource_id
		WHERE rp.role_id = $1
		ORDER BY res.name, p.action
	`, roleID)
	if err != nil {
		utils.InternalError(c, err)
		return
	}
	defer rows.Close()

	permissions := make([]rolePermission, 0)
	for rows.Next() {
		var perm rolePermission
		if scanErr := rows.Scan(&perm.ID, &perm.Resource, &perm.Action, &perm.Label); scanErr != nil {
			utils.InternalError(c, scanErr)
			return
		}
		permissions = append(permissions, perm)
	}
	if rows.Err() != nil {
		utils.InternalError(c, rows.Err())
		return
	}

	utils.OK(c, gin.H{
		"id":          role.ID,
		"org_id":      role.OrgID,
		"name":        role.Name,
		"description": role.Description,
		"is_system":   role.IsSystem,
		"created_at":  role.CreatedAt,
		"updated_at":  role.UpdatedAt,
		"permissions": permissions,
	})
}

func UpdateRole(c *gin.Context) {
	ctx := context.Background()
	orgID := c.GetString("orgID")
	actorID := c.GetString("userID")
	if orgID == "" || actorID == "" {
		utils.Unauthorized(c)
		return
	}

	roleID := c.Param("id")
	role, err := loadRoleForOrg(ctx, roleID, orgID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			utils.NotFound(c, "Role not found")
			return
		}
		utils.InternalError(c, err)
		return
	}
	if role.IsSystem {
		c.JSON(403, gin.H{"error": "System roles cannot be modified"})
		return
	}

	var req updateRoleRequest
	if err = c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Invalid request body")
		return
	}
	if req.Name != nil {
		trimmed := strings.TrimSpace(*req.Name)
		if trimmed == "" {
			utils.BadRequest(c, "name cannot be empty")
			return
		}
		req.Name = &trimmed

		var existingID string
		checkErr := db.Pool.QueryRow(ctx,
			"SELECT id FROM roles WHERE org_id = $1 AND name = $2 AND id <> $3",
			orgID, trimmed, roleID,
		).Scan(&existingID)
		if checkErr == nil {
			utils.Conflict(c, "Role name already exists")
			return
		}
		if checkErr != nil && !errors.Is(checkErr, pgx.ErrNoRows) {
			utils.InternalError(c, checkErr)
			return
		}
	}

	name := role.Name
	if req.Name != nil {
		name = *req.Name
	}
	description := role.Description
	if req.Description != nil {
		description = req.Description
	}

	err = db.Pool.QueryRow(ctx, `
		UPDATE roles
		SET name = $1, description = $2, updated_at = NOW()
		WHERE id = $3 AND org_id = $4
		RETURNING id, org_id, name, description, is_system, created_at, updated_at
	`, name, description, roleID, orgID).Scan(
		&role.ID,
		&role.OrgID,
		&role.Name,
		&role.Description,
		&role.IsSystem,
		&role.CreatedAt,
		&role.UpdatedAt,
	)
	if err != nil {
		utils.InternalError(c, err)
		return
	}

	if err = writeAuditLog(ctx, orgID, actorID, "role.updated", "role", roleID, map[string]interface{}{
		"name": role.Name,
	}); err != nil {
		utils.InternalError(c, err)
		return
	}

	utils.OK(c, role)
}

func DeleteRole(c *gin.Context) {
	ctx := context.Background()
	orgID := c.GetString("orgID")
	actorID := c.GetString("userID")
	if orgID == "" || actorID == "" {
		utils.Unauthorized(c)
		return
	}

	roleID := c.Param("id")
	role, err := loadRoleForOrg(ctx, roleID, orgID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			utils.NotFound(c, "Role not found")
			return
		}
		utils.InternalError(c, err)
		return
	}

	if role.IsSystem {
		c.JSON(403, gin.H{"error": "System roles cannot be deleted"})
		return
	}

	var assignedCount int
	err = db.Pool.QueryRow(ctx,
		"SELECT COUNT(*) FROM user_roles WHERE role_id = $1",
		roleID,
	).Scan(&assignedCount)
	if err != nil {
		utils.InternalError(c, err)
		return
	}
	if assignedCount > 0 {
		utils.Conflict(c, "Cannot delete role that is assigned to users. Revoke from all users first.")
		return
	}

	_, err = db.Pool.Exec(ctx,
		"DELETE FROM roles WHERE id = $1 AND org_id = $2",
		roleID, orgID,
	)
	if err != nil {
		utils.InternalError(c, err)
		return
	}

	if err = writeAuditLog(ctx, orgID, actorID, "role.deleted", "role", roleID, nil); err != nil {
		utils.InternalError(c, err)
		return
	}

	utils.OK(c, gin.H{"message": "Role deleted"})
}

func GetRolePermissions(c *gin.Context) {
	ctx := context.Background()
	orgID := c.GetString("orgID")
	if orgID == "" {
		utils.Unauthorized(c)
		return
	}

	roleID := c.Param("id")
	if _, err := ensureRoleInOrg(ctx, roleID, orgID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			utils.NotFound(c, "Role not found")
			return
		}
		utils.InternalError(c, err)
		return
	}

	rows, err := db.Pool.Query(ctx, `
		SELECT p.id, res.name as resource, res.label as resource_label,
		       p.action, p.label, p.description,
		       CASE WHEN rp.role_id IS NOT NULL THEN true ELSE false END as enabled
		FROM permissions p
		JOIN resources res ON res.id = p.resource_id
		LEFT JOIN role_permissions rp
		  ON rp.permission_id = p.id AND rp.role_id = $1
		ORDER BY res.name, p.action
	`, roleID)
	if err != nil {
		utils.InternalError(c, err)
		return
	}
	defer rows.Close()

	permissions := make([]rolePermissionToggleItem, 0)
	for rows.Next() {
		var item rolePermissionToggleItem
		if scanErr := rows.Scan(
			&item.ID,
			&item.Resource,
			&item.ResourceLabel,
			&item.Action,
			&item.Label,
			&item.Description,
			&item.Enabled,
		); scanErr != nil {
			utils.InternalError(c, scanErr)
			return
		}
		permissions = append(permissions, item)
	}
	if rows.Err() != nil {
		utils.InternalError(c, rows.Err())
		return
	}

	utils.OK(c, permissions)
}

func SetRolePermissions(c *gin.Context) {
	ctx := context.Background()
	orgID := c.GetString("orgID")
	actorID := c.GetString("userID")
	if orgID == "" || actorID == "" {
		utils.Unauthorized(c)
		return
	}

	roleID := c.Param("id")
	role, err := loadRoleForOrg(ctx, roleID, orgID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			utils.NotFound(c, "Role not found")
			return
		}
		utils.InternalError(c, err)
		return
	}
	if role.IsSystem {
		c.JSON(403, gin.H{"error": "System roles cannot be modified"})
		return
	}

	var req setRolePermissionsRequest
	if err = c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Invalid request body")
		return
	}

	if len(req.PermissionIDs) > 0 {
		var validCount int
		err = db.Pool.QueryRow(ctx,
			"SELECT COUNT(*) FROM permissions WHERE id::text = ANY($1::text[])",
			req.PermissionIDs,
		).Scan(&validCount)
		if err != nil {
			utils.InternalError(c, err)
			return
		}
		if validCount != len(req.PermissionIDs) {
			utils.BadRequest(c, "One or more permission_ids are invalid")
			return
		}
	}

	tx, err := db.Pool.Begin(ctx)
	if err != nil {
		utils.InternalError(c, err)
		return
	}
	defer tx.Rollback(ctx)

	if _, err = tx.Exec(ctx, "DELETE FROM role_permissions WHERE role_id = $1", roleID); err != nil {
		utils.InternalError(c, err)
		return
	}

	for _, pid := range req.PermissionIDs {
		if _, err = tx.Exec(ctx,
			"INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2)",
			roleID, pid,
		); err != nil {
			utils.InternalError(c, err)
			return
		}
	}

	if err = tx.Commit(ctx); err != nil {
		utils.InternalError(c, err)
		return
	}

	if err = invalidateRoleUsers(ctx, roleID); err != nil {
		utils.InternalError(c, err)
		return
	}

	if err = writeAuditLog(ctx, orgID, actorID, "role.permissions_updated", "role", roleID, map[string]interface{}{
		"permission_count": len(req.PermissionIDs),
	}); err != nil {
		utils.InternalError(c, err)
		return
	}

	utils.OK(c, gin.H{"message": "Permissions updated"})
}

func TogglePermission(c *gin.Context) {
	ctx := context.Background()
	orgID := c.GetString("orgID")
	actorID := c.GetString("userID")
	if orgID == "" || actorID == "" {
		utils.Unauthorized(c)
		return
	}

	roleID := c.Param("id")
	permID := c.Param("permId")

	role, err := loadRoleForOrg(ctx, roleID, orgID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			utils.NotFound(c, "Role not found")
			return
		}
		utils.InternalError(c, err)
		return
	}
	if role.IsSystem {
		c.JSON(403, gin.H{"error": "System roles cannot be modified"})
		return
	}

	var permissionExists bool
	err = db.Pool.QueryRow(ctx,
		"SELECT EXISTS(SELECT 1 FROM permissions WHERE id = $1)",
		permID,
	).Scan(&permissionExists)
	if err != nil {
		utils.InternalError(c, err)
		return
	}
	if !permissionExists {
		utils.NotFound(c, "Permission not found")
		return
	}

	var relationExists bool
	err = db.Pool.QueryRow(ctx,
		"SELECT EXISTS(SELECT 1 FROM role_permissions WHERE role_id = $1 AND permission_id = $2)",
		roleID, permID,
	).Scan(&relationExists)

	enabled := false
	if err == nil && relationExists {
		if _, err = db.Pool.Exec(ctx,
			"DELETE FROM role_permissions WHERE role_id = $1 AND permission_id = $2",
			roleID, permID,
		); err != nil {
			utils.InternalError(c, err)
			return
		}
		enabled = false
	} else if err == nil && !relationExists {
		if _, err = db.Pool.Exec(ctx,
			"INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2)",
			roleID, permID,
		); err != nil {
			utils.InternalError(c, err)
			return
		}
		enabled = true
	} else {
		utils.InternalError(c, err)
		return
	}

	if err = invalidateRoleUsers(ctx, roleID); err != nil {
		utils.InternalError(c, err)
		return
	}

	if err = writeAuditLog(ctx, orgID, actorID, "role.permissions_toggled", "role", roleID, map[string]interface{}{
		"permission_id": permID,
		"enabled":       enabled,
	}); err != nil {
		utils.InternalError(c, err)
		return
	}

	utils.OK(c, gin.H{"enabled": enabled})
}

func ListAllPermissions(c *gin.Context) {
	ctx := context.Background()

	rows, err := db.Pool.Query(ctx, `
		SELECT res.id as resource_id, res.name as resource, res.label as resource_label,
		       p.id, p.action, p.label, p.description
		FROM permissions p
		JOIN resources res ON res.id = p.resource_id
		ORDER BY res.name, p.action
	`)
	if err != nil {
		utils.InternalError(c, err)
		return
	}
	defer rows.Close()

	groups := make([]permissionGroup, 0)
	groupIndex := make(map[string]int)

	for rows.Next() {
		var resourceID, resourceName, resourceLabel string
		var perm models.Permission
		if scanErr := rows.Scan(
			&resourceID,
			&resourceName,
			&resourceLabel,
			&perm.ID,
			&perm.Action,
			&perm.Label,
			&perm.Description,
		); scanErr != nil {
			utils.InternalError(c, scanErr)
			return
		}

		idx, found := groupIndex[resourceID]
		if !found {
			groups = append(groups, permissionGroup{
				Resource: permissionGroupResource{
					ID:    resourceID,
					Name:  resourceName,
					Label: resourceLabel,
				},
				Permissions: make([]models.Permission, 0, 5),
			})
			idx = len(groups) - 1
			groupIndex[resourceID] = idx
		}

		perm.ResourceID = resourceID
		groups[idx].Permissions = append(groups[idx].Permissions, perm)
	}
	if rows.Err() != nil {
		utils.InternalError(c, rows.Err())
		return
	}

	utils.OK(c, groups)
}

func loadRoleForOrg(ctx context.Context, roleID, orgID string) (*models.Role, error) {
	var role models.Role
	err := db.Pool.QueryRow(ctx, `
		SELECT id, org_id, name, description, is_system, created_at, updated_at
		FROM roles
		WHERE id = $1 AND org_id = $2
	`, roleID, orgID).Scan(
		&role.ID,
		&role.OrgID,
		&role.Name,
		&role.Description,
		&role.IsSystem,
		&role.CreatedAt,
		&role.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &role, nil
}

func invalidateRoleUsers(ctx context.Context, roleID string) error {
	rows, err := db.Pool.Query(ctx,
		"SELECT DISTINCT user_id FROM user_roles WHERE role_id = $1",
		roleID,
	)
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var userID string
		if scanErr := rows.Scan(&userID); scanErr != nil {
			return scanErr
		}
		middleware.ClearUserPermissionCache(userID)
	}

	return rows.Err()
}
