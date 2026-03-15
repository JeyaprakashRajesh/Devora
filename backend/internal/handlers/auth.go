package handlers

import (
	"context"
	"errors"
	"regexp"
	"strings"
	"time"

	"github.com/devora/devora/internal/db"
	"github.com/devora/devora/internal/models"
	"github.com/devora/devora/internal/utils"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
)

type registerRequest struct {
	OrgName       string `json:"org_name"`
	OrgSlug       string `json:"org_slug"`
	OrgEmail      string `json:"org_email"`
	AdminEmail    string `json:"admin_email"`
	AdminUsername string `json:"admin_username"`
	AdminPassword string `json:"admin_password"`
}

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type completeOnboardingRequest struct {
	Name        string `json:"name"`
	NewPassword string `json:"new_password"`
}

func Register(c *gin.Context) {
	var dto registerRequest

	if err := c.ShouldBindJSON(&dto); err != nil {
		utils.BadRequest(c, "Invalid request body")
		return
	}

	if strings.TrimSpace(dto.OrgName) == "" || strings.TrimSpace(dto.OrgSlug) == "" ||
		strings.TrimSpace(dto.OrgEmail) == "" || strings.TrimSpace(dto.AdminEmail) == "" ||
		strings.TrimSpace(dto.AdminUsername) == "" || strings.TrimSpace(dto.AdminPassword) == "" {
		utils.BadRequest(c, "All fields are required")
		return
	}

	dto.OrgSlug = strings.ToLower(strings.TrimSpace(dto.OrgSlug))

	slugRegex := regexp.MustCompile(`^[a-z0-9-]+$`)
	if !slugRegex.MatchString(dto.OrgSlug) || len(dto.OrgSlug) < 2 {
		utils.BadRequest(c, "Slug must be lowercase letters, numbers and hyphens only, minimum 2 characters")
		return
	}

	if !isValidEmail(dto.OrgEmail) {
		utils.BadRequest(c, "Invalid organization email")
		return
	}
	if !isValidEmail(dto.AdminEmail) {
		utils.BadRequest(c, "Invalid admin email")
		return
	}

	if len(dto.AdminPassword) < 8 {
		utils.BadRequest(c, "Password must be at least 8 characters")
		return
	}

	ctx := context.Background()

	var existingOrg string
	err := db.Pool.QueryRow(ctx,
		"SELECT id FROM organizations WHERE slug=$1",
		dto.OrgSlug,
	).Scan(&existingOrg)
	if err == nil {
		utils.Conflict(c, "Organization slug already taken")
		return
	}
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		utils.InternalError(c, err)
		return
	}

	var existingUser string
	err = db.Pool.QueryRow(ctx,
		"SELECT id FROM users WHERE email=$1",
		dto.AdminEmail,
	).Scan(&existingUser)
	if err == nil {
		utils.Conflict(c, "Admin email already registered")
		return
	}
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		utils.InternalError(c, err)
		return
	}

	passwordHash, err := utils.HashPassword(dto.AdminPassword)
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
		`INSERT INTO organizations
		   (id, name, slug, contact_email, setup_complete)
		 VALUES (uuid_generate_v4(),$1,$2,$3,TRUE)
		 RETURNING id, name, slug, contact_email,
		           website, logo_url, setup_complete,
		           created_at, updated_at`,
		dto.OrgName, dto.OrgSlug, dto.OrgEmail,
	).Scan(
		&org.ID, &org.Name, &org.Slug,
		&org.ContactEmail, &org.Website,
		&org.LogoURL, &org.SetupComplete,
		&org.CreatedAt, &org.UpdatedAt,
	)
	if err != nil {
		utils.InternalError(c, err)
		return
	}

	var user models.User
	err = tx.QueryRow(ctx,
		`INSERT INTO users
		   (id, org_id, email, username,
		    display_name, password_hash,
		    status, is_org_owner,
		    must_change_password, onboarding_complete)
		 VALUES (uuid_generate_v4(),$1,$2,$3,$3,$4,
		         'active',TRUE,FALSE,TRUE)
		 RETURNING id, org_id, email, username,
		           display_name, status, is_org_owner,
		           must_change_password,
		           onboarding_complete, created_at, updated_at`,
		org.ID, dto.AdminEmail,
		dto.AdminUsername, passwordHash,
	).Scan(
		&user.ID, &user.OrgID, &user.Email,
		&user.Username, &user.DisplayName,
		&user.Status, &user.IsOrgOwner,
		&user.MustChangePassword,
		&user.OnboardingComplete,
		&user.CreatedAt, &user.UpdatedAt,
	)
	if err != nil {
		utils.InternalError(c, err)
		return
	}

	_, err = tx.Exec(ctx,
		"UPDATE organizations SET owner_id=$1 WHERE id=$2",
		user.ID, org.ID,
	)
	if err != nil {
		utils.InternalError(c, err)
		return
	}
	org.OwnerID = &user.ID

	if err = ensureBaseRBACPermissions(ctx, tx); err != nil {
		utils.InternalError(c, err)
		return
	}

	type systemRole struct {
		Name  string
		Perms [][2]string
	}

	systemRoles := []systemRole{
		{
			Name:  "org_admin",
			Perms: nil,
		},
		{
			Name: "developer",
			Perms: [][2]string{
				{"project", "read"}, {"project", "create"},
				{"repository", "read"}, {"repository", "update"},
				{"pipeline", "read"}, {"pipeline", "create"},
				{"deployment", "read"},
			},
		},
		{
			Name: "viewer",
			Perms: [][2]string{
				{"project", "read"}, {"repository", "read"},
				{"pipeline", "read"}, {"deployment", "read"},
			},
		},
		{
			Name: "billing",
			Perms: [][2]string{
				{"org", "read"}, {"org", "update"},
			},
		},
	}

	roleIDs := map[string]string{}
	for _, sr := range systemRoles {
		var roleID string
		err = tx.QueryRow(ctx,
			`INSERT INTO roles
			   (id, org_id, name, is_system, created_by)
			 VALUES (uuid_generate_v4(),$1,$2,TRUE,$3)
			 RETURNING id`,
			org.ID, sr.Name, user.ID,
		).Scan(&roleID)
		if err != nil {
			utils.InternalError(c, err)
			return
		}
		roleIDs[sr.Name] = roleID
	}

	assignResult, err := tx.Exec(ctx,
		`INSERT INTO role_permissions (role_id, permission_id)
		 SELECT $1, id FROM permissions`,
		roleIDs["org_admin"],
	)
	if err != nil {
		utils.InternalError(c, err)
		return
	}
	if assignResult.RowsAffected() == 0 {
		utils.InternalError(c, errors.New("no base permissions available while creating org_admin role"))
		return
	}

	for _, sr := range systemRoles[1:] {
		for _, perm := range sr.Perms {
			_, err = tx.Exec(ctx,
				`INSERT INTO role_permissions
				   (role_id, permission_id)
				 SELECT $1, p.id FROM permissions p
				 JOIN resources res ON res.id = p.resource_id
				 WHERE res.name=$2 AND p.action=$3`,
				roleIDs[sr.Name], perm[0], perm[1],
			)
			if err != nil {
				utils.InternalError(c, err)
				return
			}
		}
	}

	_, err = tx.Exec(ctx,
		`INSERT INTO user_roles
		   (id, user_id, role_id, granted_by)
		 VALUES (uuid_generate_v4(),$1,$2,$1)`,
		user.ID, roleIDs["org_admin"],
	)
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

	_, _ = db.Pool.Exec(ctx,
		`INSERT INTO sessions
		   (id, user_id, token_hash, expires_at)
		 VALUES (uuid_generate_v4(),$1,$2,
		         NOW() + INTERVAL '24 hours')`,
		user.ID, tokenHash,
	)

	rows, err := db.Pool.Query(ctx,
		`SELECT DISTINCT res.name || ':' || p.action
		 FROM user_roles ur
		 JOIN role_permissions rp ON rp.role_id=ur.role_id
		 JOIN permissions p ON p.id=rp.permission_id
		 JOIN resources res ON res.id=p.resource_id
		 WHERE ur.user_id=$1`,
		user.ID,
	)
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

	c.JSON(201, gin.H{
		"data": gin.H{
			"user":        user,
			"org":         org,
			"token":       token,
			"permissions": permissions,
		},
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
		       u.job_title, u.avatar_url,
		       u.password_hash, u.status, u.is_org_owner, u.must_change_password, u.onboarding_complete, u.last_seen_at, u.created_at, u.updated_at,
		       o.id, o.name, o.slug, o.owner_id, o.contact_email, o.website, o.logo_url, o.setup_complete, o.created_at, o.updated_at
		FROM users u
		JOIN organizations o ON o.id = u.org_id
		WHERE u.email = $1
	`, req.Email).Scan(
		&user.ID, &user.OrgID, &user.Email, &user.Username, &user.DisplayName,
		&user.JobTitle, &user.AvatarURL,
		&passwordHash, &user.Status, &user.IsOrgOwner, &user.MustChangePassword, &user.OnboardingComplete, &user.LastSeenAt, &user.CreatedAt, &user.UpdatedAt,
		&org.ID, &org.Name, &org.Slug, &org.OwnerID, &org.ContactEmail, &org.Website, &org.LogoURL, &org.SetupComplete, &org.CreatedAt, &org.UpdatedAt,
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

	user, org, permissions, err := loadAuthContext(ctx, userID, orgID)
	if err != nil {
		if err == pgx.ErrNoRows {
			utils.Unauthorized(c)
			return
		}
		utils.InternalError(c, err)
		return
	}

	utils.OK(c, gin.H{
		"user":        *user,
		"org":         *org,
		"permissions": permissions,
	})
}

func CompleteOnboarding(c *gin.Context) {
	ctx := context.Background()
	userID := c.GetString("userID")
	orgID := c.GetString("orgID")
	if userID == "" || orgID == "" {
		utils.Unauthorized(c)
		return
	}

	var req completeOnboardingRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Invalid request body")
		return
	}

	req.Name = strings.TrimSpace(req.Name)
	if len(req.Name) < 2 {
		utils.BadRequest(c, "name must be at least 2 characters")
		return
	}
	if len(req.NewPassword) < 8 {
		utils.BadRequest(c, "new_password must be at least 8 characters")
		return
	}

	passwordHash, err := utils.HashPassword(req.NewPassword)
	if err != nil {
		utils.InternalError(c, err)
		return
	}

	cmd, err := db.Pool.Exec(ctx, `
		UPDATE users
		SET display_name = $1,
		    password_hash = $2,
		    must_change_password = FALSE,
		    onboarding_complete = TRUE,
		    status = 'active',
		    updated_at = NOW()
		WHERE id = $3 AND org_id = $4
	`, req.Name, passwordHash, userID, orgID)
	if err != nil {
		utils.InternalError(c, err)
		return
	}
	if cmd.RowsAffected() == 0 {
		utils.Unauthorized(c)
		return
	}

	user, org, permissions, err := loadAuthContext(ctx, userID, orgID)
	if err != nil {
		utils.InternalError(c, err)
		return
	}

	c.JSON(200, gin.H{
		"data": gin.H{
			"user":        user,
			"org":         org,
			"permissions": permissions,
		},
	})
}

func loadAuthContext(ctx context.Context, userID, orgID string) (*models.User, *models.Organization, []string, error) {
	var user models.User
	err := db.Pool.QueryRow(ctx,
		`SELECT id, org_id, email, username, display_name, job_title,
		        avatar_url, status, is_org_owner, must_change_password,
		        onboarding_complete, last_seen_at, created_at, updated_at
		 FROM users
		 WHERE id = $1 AND org_id = $2`,
		userID, orgID,
	).Scan(
		&user.ID,
		&user.OrgID,
		&user.Email,
		&user.Username,
		&user.DisplayName,
		&user.JobTitle,
		&user.AvatarURL,
		&user.Status,
		&user.IsOrgOwner,
		&user.MustChangePassword,
		&user.OnboardingComplete,
		&user.LastSeenAt,
		&user.CreatedAt,
		&user.UpdatedAt,
	)
	if err != nil {
		return nil, nil, nil, err
	}

	var org models.Organization
	err = db.Pool.QueryRow(ctx,
		`SELECT id, name, slug, owner_id, contact_email,
		        website, logo_url, setup_complete, created_at, updated_at
		 FROM organizations
		 WHERE id = $1`,
		orgID,
	).Scan(
		&org.ID,
		&org.Name,
		&org.Slug,
		&org.OwnerID,
		&org.ContactEmail,
		&org.Website,
		&org.LogoURL,
		&org.SetupComplete,
		&org.CreatedAt,
		&org.UpdatedAt,
	)
	if err != nil {
		return nil, nil, nil, err
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
		return nil, nil, nil, err
	}
	defer rows.Close()

	permissions := make([]string, 0)
	for rows.Next() {
		var perm string
		if scanErr := rows.Scan(&perm); scanErr != nil {
			return nil, nil, nil, scanErr
		}
		permissions = append(permissions, perm)
	}
	if rows.Err() != nil {
		return nil, nil, nil, rows.Err()
	}

	return &user, &org, permissions, nil
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

func isValidEmail(email string) bool {
	re := regexp.MustCompile(`^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$`)
	return re.MatchString(email)
}

func ensureBaseRBACPermissions(ctx context.Context, tx pgx.Tx) error {
	_, err := tx.Exec(ctx, `
		INSERT INTO resources (name, label)
		VALUES
			('user', 'Users'),
			('role', 'Roles'),
			('group', 'User Groups'),
			('project', 'Projects'),
			('repository', 'Repositories'),
			('pipeline', 'Pipelines'),
			('deployment', 'Deployments'),
			('org', 'Organization')
		ON CONFLICT (name) DO UPDATE SET label = EXCLUDED.label
	`)
	if err != nil {
		return err
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO permissions (resource_id, action, label)
		SELECT r.id,
		       a.action,
		       r.label || ' - ' || initcap(a.action)
		FROM resources r
		CROSS JOIN (VALUES ('create'),('read'),('update'),('delete'),('manage')) AS a(action)
		ON CONFLICT (resource_id, action) DO NOTHING
	`)

	return err
}
