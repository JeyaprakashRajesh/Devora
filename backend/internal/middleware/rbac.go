package middleware

import (
	"context"
	"fmt"
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
		cacheKey := fmt.Sprintf("%s:%s:%s", uid, resource, action)

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
			   AND (ur.expires_at IS NULL OR ur.expires_at > NOW())`,
			uid, resource, action,
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
