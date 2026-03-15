package middleware

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/devora/devora/internal/db"
	"github.com/devora/devora/internal/utils"
	"github.com/gin-gonic/gin"
)

type cacheEntry struct {
	allowed   bool
	expiresAt time.Time
}

var permCache sync.Map

func cacheGet(key string) (bool, bool) {
	val, ok := permCache.Load(key)
	if !ok {
		return false, false
	}

	entry := val.(cacheEntry)
	if time.Now().After(entry.expiresAt) {
		permCache.Delete(key)
		return false, false
	}

	return entry.allowed, true
}

func cacheSet(key string, allowed bool) {
	permCache.Store(key, cacheEntry{
		allowed:   allowed,
		expiresAt: time.Now().Add(30 * time.Second),
	})
}

func InvalidateUserCache(userID string) {
	permCache.Range(func(key, _ interface{}) bool {
		if len(key.(string)) > len(userID) &&
			key.(string)[:len(userID)] == userID {
			permCache.Delete(key)
		}
		return true
	})
}

func RequirePermission(resource, action string) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, exists := c.Get("userID")
		if !exists {
			utils.Unauthorized(c)
			c.Abort()
			return
		}

		uid := userID.(string)

		var isOrgOwner bool
		ownerErr := db.Pool.QueryRow(
			context.Background(),
			`SELECT is_org_owner FROM users WHERE id = $1`,
			uid,
		).Scan(&isOrgOwner)
		if ownerErr != nil {
			utils.InternalError(c, ownerErr)
			c.Abort()
			return
		}
		if isOrgOwner {
			c.Next()
			return
		}

		projectScopeID := ""
		if rid := strings.TrimSpace(c.Param("id")); rid != "" {
			switch resource {
			case "project", "repository", "pipeline":
				projectScopeID = rid
			}
		}

		cacheKey := fmt.Sprintf("%s:%s:%s:%s", uid, resource, action, projectScopeID)

		if allowed, found := cacheGet(cacheKey); found {
			if !allowed {
				utils.Forbidden(c)
				c.Abort()
				return
			}
			c.Next()
			return
		}

		var count int
		err := db.Pool.QueryRow(
			context.Background(),
			`SELECT COUNT(*) FROM user_roles ur
			 JOIN role_permissions rp ON rp.role_id = ur.role_id
			 JOIN permissions p ON p.id = rp.permission_id
			 JOIN resources res ON res.id = p.resource_id
			 WHERE ur.user_id = $1
			   AND res.name = $2
			   AND (p.action = $3 OR p.action = 'manage')
			   AND (
				 (ur.resource_type IS NULL AND ur.resource_id IS NULL)
				 OR ($4 <> '' AND ur.resource_type = 'project' AND ur.resource_id::text = $4)
			   )
			   AND (ur.expires_at IS NULL OR ur.expires_at > NOW())`,
			uid, resource, action, projectScopeID,
		).Scan(&count)

		if err != nil {
			utils.InternalError(c, err)
			c.Abort()
			return
		}

		allowed := count > 0
		cacheSet(cacheKey, allowed)

		if !allowed {
			utils.Forbidden(c)
			c.Abort()
			return
		}

		c.Next()
	}
}

// CheckProjectAccess checks if a user can access a project at the given level.
// level: read | write | full.
func CheckProjectAccess(userID, projectID, level string) (bool, error) {
	accessLevels := map[string]int{
		"read":  1,
		"write": 2,
		"full":  3,
	}

	requiredLevel, ok := accessLevels[level]
	if !ok {
		return false, nil
	}

	query := `
		SELECT MAX(
			CASE pp.access_level
				WHEN 'read' THEN 1
				WHEN 'write' THEN 2
				WHEN 'full' THEN 3
				ELSE 0
			END
		)
		FROM project_permissions pp
		WHERE pp.org_id = (
			SELECT org_id FROM users WHERE id = $1
		)
		AND (pp.project_id = $2 OR pp.project_id IS NULL)
		AND (
			EXISTS (
				SELECT 1 FROM user_permissions up
				WHERE up.user_id = $1
				  AND up.permission_id = pp.id
			)
			OR EXISTS (
				SELECT 1
				FROM user_group_members ugm
				JOIN group_permissions gp ON gp.group_id = ugm.group_id
				WHERE ugm.user_id = $1
				  AND gp.permission_id = pp.id
			)
		)
	`

	var maxLevel *int
	err := db.Pool.QueryRow(context.Background(), query, userID, projectID).Scan(&maxLevel)
	if err != nil {
		return false, err
	}
	if maxLevel == nil {
		return false, nil
	}

	return *maxLevel >= requiredLevel, nil
}
