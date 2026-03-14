package main

import (
	"log"
	"os"

	"github.com/gin-contrib/cors"
	"github.com/devora/devora/internal/db"
	"github.com/devora/devora/internal/gitea"
	"github.com/devora/devora/internal/handlers"
	"github.com/devora/devora/internal/middleware"
	"github.com/gin-gonic/gin"
)

func main() {
	db.Connect()
	gitea.Init()
	log.Println("Gitea client initialized")

	r := gin.Default()
	r.Use(cors.New(cors.Config{
		AllowOrigins:     []string{os.Getenv("FRONTEND_URL")},
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
		AllowCredentials: true,
	}))

	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})

	api := r.Group("/api")
	auth := api.Group("/auth")
	auth.POST("/register", handlers.Register)
	auth.POST("/login", handlers.Login)
	auth.POST("/logout", middleware.Auth(), handlers.Logout)
	auth.GET("/me", middleware.Auth(), handlers.Me)

	users := api.Group("/users", middleware.Auth())
	users.GET("", middleware.RequirePermission("user", "read"), handlers.ListUsers)
	users.POST("/invite", middleware.RequirePermission("user", "create"), handlers.InviteUser)
	users.GET("/:id", middleware.RequirePermission("user", "read"), handlers.GetUser)
	users.PATCH("/:id", middleware.RequirePermission("user", "update"), handlers.UpdateUser)
	users.DELETE("/:id", middleware.RequirePermission("user", "delete"), handlers.DeleteUser)
	users.GET("/:id/roles", handlers.GetUserRoles)
	users.POST("/:id/roles", middleware.RequirePermission("role", "manage"), handlers.AssignRole)
	users.DELETE("/:id/roles/:roleId", middleware.RequirePermission("role", "manage"), handlers.RevokeRole)

	roles := api.Group("/roles", middleware.Auth())
	roles.GET("", middleware.RequirePermission("role", "read"), handlers.ListRoles)
	roles.POST("", middleware.RequirePermission("role", "create"), handlers.CreateRole)
	roles.GET("/:id", middleware.RequirePermission("role", "read"), handlers.GetRole)
	roles.PATCH("/:id", middleware.RequirePermission("role", "update"), handlers.UpdateRole)
	roles.DELETE("/:id", middleware.RequirePermission("role", "delete"), handlers.DeleteRole)
	roles.GET("/:id/permissions", middleware.RequirePermission("role", "read"), handlers.GetRolePermissions)
	roles.PUT("/:id/permissions", middleware.RequirePermission("role", "update"), handlers.SetRolePermissions)
	roles.PATCH("/:id/permissions/:permId", middleware.RequirePermission("role", "update"), handlers.TogglePermission)

	groups := api.Group("/groups", middleware.Auth())
	groups.GET("", middleware.RequirePermission("group", "read"), handlers.ListGroups)
	groups.POST("", middleware.RequirePermission("group", "create"), handlers.CreateGroup)
	groups.GET("/:id", middleware.RequirePermission("group", "read"), handlers.GetGroup)
	groups.PATCH("/:id", middleware.RequirePermission("group", "update"), handlers.UpdateGroup)
	groups.DELETE("/:id", middleware.RequirePermission("group", "delete"), handlers.DeleteGroup)
	groups.GET("/:id/members", handlers.ListGroupMembers)
	groups.POST("/:id/members", middleware.RequirePermission("group", "manage"), handlers.AddGroupMember)
	groups.DELETE("/:id/members/:userId", middleware.RequirePermission("group", "manage"), handlers.RemoveGroupMember)
	groups.POST("/:id/roles", middleware.RequirePermission("role", "manage"), handlers.AssignGroupRole)
	groups.DELETE("/:id/roles/:roleId", middleware.RequirePermission("role", "manage"), handlers.RemoveGroupRole)

	api.GET("/permissions", middleware.Auth(), handlers.ListAllPermissions)

	projects := api.Group("/projects", middleware.Auth())
	projects.POST("", middleware.RequirePermission("project", "create"), handlers.CreateProject)
	projects.GET("", middleware.RequirePermission("project", "read"), handlers.ListProjects)
	projects.GET("/:id", middleware.RequirePermission("project", "read"), handlers.GetProject)
	projects.PATCH("/:id", middleware.RequirePermission("project", "update"), handlers.UpdateProject)
	projects.POST("/:id/archive", middleware.RequirePermission("project", "update"), handlers.ArchiveProject)
	projects.DELETE("/:id", middleware.RequirePermission("project", "delete"), handlers.DeleteProject)
	projects.GET("/:id/members", handlers.ListProjectMembers)
	projects.POST("/:id/members", middleware.RequirePermission("project", "manage"), handlers.AddProjectMember)
	projects.DELETE("/:id/members/:userId", middleware.RequirePermission("project", "manage"), handlers.RemoveProjectMember)
	projects.POST("/:id/groups", middleware.RequirePermission("project", "manage"), handlers.AddProjectGroup)
	projects.DELETE("/:id/groups/:groupId", middleware.RequirePermission("project", "manage"), handlers.RemoveProjectGroup)

	api.Any("/deploy/*path", middleware.Auth(), func(c *gin.Context) { c.JSON(501, gin.H{"error": "not implemented"}) })
	api.Any("/internal/*path", func(c *gin.Context) { c.JSON(501, gin.H{"error": "not implemented"}) })

	port := os.Getenv("PORT")
	if port == "" {
		port = "4000"
	}

	log.Fatal(r.Run(":" + port))
}
