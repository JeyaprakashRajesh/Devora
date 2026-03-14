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

type createGroupRequest struct {
	Name        string  `json:"name"`
	Description *string `json:"description"`
}

type updateGroupRequest struct {
	Name        *string `json:"name"`
	Description *string `json:"description"`
}

type groupMemberPayload struct {
	UserID string `json:"user_id"`
}

type groupRolePayload struct {
	RoleID string `json:"role_id"`
}

type groupDetailMember struct {
	ID          string     `json:"id"`
	Email       string     `json:"email"`
	Username    string     `json:"username"`
	DisplayName *string    `json:"display_name"`
	Status      string     `json:"status"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   *time.Time `json:"updated_at,omitempty"`
}

type groupDetailRole struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	Description *string `json:"description"`
	IsSystem    bool    `json:"is_system"`
}

func ListGroups(c *gin.Context) {
	ctx := context.Background()
	orgID := c.GetString("orgID")
	if orgID == "" {
		utils.Unauthorized(c)
		return
	}

	rows, err := db.Pool.Query(ctx, `
		SELECT g.id, g.org_id, g.name, g.description, g.created_at,
		       COUNT(ugm.user_id) as member_count
		FROM user_groups g
		LEFT JOIN user_group_members ugm ON ugm.group_id = g.id
		WHERE g.org_id = $1
		GROUP BY g.id
		ORDER BY g.created_at ASC
	`, orgID)
	if err != nil {
		utils.InternalError(c, err)
		return
	}
	defer rows.Close()

	groups := make([]models.UserGroup, 0)
	for rows.Next() {
		var group models.UserGroup
		if scanErr := rows.Scan(&group.ID, &group.OrgID, &group.Name, &group.Description, &group.CreatedAt, &group.MemberCount); scanErr != nil {
			utils.InternalError(c, scanErr)
			return
		}
		groups = append(groups, group)
	}
	if rows.Err() != nil {
		utils.InternalError(c, rows.Err())
		return
	}

	utils.OK(c, groups)
}

func CreateGroup(c *gin.Context) {
	ctx := context.Background()
	orgID := c.GetString("orgID")
	actorID := c.GetString("userID")
	if orgID == "" || actorID == "" {
		utils.Unauthorized(c)
		return
	}

	var req createGroupRequest
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
		"SELECT id FROM user_groups WHERE org_id = $1 AND name = $2",
		orgID, req.Name,
	).Scan(&existingID)
	if err == nil {
		utils.Conflict(c, "Group name already exists")
		return
	}
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		utils.InternalError(c, err)
		return
	}

	var group models.UserGroup
	err = db.Pool.QueryRow(ctx, `
		INSERT INTO user_groups (org_id, name, description, created_by)
		VALUES ($1, $2, $3, $4)
		RETURNING id, org_id, name, description, created_at
	`, orgID, req.Name, req.Description, actorID).Scan(
		&group.ID,
		&group.OrgID,
		&group.Name,
		&group.Description,
		&group.CreatedAt,
	)
	if err != nil {
		utils.InternalError(c, err)
		return
	}

	if err = writeAuditLog(ctx, orgID, actorID, "group.created", "group", group.ID, map[string]interface{}{
		"name": group.Name,
	}); err != nil {
		utils.InternalError(c, err)
		return
	}

	utils.Created(c, group)
}

func GetGroup(c *gin.Context) {
	ctx := context.Background()
	orgID := c.GetString("orgID")
	if orgID == "" {
		utils.Unauthorized(c)
		return
	}

	groupID := c.Param("id")
	group, err := loadGroupForOrg(ctx, groupID, orgID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			utils.NotFound(c, "Group not found")
			return
		}
		utils.InternalError(c, err)
		return
	}

	members, err := listMembersByGroupID(ctx, groupID)
	if err != nil {
		utils.InternalError(c, err)
		return
	}

	roles, err := listRolesByGroupID(ctx, groupID)
	if err != nil {
		utils.InternalError(c, err)
		return
	}

	utils.OK(c, gin.H{
		"id":           group.ID,
		"org_id":       group.OrgID,
		"name":         group.Name,
		"description":  group.Description,
		"created_at":   group.CreatedAt,
		"members":      members,
		"roles":        roles,
		"member_count": len(members),
	})
}

func UpdateGroup(c *gin.Context) {
	ctx := context.Background()
	orgID := c.GetString("orgID")
	actorID := c.GetString("userID")
	if orgID == "" || actorID == "" {
		utils.Unauthorized(c)
		return
	}

	groupID := c.Param("id")
	group, err := loadGroupForOrg(ctx, groupID, orgID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			utils.NotFound(c, "Group not found")
			return
		}
		utils.InternalError(c, err)
		return
	}

	var req updateGroupRequest
	if err = c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Invalid request body")
		return
	}

	if req.Name == nil && req.Description == nil {
		utils.BadRequest(c, "No updatable fields provided")
		return
	}

	name := group.Name
	if req.Name != nil {
		trimmed := strings.TrimSpace(*req.Name)
		if trimmed == "" {
			utils.BadRequest(c, "name cannot be empty")
			return
		}

		var existingID string
		checkErr := db.Pool.QueryRow(ctx,
			"SELECT id FROM user_groups WHERE org_id = $1 AND name = $2 AND id <> $3",
			orgID, trimmed, groupID,
		).Scan(&existingID)
		if checkErr == nil {
			utils.Conflict(c, "Group name already exists")
			return
		}
		if checkErr != nil && !errors.Is(checkErr, pgx.ErrNoRows) {
			utils.InternalError(c, checkErr)
			return
		}

		name = trimmed
	}

	description := group.Description
	if req.Description != nil {
		description = req.Description
	}

	err = db.Pool.QueryRow(ctx, `
		UPDATE user_groups
		SET name = $1, description = $2
		WHERE id = $3 AND org_id = $4
		RETURNING id, org_id, name, description, created_at
	`, name, description, groupID, orgID).Scan(
		&group.ID,
		&group.OrgID,
		&group.Name,
		&group.Description,
		&group.CreatedAt,
	)
	if err != nil {
		utils.InternalError(c, err)
		return
	}

	if err = writeAuditLog(ctx, orgID, actorID, "group.updated", "group", groupID, map[string]interface{}{
		"name": group.Name,
	}); err != nil {
		utils.InternalError(c, err)
		return
	}

	utils.OK(c, group)
}

func DeleteGroup(c *gin.Context) {
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

	memberIDs, err := listMemberIDsByGroupID(ctx, groupID)
	if err != nil {
		utils.InternalError(c, err)
		return
	}

	roleIDs, err := listRoleIDsByGroupID(ctx, groupID)
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

	for _, memberID := range memberIDs {
		for _, roleID := range roleIDs {
			if _, err = tx.Exec(ctx, `
				DELETE FROM user_roles ur
				WHERE ur.user_id = $1
				  AND ur.role_id = $2
				  AND ur.granted_by IS NULL
				  AND ur.resource_type IS NULL
				  AND ur.resource_id IS NULL
				  AND NOT EXISTS (
					  SELECT 1 FROM user_group_members ugm2
					  JOIN group_roles gr2 ON gr2.group_id = ugm2.group_id
					  WHERE ugm2.user_id = $1
					    AND gr2.role_id = $2
					    AND ugm2.group_id <> $3
				  )
			`, memberID, roleID, groupID); err != nil {
				utils.InternalError(c, err)
				return
			}
		}
	}

	if _, err = tx.Exec(ctx, "DELETE FROM group_roles WHERE group_id = $1", groupID); err != nil {
		utils.InternalError(c, err)
		return
	}

	if _, err = tx.Exec(ctx, "DELETE FROM user_group_members WHERE group_id = $1", groupID); err != nil {
		utils.InternalError(c, err)
		return
	}

	if _, err = tx.Exec(ctx, "DELETE FROM user_groups WHERE id = $1 AND org_id = $2", groupID, orgID); err != nil {
		utils.InternalError(c, err)
		return
	}

	if err = tx.Commit(ctx); err != nil {
		utils.InternalError(c, err)
		return
	}

	for _, memberID := range memberIDs {
		middleware.ClearUserPermissionCache(memberID)
	}

	if err = writeAuditLog(ctx, orgID, actorID, "group.deleted", "group", groupID, nil); err != nil {
		utils.InternalError(c, err)
		return
	}

	utils.OK(c, gin.H{"message": "Group deleted"})
}

func ListGroupMembers(c *gin.Context) {
	ctx := context.Background()
	orgID := c.GetString("orgID")
	if orgID == "" {
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

	rows, err := db.Pool.Query(ctx, `
		SELECT u.id, u.email, u.username, u.display_name, u.status, u.created_at, u.updated_at
		FROM user_group_members ugm
		JOIN users u ON u.id = ugm.user_id
		WHERE ugm.group_id = $1
		ORDER BY u.username ASC
	`, groupID)
	if err != nil {
		utils.InternalError(c, err)
		return
	}
	defer rows.Close()

	members := make([]groupDetailMember, 0)
	for rows.Next() {
		var member groupDetailMember
		if scanErr := rows.Scan(
			&member.ID,
			&member.Email,
			&member.Username,
			&member.DisplayName,
			&member.Status,
			&member.CreatedAt,
			&member.UpdatedAt,
		); scanErr != nil {
			utils.InternalError(c, scanErr)
			return
		}
		members = append(members, member)
	}
	if rows.Err() != nil {
		utils.InternalError(c, rows.Err())
		return
	}

	utils.OK(c, members)
}

func AddGroupMember(c *gin.Context) {
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

	var req groupMemberPayload
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

	var alreadyMember bool
	err := db.Pool.QueryRow(ctx,
		"SELECT EXISTS(SELECT 1 FROM user_group_members WHERE group_id = $1 AND user_id = $2)",
		groupID, req.UserID,
	).Scan(&alreadyMember)
	if err != nil {
		utils.InternalError(c, err)
		return
	}
	if alreadyMember {
		utils.Conflict(c, "User already in group")
		return
	}

	roleIDs, err := listRoleIDsByGroupID(ctx, groupID)
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

	if _, err = tx.Exec(ctx,
		"INSERT INTO user_group_members (group_id, user_id) VALUES ($1, $2)",
		groupID, req.UserID,
	); err != nil {
		utils.InternalError(c, err)
		return
	}

	for _, roleID := range roleIDs {
		if _, err = tx.Exec(ctx, `
			INSERT INTO user_roles (user_id, role_id, granted_by, resource_type, resource_id)
			VALUES ($1, $2, NULL, NULL, NULL)
			ON CONFLICT DO NOTHING
		`, req.UserID, roleID); err != nil {
			utils.InternalError(c, err)
			return
		}
	}

	if err = tx.Commit(ctx); err != nil {
		utils.InternalError(c, err)
		return
	}

	middleware.ClearUserPermissionCache(req.UserID)

	if err = writeAuditLog(ctx, orgID, actorID, "group.member_added", "group", groupID, map[string]interface{}{
		"group_id": groupID,
		"user_id":  req.UserID,
	}); err != nil {
		utils.InternalError(c, err)
		return
	}

	utils.Created(c, gin.H{"message": "User added to group"})
}

func RemoveGroupMember(c *gin.Context) {
	ctx := context.Background()
	orgID := c.GetString("orgID")
	actorID := c.GetString("userID")
	if orgID == "" || actorID == "" {
		utils.Unauthorized(c)
		return
	}

	groupID := c.Param("id")
	userID := c.Param("userId")

	if _, err := ensureGroupInOrg(ctx, groupID, orgID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			utils.NotFound(c, "Group not found")
			return
		}
		utils.InternalError(c, err)
		return
	}

	var memberExists bool
	err := db.Pool.QueryRow(ctx,
		"SELECT EXISTS(SELECT 1 FROM user_group_members WHERE group_id = $1 AND user_id = $2)",
		groupID, userID,
	).Scan(&memberExists)
	if err != nil {
		utils.InternalError(c, err)
		return
	}
	if !memberExists {
		utils.NotFound(c, "User is not a member of this group")
		return
	}

	roleIDs, err := listRoleIDsByGroupID(ctx, groupID)
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

	if _, err = tx.Exec(ctx,
		"DELETE FROM user_group_members WHERE group_id = $1 AND user_id = $2",
		groupID, userID,
	); err != nil {
		utils.InternalError(c, err)
		return
	}

	for _, roleID := range roleIDs {
		if _, err = tx.Exec(ctx, `
			DELETE FROM user_roles ur
			WHERE ur.user_id = $1
			  AND ur.role_id = $2
			  AND ur.granted_by IS NULL
			  AND ur.resource_type IS NULL
			  AND ur.resource_id IS NULL
			  AND NOT EXISTS (
				  SELECT 1 FROM user_group_members ugm2
				  JOIN group_roles gr2 ON gr2.group_id = ugm2.group_id
				  WHERE ugm2.user_id = $1
				    AND gr2.role_id = $2
				    AND ugm2.group_id <> $3
			  )
		`, userID, roleID, groupID); err != nil {
			utils.InternalError(c, err)
			return
		}
	}

	if err = tx.Commit(ctx); err != nil {
		utils.InternalError(c, err)
		return
	}

	middleware.ClearUserPermissionCache(userID)

	if err = writeAuditLog(ctx, orgID, actorID, "group.member_removed", "group", groupID, map[string]interface{}{
		"group_id": groupID,
		"user_id":  userID,
	}); err != nil {
		utils.InternalError(c, err)
		return
	}

	utils.OK(c, gin.H{"message": "User removed from group"})
}

func AssignGroupRole(c *gin.Context) {
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

	var req groupRolePayload
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Invalid request body")
		return
	}
	req.RoleID = strings.TrimSpace(req.RoleID)
	if req.RoleID == "" {
		utils.BadRequest(c, "role_id is required")
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

	var alreadyAssigned bool
	err := db.Pool.QueryRow(ctx,
		"SELECT EXISTS(SELECT 1 FROM group_roles WHERE group_id = $1 AND role_id = $2)",
		groupID, req.RoleID,
	).Scan(&alreadyAssigned)
	if err != nil {
		utils.InternalError(c, err)
		return
	}
	if alreadyAssigned {
		utils.Conflict(c, "Role already assigned to group")
		return
	}

	memberIDs, err := listMemberIDsByGroupID(ctx, groupID)
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

	if _, err = tx.Exec(ctx,
		"INSERT INTO group_roles (group_id, role_id) VALUES ($1, $2)",
		groupID, req.RoleID,
	); err != nil {
		utils.InternalError(c, err)
		return
	}

	for _, memberID := range memberIDs {
		if _, err = tx.Exec(ctx, `
			INSERT INTO user_roles (user_id, role_id, granted_by)
			VALUES ($1, $2, NULL)
			ON CONFLICT DO NOTHING
		`, memberID, req.RoleID); err != nil {
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

	if err = writeAuditLog(ctx, orgID, actorID, "group.role_assigned", "group", groupID, map[string]interface{}{
		"group_id": groupID,
		"role_id":  req.RoleID,
	}); err != nil {
		utils.InternalError(c, err)
		return
	}

	utils.Created(c, gin.H{"message": "Role assigned to group"})
}

func RemoveGroupRole(c *gin.Context) {
	ctx := context.Background()
	orgID := c.GetString("orgID")
	actorID := c.GetString("userID")
	if orgID == "" || actorID == "" {
		utils.Unauthorized(c)
		return
	}

	groupID := c.Param("id")
	roleID := c.Param("roleId")

	if _, err := ensureGroupInOrg(ctx, groupID, orgID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			utils.NotFound(c, "Group not found")
			return
		}
		utils.InternalError(c, err)
		return
	}

	var assigned bool
	err := db.Pool.QueryRow(ctx,
		"SELECT EXISTS(SELECT 1 FROM group_roles WHERE group_id = $1 AND role_id = $2)",
		groupID, roleID,
	).Scan(&assigned)
	if err != nil {
		utils.InternalError(c, err)
		return
	}
	if !assigned {
		utils.NotFound(c, "Role not assigned to this group")
		return
	}

	memberIDs, err := listMemberIDsByGroupID(ctx, groupID)
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

	if _, err = tx.Exec(ctx,
		"DELETE FROM group_roles WHERE group_id = $1 AND role_id = $2",
		groupID, roleID,
	); err != nil {
		utils.InternalError(c, err)
		return
	}

	for _, memberID := range memberIDs {
		if _, err = tx.Exec(ctx, `
			DELETE FROM user_roles ur
			WHERE ur.user_id = $1
			  AND ur.role_id = $2
			  AND ur.granted_by IS NULL
			  AND ur.resource_type IS NULL
			  AND ur.resource_id IS NULL
			  AND NOT EXISTS (
				  SELECT 1 FROM user_group_members ugm
				  JOIN group_roles gr ON gr.group_id = ugm.group_id
				  WHERE ugm.user_id = $1
				    AND gr.role_id = $2
				    AND ugm.group_id <> $3
			  )
		`, memberID, roleID, groupID); err != nil {
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

	if err = writeAuditLog(ctx, orgID, actorID, "group.role_removed", "group", groupID, map[string]interface{}{
		"group_id": groupID,
		"role_id":  roleID,
	}); err != nil {
		utils.InternalError(c, err)
		return
	}

	utils.OK(c, gin.H{"message": "Role removed from group"})
}

func loadGroupForOrg(ctx context.Context, groupID, orgID string) (*models.UserGroup, error) {
	var group models.UserGroup
	err := db.Pool.QueryRow(ctx, `
		SELECT id, org_id, name, description, created_at
		FROM user_groups
		WHERE id = $1 AND org_id = $2
	`, groupID, orgID).Scan(
		&group.ID,
		&group.OrgID,
		&group.Name,
		&group.Description,
		&group.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &group, nil
}

func ensureGroupInOrg(ctx context.Context, groupID, orgID string) (string, error) {
	var id string
	err := db.Pool.QueryRow(ctx,
		"SELECT id FROM user_groups WHERE id = $1 AND org_id = $2",
		groupID, orgID,
	).Scan(&id)
	if err != nil {
		return "", err
	}
	return id, nil
}

func listMemberIDsByGroupID(ctx context.Context, groupID string) ([]string, error) {
	rows, err := db.Pool.Query(ctx,
		"SELECT user_id FROM user_group_members WHERE group_id = $1",
		groupID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	memberIDs := make([]string, 0)
	for rows.Next() {
		var userID string
		if scanErr := rows.Scan(&userID); scanErr != nil {
			return nil, scanErr
		}
		memberIDs = append(memberIDs, userID)
	}

	if rows.Err() != nil {
		return nil, rows.Err()
	}

	return memberIDs, nil
}

func listRoleIDsByGroupID(ctx context.Context, groupID string) ([]string, error) {
	rows, err := db.Pool.Query(ctx,
		"SELECT role_id FROM group_roles WHERE group_id = $1",
		groupID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	roleIDs := make([]string, 0)
	for rows.Next() {
		var roleID string
		if scanErr := rows.Scan(&roleID); scanErr != nil {
			return nil, scanErr
		}
		roleIDs = append(roleIDs, roleID)
	}

	if rows.Err() != nil {
		return nil, rows.Err()
	}

	return roleIDs, nil
}

func listMembersByGroupID(ctx context.Context, groupID string) ([]groupDetailMember, error) {
	rows, err := db.Pool.Query(ctx, `
		SELECT u.id, u.email, u.username, u.display_name, u.status, u.created_at, u.updated_at
		FROM user_group_members ugm
		JOIN users u ON u.id = ugm.user_id
		WHERE ugm.group_id = $1
		ORDER BY ugm.user_id
	`, groupID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	members := make([]groupDetailMember, 0)
	for rows.Next() {
		var member groupDetailMember
		if scanErr := rows.Scan(
			&member.ID,
			&member.Email,
			&member.Username,
			&member.DisplayName,
			&member.Status,
			&member.CreatedAt,
			&member.UpdatedAt,
		); scanErr != nil {
			return nil, scanErr
		}
		members = append(members, member)
	}

	if rows.Err() != nil {
		return nil, rows.Err()
	}

	return members, nil
}

func listRolesByGroupID(ctx context.Context, groupID string) ([]groupDetailRole, error) {
	rows, err := db.Pool.Query(ctx, `
		SELECT r.id, r.name, r.description, r.is_system
		FROM group_roles gr
		JOIN roles r ON r.id = gr.role_id
		WHERE gr.group_id = $1
	`, groupID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	roles := make([]groupDetailRole, 0)
	for rows.Next() {
		var role groupDetailRole
		if scanErr := rows.Scan(&role.ID, &role.Name, &role.Description, &role.IsSystem); scanErr != nil {
			return nil, scanErr
		}
		roles = append(roles, role)
	}

	if rows.Err() != nil {
		return nil, rows.Err()
	}

	return roles, nil
}
