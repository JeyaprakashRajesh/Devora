package handlers

import (
	"context"
	"strings"
	"time"

	"github.com/devora/devora/internal/db"
	"github.com/devora/devora/internal/models"
	"github.com/devora/devora/internal/utils"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
)

type registerRequest struct {
	OrgName  string `json:"org_name"`
	OrgSlug  string `json:"org_slug"`
	Email    string `json:"email"`
	Username string `json:"username"`
	Password string `json:"password"`
}

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

func Register(c *gin.Context) {
	ctx := context.Background()

	var req registerRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Invalid request body")
		return
	}
	if strings.TrimSpace(req.OrgName) == "" || strings.TrimSpace(req.OrgSlug) == "" || strings.TrimSpace(req.Email) == "" || strings.TrimSpace(req.Username) == "" || strings.TrimSpace(req.Password) == "" {
		utils.BadRequest(c, "All fields are required")
		return
	}

	var existingID string
	err := db.Pool.QueryRow(ctx, "SELECT id FROM organizations WHERE slug = $1", req.OrgSlug).Scan(&existingID)
	if err == nil {
		utils.Conflict(c, "Organization slug already taken")
		return
	}
	if err != pgx.ErrNoRows {
		utils.InternalError(c, err)
		return
	}

	err = db.Pool.QueryRow(ctx, "SELECT id FROM users WHERE email = $1", req.Email).Scan(&existingID)
	if err == nil {
		utils.Conflict(c, "Email already registered")
		return
	}
	if err != pgx.ErrNoRows {
		utils.InternalError(c, err)
		return
	}

	passwordHash, err := utils.HashPassword(req.Password)
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

	var org models.Organization
	err = tx.QueryRow(ctx,
		"INSERT INTO organizations (name, slug) VALUES ($1, $2) RETURNING id, name, slug, created_at, updated_at",
		req.OrgName, req.OrgSlug,
	).Scan(&org.ID, &org.Name, &org.Slug, &org.CreatedAt, &org.UpdatedAt)
	if err != nil {
		utils.InternalError(c, err)
		return
	}

	var user models.User
	err = tx.QueryRow(ctx,
		"INSERT INTO users (org_id, email, username, password_hash, is_org_owner, status) VALUES ($1, $2, $3, $4, true, 'active') RETURNING id, org_id, email, username, display_name, status, is_org_owner, last_seen_at, created_at, updated_at",
		org.ID, req.Email, req.Username, passwordHash,
	).Scan(&user.ID, &user.OrgID, &user.Email, &user.Username, &user.DisplayName, &user.Status, &user.IsOrgOwner, &user.LastSeenAt, &user.CreatedAt, &user.UpdatedAt)
	if err != nil {
		utils.InternalError(c, err)
		return
	}

	_, err = tx.Exec(ctx, "UPDATE organizations SET owner_id = $1 WHERE id = $2", user.ID, org.ID)
	if err != nil {
		utils.InternalError(c, err)
		return
	}
	org.OwnerID = &user.ID

	orgAdminRoleID, err := createSystemRole(ctx, tx, org.ID, "org_admin", true, nil)
	if err != nil {
		utils.InternalError(c, err)
		return
	}

	developerPerms := [][2]string{
		{"project", "read"},
		{"project", "create"},
		{"repository", "read"},
		{"repository", "update"},
		{"pipeline", "read"},
		{"pipeline", "create"},
		{"deployment", "read"},
	}
	if _, err = createSystemRole(ctx, tx, org.ID, "developer", true, developerPerms); err != nil {
		utils.InternalError(c, err)
		return
	}

	viewerPerms := [][2]string{
		{"project", "read"},
		{"repository", "read"},
		{"pipeline", "read"},
		{"deployment", "read"},
	}
	if _, err = createSystemRole(ctx, tx, org.ID, "viewer", true, viewerPerms); err != nil {
		utils.InternalError(c, err)
		return
	}

	billingPerms := [][2]string{{"org", "read"}, {"org", "update"}}
	if _, err = createSystemRole(ctx, tx, org.ID, "billing", true, billingPerms); err != nil {
		utils.InternalError(c, err)
		return
	}

	_, err = tx.Exec(ctx, "INSERT INTO user_roles (user_id, role_id, granted_by) VALUES ($1, $2, $1)", user.ID, orgAdminRoleID)
	if err != nil {
		utils.InternalError(c, err)
		return
	}

	if err = tx.Commit(ctx); err != nil {
		utils.InternalError(c, err)
		return
	}

	token, err := utils.SignJWT(user.ID, org.ID)
	if err != nil {
		utils.InternalError(c, err)
		return
	}

	tokenHash, err := utils.HashPassword(sessionHashInput(token))
	if err != nil {
		utils.InternalError(c, err)
		return
	}

	_, err = db.Pool.Exec(ctx, "INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, NOW() + INTERVAL '24 hours')", user.ID, tokenHash)
	if err != nil {
		utils.InternalError(c, err)
		return
	}

	utils.Created(c, gin.H{
		"user":  user,
		"org":   org,
		"token": token,
	})
}

