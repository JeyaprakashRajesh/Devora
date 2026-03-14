package handlers

import (
	"context"
	"crypto/rand"
	"errors"
	"strconv"
	"strings"
	"time"

	"github.com/devora/devora/internal/db"
	"github.com/devora/devora/internal/middleware"
	"github.com/devora/devora/internal/models"
	"github.com/devora/devora/internal/utils"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
)

type inviteUserRequest struct {
	Email       string  `json:"email"`
	Username    string  `json:"username"`
	DisplayName *string `json:"display_name"`
}

type updateUserRequest struct {
	DisplayName *string `json:"display_name"`
	Status      *string `json:"status"`
}

type assignRoleRequest struct {
	RoleID       string     `json:"role_id"`
	ResourceType *string    `json:"resource_type"`
	ResourceID   *string    `json:"resource_id"`
	ExpiresAt    *time.Time `json:"expires_at"`
}

type invitedUserResponse struct {
	ID          string     `json:"id"`
	OrgID       string     `json:"org_id"`
	Email       string     `json:"email"`
	Username    string     `json:"username"`
	DisplayName *string    `json:"display_name"`
	Status      string     `json:"status"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   *time.Time `json:"updated_at,omitempty"`
}

type userRoleAssignment struct {
	AssignmentID string     `json:"assignment_id"`
	RoleID       string     `json:"role_id"`
	Name         string     `json:"name"`
	Description  *string    `json:"description"`
	IsSystem     bool       `json:"is_system"`
	ResourceType *string    `json:"resource_type"`
	ResourceID   *string    `json:"resource_id"`
	ExpiresAt    *time.Time `json:"expires_at"`
	CreatedAt    time.Time  `json:"created_at"`
}

func ListUsers(c *gin.Context) {
	ctx := context.Background()
	orgID := c.GetString("orgID")
	if orgID == "" {
		utils.Unauthorized(c)
		return
	}

	rows, err := db.Pool.Query(ctx, `
		SELECT id, org_id, email, username, display_name, status,
		       is_org_owner, last_seen_at, created_at, updated_at
		FROM users
		WHERE org_id = $1
		ORDER BY created_at ASC
	`, orgID)
	if err != nil {
		utils.InternalError(c, err)
		return
	}
	defer rows.Close()

	users := make([]models.User, 0)
	for rows.Next() {
		var user models.User
		if scanErr := rows.Scan(
			&user.ID,
			&user.OrgID,
			&user.Email,
			&user.Username,
			&user.DisplayName,
			&user.Status,
			&user.IsOrgOwner,
			&user.LastSeenAt,
			&user.CreatedAt,
			&user.UpdatedAt,
		); scanErr != nil {
			utils.InternalError(c, scanErr)
			return
		}
		users = append(users, user)
	}
	if rows.Err() != nil {
		utils.InternalError(c, rows.Err())
		return
	}

	utils.OK(c, users)
}

func InviteUser(c *gin.Context) {
	ctx := context.Background()
	orgID := c.GetString("orgID")
	actorID := c.GetString("userID")
	if orgID == "" || actorID == "" {
		utils.Unauthorized(c)
		return
	}

	var req inviteUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Invalid request body")
		return
	}
	if strings.TrimSpace(req.Email) == "" || strings.TrimSpace(req.Username) == "" {
		utils.BadRequest(c, "Email and username are required")
		return
	}

	var existingID string
	err := db.Pool.QueryRow(ctx, "SELECT id FROM users WHERE email = $1", req.Email).Scan(&existingID)
	if err == nil {
		utils.Conflict(c, "Email already registered")
		return
	}
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		utils.InternalError(c, err)
		return
	}

	tempPassword, err := generateTempPassword(16)
	if err != nil {
		utils.InternalError(c, err)
		return
	}

	passwordHash, err := utils.HashPassword(tempPassword)
	if err != nil {
		utils.InternalError(c, err)
		return
	}

	var invited invitedUserResponse
	err = db.Pool.QueryRow(ctx, `
		INSERT INTO users (org_id, email, username, display_name, password_hash, status)
		VALUES ($1, $2, $3, $4, $5, 'invited')
		RETURNING id, org_id, email, username, display_name, status, created_at
	`, orgID, req.Email, req.Username, req.DisplayName, passwordHash).
		Scan(&invited.ID, &invited.OrgID, &invited.Email, &invited.Username, &invited.DisplayName, &invited.Status, &invited.CreatedAt)
	if err != nil {
		utils.InternalError(c, err)
		return
	}

	if err = writeAuditLog(ctx, orgID, actorID, "user.invited", "user", invited.ID, map[string]interface{}{
		"email":    req.Email,
		"username": req.Username,
	}); err != nil {
		utils.InternalError(c, err)
		return
	}

	utils.Created(c, gin.H{
		"user":          invited,
		"temp_password": tempPassword,
	})
}

func GetUser(c *gin.Context) {
	ctx := context.Background()
	orgID := c.GetString("orgID")
	if orgID == "" {
		utils.Unauthorized(c)
		return
	}

	targetID := c.Param("id")
	var user models.User
	err := db.Pool.QueryRow(ctx, `
		SELECT id, org_id, email, username, display_name, status,
		       is_org_owner, last_seen_at, created_at, updated_at
		FROM users
		WHERE id = $1 AND org_id = $2
	`, targetID, orgID).Scan(
		&user.ID,
		&user.OrgID,
		&user.Email,
		&user.Username,
		&user.DisplayName,
		&user.Status,
		&user.IsOrgOwner,
		&user.LastSeenAt,
		&user.CreatedAt,
		&user.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			utils.NotFound(c, "User not found")
			return
		}
		utils.InternalError(c, err)
		return
	}

	utils.OK(c, user)
}

func UpdateUser(c *gin.Context) {
	ctx := context.Background()
	orgID := c.GetString("orgID")
	actorID := c.GetString("userID")
	if orgID == "" || actorID == "" {
		utils.Unauthorized(c)
		return
	}

	targetID := c.Param("id")

	var req updateUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Invalid request body")
		return
	}

	if req.Status != nil {
		status := strings.TrimSpace(*req.Status)
		if status != "active" && status != "suspended" {
			utils.BadRequest(c, "Status must be 'active' or 'suspended'")
			return
		}
		req.Status = &status
	}

	if req.DisplayName == nil && req.Status == nil {
		utils.BadRequest(c, "No updatable fields provided")
		return
	}

	var existingStatus string
	err := db.Pool.QueryRow(ctx,
		"SELECT status FROM users WHERE id = $1 AND org_id = $2",
		targetID, orgID,
	).Scan(&existingStatus)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			utils.NotFound(c, "User not found")
			return
		}
		utils.InternalError(c, err)
		return
	}

	setClauses := make([]string, 0, 2)
	args := make([]interface{}, 0, 6)
	argPos := 1

	if req.DisplayName != nil {
		setClauses = append(setClauses, "display_name = $1")
		args = append(args, req.DisplayName)
		argPos++
	}
	if req.Status != nil {
		setClauses = append(setClauses, "status = $"+itoa(argPos))
		args = append(args, *req.Status)
		argPos++
	}

	query := "UPDATE users SET " + strings.Join(setClauses, ", ") + ", updated_at = NOW() WHERE id = $" + itoa(argPos) + " AND org_id = $" + itoa(argPos+1) + " RETURNING id, org_id, email, username, display_name, status, is_org_owner, last_seen_at, created_at, updated_at"
	args = append(args, targetID, orgID)

	var user models.User
	err = db.Pool.QueryRow(ctx, query, args...).Scan(
		&user.ID,
		&user.OrgID,
		&user.Email,
		&user.Username,
		&user.DisplayName,
		&user.Status,
		&user.IsOrgOwner,
		&user.LastSeenAt,
		&user.CreatedAt,
		&user.UpdatedAt,
	)
	if err != nil {
		utils.InternalError(c, err)
		return
	}

	if err = writeAuditLog(ctx, orgID, actorID, "user.updated", "user", targetID, map[string]interface{}{
		"display_name_changed": req.DisplayName != nil,
		"status_changed":       req.Status != nil,
	}); err != nil {
		utils.InternalError(c, err)
		return
	}

	if req.Status != nil && existingStatus != *req.Status {
		middleware.ClearUserPermissionCache(targetID)
	}

	utils.OK(c, user)
}

func DeleteUser(c *gin.Context) {
	ctx := context.Background()
	orgID := c.GetString("orgID")
	actorID := c.GetString("userID")
	if orgID == "" || actorID == "" {
		utils.Unauthorized(c)
		return
	}

	targetID := c.Param("id")
	if targetID == actorID {
		c.JSON(403, gin.H{"error": "Cannot remove your own account"})
		return
	}

	var isOrgOwner bool
	err := db.Pool.QueryRow(ctx,
		"SELECT is_org_owner FROM users WHERE id = $1 AND org_id = $2",
		targetID, orgID,
	).Scan(&isOrgOwner)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			utils.NotFound(c, "User not found")
			return
		}
		utils.InternalError(c, err)
		return
	}

	if isOrgOwner {
		c.JSON(403, gin.H{"error": "Cannot remove organization owner"})
		return
	}

	_, err = db.Pool.Exec(ctx, "DELETE FROM users WHERE id = $1 AND org_id = $2", targetID, orgID)
	if err != nil {
		utils.InternalError(c, err)
		return
	}

	if err = writeAuditLog(ctx, orgID, actorID, "user.deleted", "user", targetID, nil); err != nil {
		utils.InternalError(c, err)
		return
	}

	middleware.ClearUserPermissionCache(targetID)
	utils.OK(c, gin.H{"message": "User removed"})
}

func GetUserRoles(c *gin.Context) {
	ctx := context.Background()
	orgID := c.GetString("orgID")
	if orgID == "" {
		utils.Unauthorized(c)
		return
	}

	targetID := c.Param("id")
	if _, err := ensureUserInOrg(ctx, targetID, orgID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			utils.NotFound(c, "User not found")
			return
		}
		utils.InternalError(c, err)
		return
	}

	rows, err := db.Pool.Query(ctx, `
		SELECT ur.id, r.id, r.name, r.description, r.is_system,
		       ur.resource_type, ur.resource_id::text, ur.expires_at, ur.created_at
		FROM user_roles ur
		JOIN roles r ON r.id = ur.role_id
		WHERE ur.user_id = $1
		  AND r.org_id = $2
		ORDER BY ur.created_at ASC
	`, targetID, orgID)
	if err != nil {
		utils.InternalError(c, err)
		return
	}
	defer rows.Close()

	assignments := make([]userRoleAssignment, 0)
	for rows.Next() {
		var assignment userRoleAssignment
		if scanErr := rows.Scan(
			&assignment.AssignmentID,
			&assignment.RoleID,
			&assignment.Name,
			&assignment.Description,
			&assignment.IsSystem,
			&assignment.ResourceType,
			&assignment.ResourceID,
			&assignment.ExpiresAt,
			&assignment.CreatedAt,
		); scanErr != nil {
			utils.InternalError(c, scanErr)
			return
		}
		assignments = append(assignments, assignment)
	}
	if rows.Err() != nil {
		utils.InternalError(c, rows.Err())
		return
	}

	utils.OK(c, assignments)
}

func AssignRole(c *gin.Context) {
	ctx := context.Background()
	orgID := c.GetString("orgID")
	actorID := c.GetString("userID")
	if orgID == "" || actorID == "" {
		utils.Unauthorized(c)
		return
	}

	targetID := c.Param("id")
	if targetID == actorID {
		c.JSON(403, gin.H{"error": "Cannot modify your own roles"})
		return
	}

	var req assignRoleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Invalid request body")
		return
	}
	if strings.TrimSpace(req.RoleID) == "" {
		utils.BadRequest(c, "role_id is required")
		return
	}

	if _, err := ensureUserInOrg(ctx, targetID, orgID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			utils.NotFound(c, "User not found")
			return
		}
		utils.InternalError(c, err)
		return
	}

	if _, err := ensureRoleInOrg(ctx, req.RoleID, orgID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			utils.NotFound(c, "Role not found")
			return
		}
		utils.InternalError(c, err)
		return
	}

	var existingAssignmentID string
	err := db.Pool.QueryRow(ctx, `
		SELECT id
		FROM user_roles
		WHERE user_id = $1
		  AND role_id = $2
		  AND COALESCE(resource_type, '') = COALESCE($3, '')
		  AND COALESCE(resource_id::text, '') = COALESCE($4, '')
	`, targetID, req.RoleID, req.ResourceType, req.ResourceID).Scan(&existingAssignmentID)
	if err == nil {
		utils.Conflict(c, "Role already assigned")
		return
	}
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		utils.InternalError(c, err)
		return
	}

	_, err = db.Pool.Exec(ctx, `
		INSERT INTO user_roles (user_id, role_id, resource_type, resource_id, granted_by, expires_at)
		VALUES ($1, $2, $3, $4, $5, $6)
	`, targetID, req.RoleID, req.ResourceType, req.ResourceID, actorID, req.ExpiresAt)
	if err != nil {
		utils.InternalError(c, err)
		return
	}

	if err = writeAuditLog(ctx, orgID, actorID, "role.assigned", "user", targetID, map[string]interface{}{
		"role_id":       req.RoleID,
		"resource_type": req.ResourceType,
		"resource_id":   req.ResourceID,
		"expires_at":    req.ExpiresAt,
	}); err != nil {
		utils.InternalError(c, err)
		return
	}

	middleware.ClearUserPermissionCache(targetID)
	utils.Created(c, gin.H{"message": "Role assigned"})
}

func RevokeRole(c *gin.Context) {
	ctx := context.Background()
	orgID := c.GetString("orgID")
	actorID := c.GetString("userID")
	if orgID == "" || actorID == "" {
		utils.Unauthorized(c)
		return
	}

	targetID := c.Param("id")
	roleID := c.Param("roleId")
	if targetID == actorID {
		c.JSON(403, gin.H{"error": "Cannot modify your own roles"})
		return
	}

	if _, err := ensureUserInOrg(ctx, targetID, orgID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			utils.NotFound(c, "User not found")
			return
		}
		utils.InternalError(c, err)
		return
	}

	if _, err := ensureRoleInOrg(ctx, roleID, orgID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			utils.NotFound(c, "Role not found")
			return
		}
		utils.InternalError(c, err)
		return
	}

	cmdTag, err := db.Pool.Exec(ctx,
		"DELETE FROM user_roles WHERE user_id = $1 AND role_id = $2",
		targetID, roleID,
	)
	if err != nil {
		utils.InternalError(c, err)
		return
	}
	if cmdTag.RowsAffected() == 0 {
		utils.NotFound(c, "Role assignment not found")
		return
	}

	if err = writeAuditLog(ctx, orgID, actorID, "role.revoked", "user", targetID, map[string]interface{}{
		"role_id": roleID,
	}); err != nil {
		utils.InternalError(c, err)
		return
	}

	middleware.ClearUserPermissionCache(targetID)
	utils.OK(c, gin.H{"message": "Role revoked"})
}

func ensureUserInOrg(ctx context.Context, userID, orgID string) (string, error) {
	var id string
	err := db.Pool.QueryRow(ctx,
		"SELECT id FROM users WHERE id = $1 AND org_id = $2",
		userID, orgID,
	).Scan(&id)
	if err != nil {
		return "", err
	}
	return id, nil
}

func ensureRoleInOrg(ctx context.Context, roleID, orgID string) (string, error) {
	var id string
	err := db.Pool.QueryRow(ctx,
		"SELECT id FROM roles WHERE id = $1 AND org_id = $2",
		roleID, orgID,
	).Scan(&id)
	if err != nil {
		return "", err
	}
	return id, nil
}

func writeAuditLog(ctx context.Context, orgID, actorID, action, resourceType, resourceID string, metadata map[string]interface{}) error {
	_, err := db.Pool.Exec(ctx, `
		INSERT INTO audit_logs (org_id, actor_id, action, resource_type, resource_id, metadata)
		VALUES ($1, $2, $3, $4, $5, COALESCE($6, '{}'::jsonb))
	`, orgID, actorID, action, resourceType, resourceID, metadata)
	return err
}

func generateTempPassword(length int) (string, error) {
	const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"
	buf := make([]byte, length)
	randBytes := make([]byte, length)
	if _, err := rand.Read(randBytes); err != nil {
		return "", err
	}
	for i := 0; i < length; i++ {
		buf[i] = alphabet[int(randBytes[i])%len(alphabet)]
	}
	return string(buf), nil
}

func itoa(i int) string {
	return strconv.Itoa(i)
}
