package handlers

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/devora/devora/internal/activity"
	"github.com/devora/devora/internal/db"
	"github.com/devora/devora/internal/middleware"
	"github.com/devora/devora/internal/models"
	"github.com/devora/devora/internal/utils"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// verifyProjectAccess fetches the project by id+orgID and checks that
// the calling user is either a direct project member or holds an
// org-wide project:read/manage permission.
func verifyProjectAccess(c *gin.Context) (*models.Project, bool) {
	ctx := context.Background()
	orgID := c.GetString("orgID")
	userID := c.GetString("userID")
	projectID := c.Param("id")

	var project models.Project
	err := db.Pool.QueryRow(ctx,
		`SELECT id, org_id, name, slug, gitea_repo_id,
		        gitea_clone_url, default_branch, created_by
		 FROM projects
		 WHERE id=$1 AND org_id=$2 AND archived_at IS NULL`,
		projectID, orgID,
	).Scan(
		&project.ID, &project.OrgID, &project.Name,
		&project.Slug, &project.GiteaRepoID,
		&project.GiteaCloneURL, &project.DefaultBranch,
		&project.CreatedBy,
	)
	if err != nil {
		utils.NotFound(c, "Project not found")
		return nil, false
	}

	// Org admins keep access via existing role system.
	var isAdmin int
	db.Pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM user_roles ur
		 JOIN role_permissions rp ON rp.role_id = ur.role_id
		 JOIN permissions p ON p.id = rp.permission_id
		 JOIN resources res ON res.id = p.resource_id
		 WHERE ur.user_id = $1
		   AND res.name = 'org'
		   AND p.action IN ('manage', 'read')
		   AND ur.resource_type IS NULL
		   AND (ur.expires_at IS NULL OR ur.expires_at > NOW())`,
		userID,
	).Scan(&isAdmin)
	if isAdmin > 0 {
		return &project, true
	}

	var hasProjectRole int
	db.Pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM user_roles ur
		 JOIN role_permissions rp ON rp.role_id = ur.role_id
		 JOIN permissions p ON p.id = rp.permission_id
		 JOIN resources res ON res.id = p.resource_id
		 WHERE ur.user_id = $1
		   AND res.name = 'project'
		   AND p.action IN ('manage', 'read')
		   AND (
			 (ur.resource_type IS NULL AND ur.resource_id IS NULL)
			 OR (ur.resource_type = 'project' AND ur.resource_id::text = $2)
		   )
		   AND (ur.expires_at IS NULL OR ur.expires_at > NOW())`,
		userID, projectID,
	).Scan(&hasProjectRole)
	if hasProjectRole > 0 {
		return &project, true
	}

	hasAccess, _ := middleware.CheckProjectAccess(userID, projectID, "read")
	if !hasAccess {
		var memberCount int
		db.Pool.QueryRow(ctx,
			`SELECT COUNT(*) FROM project_members
			 WHERE project_id=$1 AND user_id=$2`,
			projectID, userID,
		).Scan(&memberCount)
		if memberCount == 0 {
			utils.Forbidden(c)
			return nil, false
		}
	}

	return &project, true
}

// getOrgSlug fetches the slug of an org by ID.
func getOrgSlug(ctx context.Context, orgID string) (string, error) {
	var slug string
	err := db.Pool.QueryRow(ctx, `SELECT slug FROM organizations WHERE id=$1`, orgID).Scan(&slug)
	return slug, err
}

// ─────────────────────────────────────────────────────
// ISSUES
// ─────────────────────────────────────────────────────

type createIssueRequest struct {
	Title       string   `json:"title"`
	Body        *string  `json:"body"`
	Status      *string  `json:"status"`
	Priority    *string  `json:"priority"`
	Type        *string  `json:"type"`
	AssigneeIDs []string `json:"assignee_ids"`
	DueDate     *string  `json:"due_date"`
}

