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
	auth.POST("/onboarding", middleware.Auth(), handlers.CompleteOnboarding)

	users := api.Group("/users", middleware.Auth())
	users.GET("", middleware.RequirePermission("user", "read"), handlers.ListUsers)
	users.POST("/invite", middleware.RequirePermission("user", "create"), handlers.InviteUser)
	users.GET("/:id", middleware.RequirePermission("user", "read"), handlers.GetUser)
	users.PATCH("/:id", middleware.RequirePermission("user", "update"), handlers.UpdateUser)
	users.DELETE("/:id", middleware.RequirePermission("user", "delete"), handlers.DeleteUser)
	users.GET("/:id/roles", handlers.GetUserRoles)
	users.POST("/:id/roles", middleware.RequirePermission("role", "manage"), handlers.AssignRole)
	users.DELETE("/:id/roles/:roleId", middleware.RequirePermission("role", "manage"), handlers.RevokeRole)
	users.GET("/:id/effective-permissions", handlers.GetUserEffectivePermissions)
	users.POST("/:id/permissions", middleware.RequirePermission("org", "manage"), handlers.AssignPermissionToUser)
	users.DELETE("/:id/permissions/:permissionId", middleware.RequirePermission("org", "manage"), handlers.RemovePermissionFromUser)

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
	groups.POST("/:id/permissions", middleware.RequirePermission("org", "manage"), handlers.AssignPermissionToGroup)
	groups.DELETE("/:id/permissions/:permissionId", middleware.RequirePermission("org", "manage"), handlers.RemovePermissionFromGroup)

	api.GET("/permissions", middleware.Auth(), handlers.ListAllPermissions)

	perms := api.Group("/permissions", middleware.Auth())
	perms.GET("/project", middleware.RequirePermission("org", "read"), handlers.ListPermissions)
	perms.POST("/project", middleware.RequirePermission("org", "manage"), handlers.CreatePermission)
	perms.PATCH("/project/:id", middleware.RequirePermission("org", "manage"), handlers.UpdatePermission)
	perms.DELETE("/project/:id", middleware.RequirePermission("org", "manage"), handlers.DeletePermission)

	projects := api.Group("/projects", middleware.Auth())
	projects.POST("", middleware.RequirePermission("project", "create"), handlers.CreateProject)
	projects.GET("", middleware.RequirePermission("project", "read"), handlers.ListProjects)
	projects.GET("/:id", middleware.RequirePermission("project", "read"), handlers.GetProject)
	projects.PATCH("/:id", middleware.RequirePermission("project", "update"), handlers.UpdateProject)
	projects.POST("/:id/archive", middleware.RequirePermission("project", "update"), handlers.ArchiveProject)
	projects.DELETE("/:id", middleware.RequirePermission("project", "delete"), handlers.DeleteProject)
	projects.GET("/:id/members", handlers.ListProjectMembers)
	projects.GET("/:id/groups", handlers.ListProjectGroups)
	projects.GET("/:id/activity", handlers.ListProjectActivity)
	projects.GET("/:id/branches", handlers.ListBranches)
	projects.POST("/:id/members", middleware.RequirePermission("project", "manage"), handlers.AddProjectMember)
	projects.DELETE("/:id/members/:userId", middleware.RequirePermission("project", "manage"), handlers.RemoveProjectMember)
	projects.POST("/:id/groups", middleware.RequirePermission("project", "manage"), handlers.AddProjectGroup)
	projects.DELETE("/:id/groups/:groupId", middleware.RequirePermission("project", "manage"), handlers.RemoveProjectGroup)

	// Issues — nested under projects
	projects.POST("/:id/issues", handlers.CreateIssue)
	projects.GET("/:id/issues", handlers.ListIssues)
	projects.GET("/:id/issues/:number", handlers.GetIssue)
	projects.PATCH("/:id/issues/:number", handlers.UpdateIssue)
	projects.POST("/:id/issues/:number/close", handlers.CloseIssue)
	projects.POST("/:id/issues/:number/reopen", handlers.ReopenIssue)
	projects.POST("/:id/issues/:number/comments", handlers.AddIssueComment)
	projects.GET("/:id/issues/:number/comments", handlers.ListIssueComments)

	// Merge Requests — nested under projects
	projects.POST("/:id/mrs", middleware.RequirePermission("repository", "create"), handlers.CreateMR)
	projects.GET("/:id/mrs", handlers.ListMRs)
	projects.GET("/:id/mrs/:number", handlers.GetMR)
	projects.GET("/:id/mrs/:number/diff", handlers.GetMRDiff)
	projects.POST("/:id/mrs/:number/merge", middleware.RequirePermission("repository", "manage"), handlers.MergeMR)
	projects.POST("/:id/mrs/:number/close", middleware.RequirePermission("repository", "update"), handlers.CloseMR)
	projects.POST("/:id/mrs/:number/comments", handlers.AddMRComment)
	projects.GET("/:id/mrs/:number/comments", handlers.ListMRComments)

	// Pipelines — nested under projects
	projects.POST("/:id/pipelines", middleware.RequirePermission("pipeline", "create"), handlers.CreatePipeline)
	projects.GET("/:id/pipelines", handlers.ListPipelines)
	projects.GET("/:id/pipelines/:pid", handlers.GetPipeline)
	projects.DELETE("/:id/pipelines/:pid", middleware.RequirePermission("pipeline", "delete"), handlers.DeletePipeline)
	projects.GET("/:id/pipelines/:pid/runs", handlers.ListRuns)
	projects.POST("/:id/pipelines/:pid/trigger", middleware.RequirePermission("pipeline", "create"), handlers.TriggerPipeline)
	projects.GET("/:id/runs/:runId", handlers.GetRun)
	projects.POST("/:id/runs/:runId/cancel", handlers.CancelRun)
	projects.GET("/:id/runs/:runId/jobs/:jobId/logs", handlers.StreamJobLogs)

	deploy := api.Group("/deploy", middleware.Auth())
	deploy.GET("/containers",
		middleware.RequirePermission("deployment", "read"),
		handlers.ListContainers)
	deploy.POST("/containers",
		middleware.RequirePermission("deployment", "create"),
		handlers.CreateContainer)
	deploy.GET("/containers/:id",
		middleware.RequirePermission("deployment", "read"),
		handlers.GetContainer)
	deploy.POST("/containers/:id/start",
		middleware.RequirePermission("deployment", "update"),
		handlers.StartContainer)
	deploy.POST("/containers/:id/stop",
		middleware.RequirePermission("deployment", "update"),
		handlers.StopContainer)
	deploy.DELETE("/containers/:id",
		middleware.RequirePermission("deployment", "delete"),
		handlers.DeleteContainer)
	deploy.GET("/containers/:id/logs",
		middleware.RequirePermission("deployment", "read"),
		handlers.StreamContainerLogs)
	deploy.POST("/containers/:id/assign",
		middleware.RequirePermission("deployment", "manage"),
		handlers.AssignContainer)

	workspaces := api.Group("/workspaces", middleware.Auth())
	workspaces.POST("", handlers.OpenWorkspace)
	workspaces.GET("/:id", handlers.GetWorkspace)
	workspaces.GET("/:id/status", handlers.GetWorkspaceStatus)
	workspaces.POST("/:id/commit", handlers.CommitWorkspace)
	workspaces.DELETE("/:id", handlers.DeleteWorkspace)

	// Gitea webhook — no auth, internal only
	api.POST("/internal/webhook", handlers.GiteaWebhook)

	port := os.Getenv("PORT")
	if port == "" {
		port = "4000"
	}

	log.Fatal(r.Run(":" + port))
}
