package middleware

import (
	"strings"

	"github.com/devora/devora/internal/utils"
	"github.com/gin-gonic/gin"
)

func Auth() gin.HandlerFunc {
	return func(c *gin.Context) {
		tokenStr := ""
		header := c.GetHeader("Authorization")
		if strings.HasPrefix(header, "Bearer ") {
			tokenStr = strings.TrimPrefix(header, "Bearer ")
		} else {
			// EventSource cannot set Authorization headers.
			tokenStr = c.Query("token")
		}

		if tokenStr == "" {
			utils.Unauthorized(c)
			c.Abort()
			return
		}

		claims, err := utils.VerifyJWT(tokenStr)
		if err != nil {
			utils.Unauthorized(c)
			c.Abort()
			return
		}

		c.Set("userID", claims.UserID)
		c.Set("orgID", claims.OrgID)
		c.Next()
	}
}

func ClearUserPermissionCache(userID string) {
	InvalidateUserCache(userID)
}