type updateIssueRequest struct {
	Title       *string  `json:"title"`
	Body        *string  `json:"body"`
	Status      *string  `json:"status"`
	Priority    *string  `json:"priority"`
	Type        *string  `json:"type"`
	AssigneeIDs []string `json:"assignee_ids"`
	DueDate     *string  `json:"due_date"`
}

func CreateIssue(c *gin.Context) {
	ctx := context.Background()
	project, ok := verifyProjectAccess(c)
	if !ok {
		return
	}
	userID := c.GetString("userID")
	orgID := c.GetString("orgID")

	var req createIssueRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Invalid request body")
		return
	}
	req.Title = strings.TrimSpace(req.Title)
	if req.Title == "" {
		utils.BadRequest(c, "title is required")
		return
	}

	// Get next issue number via DB function
	var issueNumber int
	if err := db.Pool.QueryRow(ctx,
		`SELECT next_issue_number($1::uuid)`, project.ID,
	).Scan(&issueNumber); err != nil {
		utils.InternalError(c, err)
		return
	}

	assigneeIDs := req.AssigneeIDs
	if assigneeIDs == nil {
		assigneeIDs = []string{}
	}

	var issue models.Issue
	err := db.Pool.QueryRow(ctx,
		`INSERT INTO issues
		   (id, project_id, number, title, body, status, priority,
		    type, assignee_ids, created_by, due_date)
		 VALUES (
		   $1, $2, $3, $4, $5,
		   COALESCE($6, 'open'),
		   COALESCE($7, 'medium'),
		   COALESCE($8, 'task'),
		   $9::uuid[], $10, $11
		 )
		 RETURNING id, project_id, number, title, body, status, priority,
		           type, assignee_ids, created_by, closed_by, closed_at,
		           due_date::text, created_at, updated_at`,
		uuid.New().String(), project.ID, issueNumber, req.Title, req.Body,
		req.Status, req.Priority, req.Type,
		assigneeIDs, userID, req.DueDate,
	).Scan(
		&issue.ID, &issue.ProjectID, &issue.Number, &issue.Title,
		&issue.Body, &issue.Status, &issue.Priority, &issue.Type,
		&issue.AssigneeIDs, &issue.CreatedBy, &issue.ClosedBy,
		&issue.ClosedAt, &issue.DueDate, &issue.CreatedAt, &issue.UpdatedAt,
	)
	if err != nil {
		utils.InternalError(c, err)
		return
	}

	activity.Log(project.ID, userID, "issue.created", map[string]interface{}{
		"issue_number": issueNumber,
		"title":        req.Title,
	})
	writeAuditLog(ctx, orgID, userID, "issue.created", "issue", issue.ID, map[string]interface{}{
		"issue_number": issueNumber,
		"project_id":   project.ID,
	})

	utils.Created(c, issue)
}