func Login(c *gin.Context) {
	ctx := context.Background()

	var req loginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Invalid request body")
		return
	}
	if strings.TrimSpace(req.Email) == "" || strings.TrimSpace(req.Password) == "" {
		utils.BadRequest(c, "Email and password are required")
		return
	}

	var user models.User
	var org models.Organization
	var passwordHash string

	err := db.Pool.QueryRow(ctx, `
		SELECT u.id, u.org_id, u.email, u.username, u.display_name,
		       u.password_hash, u.status, u.is_org_owner, u.last_seen_at, u.created_at, u.updated_at,
		       o.id, o.name, o.slug, o.owner_id, o.created_at, o.updated_at
		FROM users u
		JOIN organizations o ON o.id = u.org_id
		WHERE u.email = $1
	`, req.Email).Scan(
		&user.ID, &user.OrgID, &user.Email, &user.Username, &user.DisplayName,
		&passwordHash, &user.Status, &user.IsOrgOwner, &user.LastSeenAt, &user.CreatedAt, &user.UpdatedAt,
		&org.ID, &org.Name, &org.Slug, &org.OwnerID, &org.CreatedAt, &org.UpdatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			utils.Unauthorized(c)
			return
		}
		utils.InternalError(c, err)
		return
	}

	if user.Status == "suspended" {
		c.JSON(403, gin.H{"error": "Account suspended"})
		return
	}

	if !utils.CheckPassword(req.Password, passwordHash) {
		utils.Unauthorized(c)
		return
	}

	token, err := utils.SignJWT(user.ID, user.OrgID)
	if err != nil {
		utils.InternalError(c, err)
		return
	}

	tokenHash, err := utils.HashPassword(sessionHashInput(token))
	if err != nil {
		utils.InternalError(c, err)
		return
	}

	_, err = db.Pool.Exec(ctx, "INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, NOW() + INTERVAL '24 hours')", user.ID, tokenHash)
	if err != nil {
		utils.InternalError(c, err)
		return
	}

	_, err = db.Pool.Exec(ctx, "UPDATE users SET last_seen_at = NOW() WHERE id = $1", user.ID)
	if err != nil {
		utils.InternalError(c, err)
		return
	}
	seen := time.Now()
	user.LastSeenAt = &seen

	utils.OK(c, gin.H{
		"user":  user,
		"org":   org,
		"token": token,
	})
}

func Logout(c *gin.Context) {
	ctx := context.Background()

	header := c.GetHeader("Authorization")
	if header == "" || !strings.HasPrefix(header, "Bearer ") {
		utils.Unauthorized(c)
		return
	}
	tokenStr := strings.TrimPrefix(header, "Bearer ")

	tokenHash, err := utils.HashPassword(sessionHashInput(tokenStr))
	if err != nil {
		utils.InternalError(c, err)
		return
	}

	_, err = db.Pool.Exec(ctx, "DELETE FROM sessions WHERE token_hash = $1", tokenHash)
	if err != nil {
		utils.InternalError(c, err)
		return
	}

	utils.OK(c, gin.H{"message": "Logged out"})
}

func Me(c *gin.Context) {
	ctx := context.Background()

	userID := c.GetString("userID")
	orgID := c.GetString("orgID")
	if userID == "" || orgID == "" {
		utils.Unauthorized(c)
		return
	}

	var user models.User
	err := db.Pool.QueryRow(ctx,
		"SELECT id, org_id, email, username, display_name, status, is_org_owner, last_seen_at, created_at, updated_at FROM users WHERE id = $1",
		userID,
	).Scan(&user.ID, &user.OrgID, &user.Email, &user.Username, &user.DisplayName, &user.Status, &user.IsOrgOwner, &user.LastSeenAt, &user.CreatedAt, &user.UpdatedAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			utils.Unauthorized(c)
			return
		}
		utils.InternalError(c, err)
		return
	}

	var org models.Organization
	err = db.Pool.QueryRow(ctx,
		"SELECT id, name, slug, owner_id, created_at, updated_at FROM organizations WHERE id = $1",
		orgID,
	).Scan(&org.ID, &org.Name, &org.Slug, &org.OwnerID, &org.CreatedAt, &org.UpdatedAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			utils.Unauthorized(c)
			return
		}
		utils.InternalError(c, err)
		return
	}

	rows, err := db.Pool.Query(ctx, `
		SELECT DISTINCT res.name || ':' || p.action AS perm
		FROM user_roles ur
		JOIN role_permissions rp ON rp.role_id = ur.role_id
		JOIN permissions p ON p.id = rp.permission_id
		JOIN resources res ON res.id = p.resource_id
		WHERE ur.user_id = $1
		  AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
	`, userID)
	if err != nil {
		utils.InternalError(c, err)
		return
	}
	defer rows.Close()

	permissions := make([]string, 0)
	for rows.Next() {
		var perm string
		if scanErr := rows.Scan(&perm); scanErr != nil {
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
		"user":        user,
		"org":         org,
		"permissions": permissions,
	})
}

func createSystemRole(ctx context.Context, tx pgx.Tx, orgID, name string, isSystem bool, permissions [][2]string) (string, error) {
	var roleID string
	err := tx.QueryRow(ctx,
		"INSERT INTO roles (org_id, name, is_system) VALUES ($1, $2, $3) RETURNING id",
		orgID, name, isSystem,
	).Scan(&roleID)
	if err != nil {
		return "", err
	}

	if len(permissions) == 0 {
		_, err = tx.Exec(ctx, "INSERT INTO role_permissions (role_id, permission_id) SELECT $1, id FROM permissions", roleID)
		return roleID, err
	}

	for _, pair := range permissions {
		var permissionID string
		permErr := tx.QueryRow(ctx, `
			SELECT p.id
			FROM permissions p
			JOIN resources r ON r.id = p.resource_id
			WHERE r.name = $1 AND p.action = $2
		`, pair[0], pair[1]).Scan(&permissionID)
		if permErr != nil {
			return "", permErr
		}

		_, permErr = tx.Exec(ctx,
			"INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2)",
			roleID, permissionID,
		)
		if permErr != nil {
			return "", permErr
		}
	}

	return roleID, nil
}

func sessionHashInput(token string) string {
	if len(token) <= 72 {
		return token
	}
	return token[:72]
}
