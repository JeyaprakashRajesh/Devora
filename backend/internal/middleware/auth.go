package middleware

import (
	"strings"

	"github.com/devora/devora/internal/utils"
	"github.com/gin-gonic/gin"
)

func Auth() gin.HandlerFunc {
	return func(c *gin.Context) {
		header := c.GetHeader("Authorization")
		if header == "" || !strings.HasPrefix(header, "Bearer ") {
			utils.Unauthorized(c)
			c.Abort()
			return
		}

		tokenStr := strings.TrimPrefix(header, "Bearer ")
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