func ListIssues(c *gin.Context) {
	ctx := context.Background()
	project, ok := verifyProjectAccess(c)
	if !ok {
		return
	}

	statusFilter := c.Query("status")
	priorityFilter := c.Query("priority")
	typeFilter := c.Query("type")
	assigneeFilter := c.Query("assignee_id")

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 100 {
		limit = 20
	}
	offset := (page - 1) * limit

	var sPtr, pPtr, tPtr, aPtr *string
	if statusFilter != "" {
		sPtr = &statusFilter
	}
	if priorityFilter != "" {
		pPtr = &priorityFilter
	}
	if typeFilter != "" {
		tPtr = &typeFilter
	}
	if assigneeFilter != "" {
		aPtr = &assigneeFilter
	}

	rows, err := db.Pool.Query(ctx,
		`SELECT id, project_id, number, title, body, status, priority,
		        type, assignee_ids, created_by, closed_by, closed_at,
		        due_date::text, created_at, updated_at
		 FROM issues
		 WHERE project_id=$1
		   AND ($2::text IS NULL OR status=$2)
		   AND ($3::text IS NULL OR priority=$3)
		   AND ($4::text IS NULL OR type=$4)
		   AND ($5::uuid IS NULL OR $5::uuid = ANY(assignee_ids))
		 ORDER BY created_at DESC
		 LIMIT $6 OFFSET $7`,
		project.ID, sPtr, pPtr, tPtr, aPtr, limit, offset,
	)
	if err != nil {
		utils.InternalError(c, err)
		return
	}
	defer rows.Close()

	issues := []models.Issue{}
	for rows.Next() {
		var issue models.Issue
		if err := rows.Scan(
			&issue.ID, &issue.ProjectID, &issue.Number, &issue.Title,
			&issue.Body, &issue.Status, &issue.Priority, &issue.Type,
			&issue.AssigneeIDs, &issue.CreatedBy, &issue.ClosedBy,
			&issue.ClosedAt, &issue.DueDate, &issue.CreatedAt, &issue.UpdatedAt,
		); err != nil {
			utils.InternalError(c, err)
			return
		}
		issues = append(issues, issue)
	}

	var total int
	db.Pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM issues
		 WHERE project_id=$1
		   AND ($2::text IS NULL OR status=$2)
		   AND ($3::text IS NULL OR priority=$3)
		   AND ($4::text IS NULL OR type=$4)
		   AND ($5::uuid IS NULL OR $5::uuid = ANY(assignee_ids))`,
		project.ID, sPtr, pPtr, tPtr, aPtr,
	).Scan(&total)

	utils.OK(c, gin.H{
		"issues": issues,
		"total":  total,
		"page":   page,
		"limit":  limit,
	})
}

func GetIssue(c *gin.Context) {
	ctx := context.Background()
	project, ok := verifyProjectAccess(c)
	if !ok {
		return
	}

	number, err := strconv.Atoi(c.Param("number"))
	if err != nil {
		utils.BadRequest(c, "Invalid issue number")
		return
	}

	var issue models.Issue
	err = db.Pool.QueryRow(ctx,
		`SELECT id, project_id, number, title, body, status, priority,
		        type, assignee_ids, created_by, closed_by, closed_at,
		        due_date::text, created_at, updated_at
		 FROM issues WHERE project_id=$1 AND number=$2`,
		project.ID, number,
	).Scan(
		&issue.ID, &issue.ProjectID, &issue.Number, &issue.Title,
		&issue.Body, &issue.Status, &issue.Priority, &issue.Type,
		&issue.AssigneeIDs, &issue.CreatedBy, &issue.ClosedBy,
		&issue.ClosedAt, &issue.DueDate, &issue.CreatedAt, &issue.UpdatedAt,
	)
	if err != nil {
		utils.NotFound(c, "Issue not found")
		return
	}

	// Load assignee details
	type assigneeInfo struct {
		ID          string  `json:"id"`
		Username    string  `json:"username"`
		DisplayName *string `json:"display_name"`
		Email       string  `json:"email"`
	}
	assignees := []assigneeInfo{}
	if len(issue.AssigneeIDs) > 0 {
		aRows, err := db.Pool.Query(ctx,
			`SELECT id, username, display_name, email
			 FROM users WHERE id = ANY($1::uuid[])`,
			issue.AssigneeIDs,
		)
		if err == nil {
			defer aRows.Close()
			for aRows.Next() {
				var a assigneeInfo
				aRows.Scan(&a.ID, &a.Username, &a.DisplayName, &a.Email)
				assignees = append(assignees, a)
			}
		}
	}

	utils.OK(c, gin.H{
		"id":           issue.ID,
		"project_id":   issue.ProjectID,
		"number":       issue.Number,
		"title":        issue.Title,
		"body":         issue.Body,
		"status":       issue.Status,
		"priority":     issue.Priority,
		"type":         issue.Type,
		"assignee_ids": issue.AssigneeIDs,
		"assignees":    assignees,
		"created_by":   issue.CreatedBy,
		"closed_by":    issue.ClosedBy,
		"closed_at":    issue.ClosedAt,
		"due_date":     issue.DueDate,
		"created_at":   issue.CreatedAt,
		"updated_at":   issue.UpdatedAt,
	})
}

func UpdateIssue(c *gin.Context) {
	ctx := context.Background()
	project, ok := verifyProjectAccess(c)
	if !ok {
		return
	}
	userID := c.GetString("userID")
	orgID := c.GetString("orgID")

	number, err := strconv.Atoi(c.Param("number"))
	if err != nil {
		utils.BadRequest(c, "Invalid issue number")
		return
	}

	var req updateIssueRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Invalid request body")
		return
	}

	// Fetch existing
	var issue models.Issue
	err = db.Pool.QueryRow(ctx,
		`SELECT id, project_id, number, title, body, status, priority,
		        type, assignee_ids, created_by, closed_by, closed_at,
		        due_date::text, created_at, updated_at
		 FROM issues WHERE project_id=$1 AND number=$2`,
		project.ID, number,
	).Scan(
		&issue.ID, &issue.ProjectID, &issue.Number, &issue.Title,
		&issue.Body, &issue.Status, &issue.Priority, &issue.Type,
		&issue.AssigneeIDs, &issue.CreatedBy, &issue.ClosedBy,
		&issue.ClosedAt, &issue.DueDate, &issue.CreatedAt, &issue.UpdatedAt,
	)
	if err != nil {
		utils.NotFound(c, "Issue not found")
		return
	}

	// Apply patches
	setClauses := []string{"updated_at=NOW()"}
	args := []interface{}{}
	argIdx := 1
	changes := []string{}

	addArg := func(clause string, val interface{}, field string) {
		setClauses = append(setClauses, fmt.Sprintf("%s=$%d", clause, argIdx))
		args = append(args, val)
		changes = append(changes, field)
		argIdx++
	}

	if req.Title != nil {
		t := strings.TrimSpace(*req.Title)
		if t == "" {
			utils.BadRequest(c, "title cannot be empty")
			return
		}
		addArg("title", t, "title")
	}
	if req.Body != nil {
		addArg("body", *req.Body, "body")
	}
	if req.Status != nil {
		addArg("status", *req.Status, "status")
	}
	if req.Priority != nil {
		addArg("priority", *req.Priority, "priority")
	}
	if req.Type != nil {
		addArg("type", *req.Type, "type")
	}
	if req.AssigneeIDs != nil {
		addArg("assignee_ids", req.AssigneeIDs, "assignee_ids")
	}
	if req.DueDate != nil {
		addArg("due_date", *req.DueDate, "due_date")
	}

	query := fmt.Sprintf(
		`UPDATE issues SET %s
		 WHERE project_id=$%d AND number=$%d
		 RETURNING id, project_id, number, title, body, status, priority,
		           type, assignee_ids, created_by, closed_by, closed_at,
		           due_date::text, created_at, updated_at`,
		strings.Join(setClauses, ", "), argIdx, argIdx+1,
	)
	args = append(args, project.ID, number)

	var updated models.Issue
	err = db.Pool.QueryRow(ctx, query, args...).Scan(
		&updated.ID, &updated.ProjectID, &updated.Number, &updated.Title,
		&updated.Body, &updated.Status, &updated.Priority, &updated.Type,
		&updated.AssigneeIDs, &updated.CreatedBy, &updated.ClosedBy,
		&updated.ClosedAt, &updated.DueDate, &updated.CreatedAt, &updated.UpdatedAt,
	)
	if err != nil {
		utils.InternalError(c, err)
		return
	}

	activity.Log(project.ID, userID, "issue.updated", map[string]interface{}{
		"issue_number": number,
		"changes":      changes,
	})
	writeAuditLog(ctx, orgID, userID, "issue.updated", "issue", updated.ID, map[string]interface{}{
		"issue_number": number,
		"changes":      changes,
	})

	utils.OK(c, updated)
}

func CloseIssue(c *gin.Context) {
	ctx := context.Background()
	project, ok := verifyProjectAccess(c)
	if !ok {
		return
	}
	userID := c.GetString("userID")
	orgID := c.GetString("orgID")

	number, err := strconv.Atoi(c.Param("number"))
	if err != nil {
		utils.BadRequest(c, "Invalid issue number")
		return
	}

	var issue models.Issue
	err = db.Pool.QueryRow(ctx,
		`SELECT id, status FROM issues WHERE project_id=$1 AND number=$2`,
		project.ID, number,
	).Scan(&issue.ID, &issue.Status)
	if err != nil {
		utils.NotFound(c, "Issue not found")
		return
	}
	if issue.Status == "closed" {
		utils.Conflict(c, "Issue is already closed")
		return
	}

	now := time.Now()
	_, err = db.Pool.Exec(ctx,
		`UPDATE issues SET status='closed', closed_by=$1, closed_at=$2,
		 updated_at=NOW() WHERE project_id=$3 AND number=$4`,
		userID, now, project.ID, number,
	)
	if err != nil {
		utils.InternalError(c, err)
		return
	}

	activity.Log(project.ID, userID, "issue.closed", map[string]interface{}{
		"issue_number": number,
	})
	writeAuditLog(ctx, orgID, userID, "issue.closed", "issue", issue.ID, map[string]interface{}{
		"issue_number": number,
	})

	utils.OK(c, gin.H{"message": "Issue closed"})
}

func ReopenIssue(c *gin.Context) {
	ctx := context.Background()
	project, ok := verifyProjectAccess(c)
	if !ok {
		return
	}
	userID := c.GetString("userID")
	orgID := c.GetString("orgID")

	number, err := strconv.Atoi(c.Param("number"))
	if err != nil {
		utils.BadRequest(c, "Invalid issue number")
		return
	}

	var issue models.Issue
	err = db.Pool.QueryRow(ctx,
		`SELECT id, status FROM issues WHERE project_id=$1 AND number=$2`,
		project.ID, number,
	).Scan(&issue.ID, &issue.Status)
	if err != nil {
		utils.NotFound(c, "Issue not found")
		return
	}
	if issue.Status != "closed" {
		utils.Conflict(c, "Issue is not closed")
		return
	}

	_, err = db.Pool.Exec(ctx,
		`UPDATE issues SET status='open', closed_by=NULL, closed_at=NULL,
		 updated_at=NOW() WHERE project_id=$1 AND number=$2`,
		project.ID, number,
	)
	if err != nil {
		utils.InternalError(c, err)
		return
	}

	activity.Log(project.ID, userID, "issue.reopened", map[string]interface{}{
		"issue_number": number,
	})
	writeAuditLog(ctx, orgID, userID, "issue.reopened", "issue", issue.ID, map[string]interface{}{
		"issue_number": number,
	})

	utils.OK(c, gin.H{"message": "Issue reopened"})
}

type addIssueCommentRequest struct {
	Body string `json:"body"`
}

func AddIssueComment(c *gin.Context) {
	ctx := context.Background()
	project, ok := verifyProjectAccess(c)
	if !ok {
		return
	}
	userID := c.GetString("userID")
	orgID := c.GetString("orgID")

	number, err := strconv.Atoi(c.Param("number"))
	if err != nil {
		utils.BadRequest(c, "Invalid issue number")
		return
	}

	var issueID string
	err = db.Pool.QueryRow(ctx,
		`SELECT id FROM issues WHERE project_id=$1 AND number=$2`,
		project.ID, number,
	).Scan(&issueID)
	if err != nil {
		utils.NotFound(c, "Issue not found")
		return
	}

	var req addIssueCommentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Invalid request body")
		return
	}
	req.Body = strings.TrimSpace(req.Body)
	if req.Body == "" {
		utils.BadRequest(c, "body is required")
		return
	}

	var comment models.IssueComment
	err = db.Pool.QueryRow(ctx,
		`INSERT INTO issue_comments (id, issue_id, author_id, body)
		 VALUES ($1, $2, $3, $4)
		 RETURNING id, issue_id, author_id, body, created_at, updated_at`,
		uuid.New().String(), issueID, userID, req.Body,
	).Scan(
		&comment.ID, &comment.IssueID, &comment.AuthorID,
		&comment.Body, &comment.CreatedAt, &comment.UpdatedAt,
	)
	if err != nil {
		utils.InternalError(c, err)
		return
	}

	// Load author
	type authorInfo struct {
		ID          string  `json:"id"`
		Username    string  `json:"username"`
		DisplayName *string `json:"display_name"`
	}
	var author authorInfo
	db.Pool.QueryRow(ctx,
		`SELECT id, username, display_name FROM users WHERE id=$1`, userID,
	).Scan(&author.ID, &author.Username, &author.DisplayName)

	activity.Log(project.ID, userID, "issue.commented", map[string]interface{}{
		"issue_number": number,
		"comment_id":   comment.ID,
	})
	writeAuditLog(ctx, orgID, userID, "issue.commented", "issue", issueID, map[string]interface{}{
		"issue_number": number,
	})

	utils.Created(c, gin.H{
		"id":         comment.ID,
		"issue_id":   comment.IssueID,
		"author_id":  comment.AuthorID,
		"body":       comment.Body,
		"created_at": comment.CreatedAt,
		"updated_at": comment.UpdatedAt,
		"author":     author,
	})
}

func ListIssueComments(c *gin.Context) {
	ctx := context.Background()
	project, ok := verifyProjectAccess(c)
	if !ok {
		return
	}

	number, err := strconv.Atoi(c.Param("number"))
	if err != nil {
		utils.BadRequest(c, "Invalid issue number")
		return
	}

	var issueID string
	err = db.Pool.QueryRow(ctx,
		`SELECT id FROM issues WHERE project_id=$1 AND number=$2`,
		project.ID, number,
	).Scan(&issueID)
	if err != nil {
		utils.NotFound(c, "Issue not found")
		return
	}

	rows, err := db.Pool.Query(ctx,
		`SELECT c.id, c.issue_id, c.author_id, c.body, c.created_at, c.updated_at,
		        u.username, u.display_name, u.email
		 FROM issue_comments c
		 JOIN users u ON u.id = c.author_id
		 WHERE c.issue_id=$1
		 ORDER BY c.created_at ASC`,
		issueID,
	)
	if err != nil {
		utils.InternalError(c, err)
		return
	}
	defer rows.Close()

	type commentWithAuthor struct {
		ID        string    `json:"id"`
		IssueID   string    `json:"issue_id"`
		AuthorID  string    `json:"author_id"`
		Body      string    `json:"body"`
		CreatedAt time.Time `json:"created_at"`
		UpdatedAt time.Time `json:"updated_at"`
		Author    struct {
			ID          string  `json:"id"`
			Username    string  `json:"username"`
			DisplayName *string `json:"display_name"`
			Email       string  `json:"email"`
		} `json:"author"`
	}

	comments := []commentWithAuthor{}
	for rows.Next() {
		var com commentWithAuthor
		if err := rows.Scan(
			&com.ID, &com.IssueID, &com.AuthorID, &com.Body,
			&com.CreatedAt, &com.UpdatedAt,
			&com.Author.Username, &com.Author.DisplayName, &com.Author.Email,
		); err != nil {
			utils.InternalError(c, err)
			return
		}
		com.Author.ID = com.AuthorID
		comments = append(comments, com)
	}

	utils.OK(c, comments)
}
