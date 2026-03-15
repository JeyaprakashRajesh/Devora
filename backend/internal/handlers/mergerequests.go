package handlers

import (
	"context"
	"fmt"
	"log"
	"strconv"
	"strings"
	"time"

	"github.com/devora/devora/internal/activity"
	"github.com/devora/devora/internal/db"
	"github.com/devora/devora/internal/gitea"
	"github.com/devora/devora/internal/models"
	"github.com/devora/devora/internal/utils"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// ─────────────────────────────────────────────────────
// MERGE REQUESTS
// ─────────────────────────────────────────────────────

type createMRRequest struct {
	Title        string  `json:"title"`
	Body         *string `json:"body"`
	SourceBranch string  `json:"source_branch"`
	TargetBranch string  `json:"target_branch"`
}

type addMRCommentRequest struct {
	Body       string  `json:"body"`
	FilePath   *string `json:"file_path"`
	LineNumber *int    `json:"line_number"`
}

func CreateMR(c *gin.Context) {
	ctx := context.Background()
	project, ok := verifyProjectAccess(c)
	if !ok {
		return
	}
	userID := c.GetString("userID")
	orgID := c.GetString("orgID")

	var req createMRRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Invalid request body")
		return
	}
	req.Title = strings.TrimSpace(req.Title)
	req.SourceBranch = strings.TrimSpace(req.SourceBranch)
	req.TargetBranch = strings.TrimSpace(req.TargetBranch)

	if req.Title == "" || req.SourceBranch == "" || req.TargetBranch == "" {
		utils.BadRequest(c, "title, source_branch, and target_branch are required")
		return
	}
	if req.SourceBranch == req.TargetBranch {
		utils.BadRequest(c, "Source and target must differ")
		return
	}

	// Get org slug for Gitea
	orgSlug, err := getOrgSlug(ctx, orgID)
	if err != nil {
		utils.InternalError(c, err)
		return
	}

	// Next MR number
	var mrNumber int
	if err := db.Pool.QueryRow(ctx,
		`SELECT COALESCE(MAX(number), 0) + 1 FROM merge_requests WHERE project_id=$1`,
		project.ID,
	).Scan(&mrNumber); err != nil {
		utils.InternalError(c, err)
		return
	}

	// Create PR in Gitea
	body := ""
	if req.Body != nil {
		body = *req.Body
	}
	prNum, err := gitea.Default.CreatePR(orgSlug, project.Slug,
		req.Title, body, req.SourceBranch, req.TargetBranch)
	if err != nil {
		c.JSON(422, gin.H{"error": "Failed to create PR in Gitea: " + err.Error()})
		return
	}

	var mr models.MergeRequest
	err = db.Pool.QueryRow(ctx,
		`INSERT INTO merge_requests
		   (id, project_id, number, title, body, status,
		    source_branch, target_branch, author_id, gitea_pr_id)
		 VALUES ($1,$2,$3,$4,$5,'open',$6,$7,$8,$9)
		 RETURNING id, project_id, number, title, body, status,
		           source_branch, target_branch, author_id, merged_by,
		           merged_at, gitea_pr_id, head_sha, created_at, updated_at`,
		uuid.New().String(), project.ID, mrNumber, req.Title, req.Body,
		req.SourceBranch, req.TargetBranch, userID, prNum,
	).Scan(
		&mr.ID, &mr.ProjectID, &mr.Number, &mr.Title, &mr.Body,
		&mr.Status, &mr.SourceBranch, &mr.TargetBranch, &mr.AuthorID,
		&mr.MergedBy, &mr.MergedAt, &mr.GiteaPRID, &mr.HeadSHA,
		&mr.CreatedAt, &mr.UpdatedAt,
	)
	if err != nil {
		utils.InternalError(c, err)
		return
	}

	activity.Log(project.ID, userID, "mr.opened", map[string]interface{}{
		"mr_number": mrNumber,
		"title":     req.Title,
		"source":    req.SourceBranch,
		"target":    req.TargetBranch,
	})
	writeAuditLog(ctx, orgID, userID, "mr.opened", "merge_request", mr.ID, map[string]interface{}{
		"mr_number":  mrNumber,
		"project_id": project.ID,
	})

	utils.Created(c, mr)
}

func ListMRs(c *gin.Context) {
	ctx := context.Background()
	project, ok := verifyProjectAccess(c)
	if !ok {
		return
	}

	statusFilter := c.Query("status")
	var sPtr *string
	if statusFilter != "" {
		sPtr = &statusFilter
	}

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 100 {
		limit = 20
	}
	offset := (page - 1) * limit

	rows, err := db.Pool.Query(ctx,
		`SELECT mr.id, mr.project_id, mr.number, mr.title, mr.body,
		        mr.status, mr.source_branch, mr.target_branch,
		        mr.author_id, mr.merged_by, mr.merged_at,
		        mr.gitea_pr_id, mr.head_sha, mr.created_at, mr.updated_at,
		        u.username AS author_name, u.display_name AS author_display
		 FROM merge_requests mr
		 LEFT JOIN users u ON u.id = mr.author_id
		 WHERE mr.project_id=$1
		   AND ($2::text IS NULL OR mr.status=$2)
		 ORDER BY mr.created_at DESC
		 LIMIT $3 OFFSET $4`,
		project.ID, sPtr, limit, offset,
	)
	if err != nil {
		utils.InternalError(c, err)
		return
	}
	defer rows.Close()

	type mrRow struct {
		models.MergeRequest
		AuthorName    *string `json:"author_name"`
		AuthorDisplay *string `json:"author_display"`
	}

	mrs := []mrRow{}
	for rows.Next() {
		var mr mrRow
		if err := rows.Scan(
			&mr.ID, &mr.ProjectID, &mr.Number, &mr.Title, &mr.Body,
			&mr.Status, &mr.SourceBranch, &mr.TargetBranch,
			&mr.AuthorID, &mr.MergedBy, &mr.MergedAt,
			&mr.GiteaPRID, &mr.HeadSHA, &mr.CreatedAt, &mr.UpdatedAt,
			&mr.AuthorName, &mr.AuthorDisplay,
		); err != nil {
			utils.InternalError(c, err)
			return
		}
		mrs = append(mrs, mr)
	}

	var total int
	db.Pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM merge_requests
		 WHERE project_id=$1 AND ($2::text IS NULL OR status=$2)`,
		project.ID, sPtr,
	).Scan(&total)

	utils.OK(c, gin.H{
		"mrs":   mrs,
		"total": total,
	})
}

func GetMR(c *gin.Context) {
	ctx := context.Background()
	project, ok := verifyProjectAccess(c)
	if !ok {
		return
	}

	number, err := strconv.Atoi(c.Param("number"))
	if err != nil {
		utils.BadRequest(c, "Invalid MR number")
		return
	}

	var mr models.MergeRequest
	err = db.Pool.QueryRow(ctx,
		`SELECT id, project_id, number, title, body, status,
		        source_branch, target_branch, author_id, merged_by,
		        merged_at, gitea_pr_id, head_sha, created_at, updated_at
		 FROM merge_requests WHERE project_id=$1 AND number=$2`,
		project.ID, number,
	).Scan(
		&mr.ID, &mr.ProjectID, &mr.Number, &mr.Title, &mr.Body,
		&mr.Status, &mr.SourceBranch, &mr.TargetBranch, &mr.AuthorID,
		&mr.MergedBy, &mr.MergedAt, &mr.GiteaPRID, &mr.HeadSHA,
		&mr.CreatedAt, &mr.UpdatedAt,
	)
	if err != nil {
		utils.NotFound(c, "Merge request not found")
		return
	}

	// Load author details
	type authorInfo struct {
		ID          string  `json:"id"`
		Username    string  `json:"username"`
		DisplayName *string `json:"display_name"`
		Email       string  `json:"email"`
	}
	var author *authorInfo
	if mr.AuthorID != nil {
		a := authorInfo{}
		if dbErr := db.Pool.QueryRow(ctx,
			`SELECT id, username, display_name, email FROM users WHERE id=$1`,
			*mr.AuthorID,
		).Scan(&a.ID, &a.Username, &a.DisplayName, &a.Email); dbErr == nil {
			author = &a
		}
	}

	utils.OK(c, gin.H{
		"id":            mr.ID,
		"project_id":    mr.ProjectID,
		"number":        mr.Number,
		"title":         mr.Title,
		"body":          mr.Body,
		"status":        mr.Status,
		"source_branch": mr.SourceBranch,
		"target_branch": mr.TargetBranch,
		"author_id":     mr.AuthorID,
		"merged_by":     mr.MergedBy,
		"merged_at":     mr.MergedAt,
		"gitea_pr_id":   mr.GiteaPRID,
		"head_sha":      mr.HeadSHA,
		"created_at":    mr.CreatedAt,
		"updated_at":    mr.UpdatedAt,
		"author":        author,
	})
}

func GetMRDiff(c *gin.Context) {
	ctx := context.Background()
	project, ok := verifyProjectAccess(c)
	if !ok {
		return
	}
	orgID := c.GetString("orgID")

	number, err := strconv.Atoi(c.Param("number"))
	if err != nil {
		utils.BadRequest(c, "Invalid MR number")
		return
	}

	var mr models.MergeRequest
	err = db.Pool.QueryRow(ctx,
		`SELECT id, gitea_pr_id FROM merge_requests WHERE project_id=$1 AND number=$2`,
		project.ID, number,
	).Scan(&mr.ID, &mr.GiteaPRID)
	if err != nil {
		utils.NotFound(c, "Merge request not found")
		return
	}
	if mr.GiteaPRID == nil {
		c.JSON(422, gin.H{"error": "No Gitea PR linked"})
		return
	}

	orgSlug, err := getOrgSlug(ctx, orgID)
	if err != nil {
		utils.InternalError(c, err)
		return
	}

	diff, err := gitea.Default.GetPRDiff(orgSlug, project.Slug, *mr.GiteaPRID)
	if err != nil {
		utils.InternalError(c, err)
		return
	}

	utils.OK(c, gin.H{"diff": diff})
}

func MergeMR(c *gin.Context) {
	ctx := context.Background()
	project, ok := verifyProjectAccess(c)
	if !ok {
		return
	}
	userID := c.GetString("userID")
	orgID := c.GetString("orgID")

	number, err := strconv.Atoi(c.Param("number"))
	if err != nil {
		utils.BadRequest(c, "Invalid MR number")
		return
	}

	var mr models.MergeRequest
	err = db.Pool.QueryRow(ctx,
		`SELECT id, status, gitea_pr_id FROM merge_requests WHERE project_id=$1 AND number=$2`,
		project.ID, number,
	).Scan(&mr.ID, &mr.Status, &mr.GiteaPRID)
	if err != nil {
		utils.NotFound(c, "Merge request not found")
		return
	}
	if mr.Status != "open" {
		utils.Conflict(c, "Merge request is not open")
		return
	}
	if mr.GiteaPRID == nil {
		c.JSON(422, gin.H{"error": "No Gitea PR linked"})
		return
	}

	orgSlug, err := getOrgSlug(ctx, orgID)
	if err != nil {
		utils.InternalError(c, err)
		return
	}

	var body struct {
		Method *string `json:"method"`
	}
	c.ShouldBindJSON(&body)
	mergeMethod := "merge"
	if body.Method != nil && *body.Method != "" {
		mergeMethod = *body.Method
	}

	if err := gitea.Default.MergePR(orgSlug, project.Slug, *mr.GiteaPRID, mergeMethod); err != nil {
		c.JSON(422, gin.H{"error": "Merge failed: " + err.Error()})
		return
	}

	_, err = db.Pool.Exec(ctx,
		`UPDATE merge_requests SET status='merged', merged_by=$1,
		 merged_at=NOW(), updated_at=NOW() WHERE id=$2`,
		userID, mr.ID,
	)
	if err != nil {
		utils.InternalError(c, err)
		return
	}

	// Fetch username for audit log
	var username string
	db.Pool.QueryRow(ctx, `SELECT username FROM users WHERE id=$1`, userID).Scan(&username)

	activity.Log(project.ID, userID, "mr.merged", map[string]interface{}{
		"mr_number": number,
		"merged_by": username,
		"method":    mergeMethod,
	})
	writeAuditLog(ctx, orgID, userID, "mr.merged", "merge_request", mr.ID, map[string]interface{}{
		"mr_number": number,
		"method":    mergeMethod,
	})

	utils.OK(c, gin.H{"message": "Merge request merged"})
}

func CloseMR(c *gin.Context) {
	ctx := context.Background()
	project, ok := verifyProjectAccess(c)
	if !ok {
		return
	}
	userID := c.GetString("userID")
	orgID := c.GetString("orgID")

	number, err := strconv.Atoi(c.Param("number"))
	if err != nil {
		utils.BadRequest(c, "Invalid MR number")
		return
	}

	var mr models.MergeRequest
	err = db.Pool.QueryRow(ctx,
		`SELECT id, status, gitea_pr_id FROM merge_requests WHERE project_id=$1 AND number=$2`,
		project.ID, number,
	).Scan(&mr.ID, &mr.Status, &mr.GiteaPRID)
	if err != nil {
		utils.NotFound(c, "Merge request not found")
		return
	}
	if mr.Status != "open" {
		utils.Conflict(c, "Merge request is not open")
		return
	}

	orgSlug, err := getOrgSlug(ctx, orgID)
	if err != nil {
		utils.InternalError(c, err)
		return
	}

	// Best effort — close in Gitea
	if mr.GiteaPRID != nil {
		if gErr := gitea.Default.ClosePR(orgSlug, project.Slug, *mr.GiteaPRID); gErr != nil {
			log.Printf("CloseMR: gitea ClosePR failed (non-fatal): %v", gErr)
		}
	}

	_, err = db.Pool.Exec(ctx,
		`UPDATE merge_requests SET status='closed', updated_at=NOW() WHERE id=$1`,
		mr.ID,
	)
	if err != nil {
		utils.InternalError(c, err)
		return
	}

	activity.Log(project.ID, userID, "mr.closed", map[string]interface{}{
		"mr_number": number,
	})
	writeAuditLog(ctx, orgID, userID, "mr.closed", "merge_request", mr.ID, map[string]interface{}{
		"mr_number": number,
	})

	utils.OK(c, gin.H{"message": "Merge request closed"})
}

func AddMRComment(c *gin.Context) {
	ctx := context.Background()
	project, ok := verifyProjectAccess(c)
	if !ok {
		return
	}
	userID := c.GetString("userID")
	orgID := c.GetString("orgID")

	number, err := strconv.Atoi(c.Param("number"))
	if err != nil {
		utils.BadRequest(c, "Invalid MR number")
		return
	}

	var mrID string
	err = db.Pool.QueryRow(ctx,
		`SELECT id FROM merge_requests WHERE project_id=$1 AND number=$2`,
		project.ID, number,
	).Scan(&mrID)
	if err != nil {
		utils.NotFound(c, "Merge request not found")
		return
	}

	var req addMRCommentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Invalid request body")
		return
	}
	req.Body = strings.TrimSpace(req.Body)
	if req.Body == "" {
		utils.BadRequest(c, "body is required")
		return
	}

	type mrComment struct {
		ID         string     `json:"id"`
		MRID       string     `json:"mr_id"`
		AuthorID   string     `json:"author_id"`
		Body       string     `json:"body"`
		FilePath   *string    `json:"file_path"`
		LineNumber *int       `json:"line_number"`
		CreatedAt  time.Time  `json:"created_at"`
		UpdatedAt  time.Time  `json:"updated_at"`
	}

	var comment mrComment
	err = db.Pool.QueryRow(ctx,
		`INSERT INTO mr_comments (id, mr_id, author_id, body, file_path, line_number)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 RETURNING id, mr_id, author_id, body, file_path, line_number, created_at, updated_at`,
		uuid.New().String(), mrID, userID, req.Body, req.FilePath, req.LineNumber,
	).Scan(
		&comment.ID, &comment.MRID, &comment.AuthorID, &comment.Body,
		&comment.FilePath, &comment.LineNumber, &comment.CreatedAt, &comment.UpdatedAt,
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

	activity.Log(project.ID, userID, "mr.commented", map[string]interface{}{
		"mr_number":  number,
		"comment_id": comment.ID,
	})
	writeAuditLog(ctx, orgID, userID, "mr.commented", "merge_request", mrID, map[string]interface{}{
		"mr_number": number,
	})

	utils.Created(c, gin.H{
		"id":          comment.ID,
		"mr_id":       comment.MRID,
		"author_id":   comment.AuthorID,
		"body":        comment.Body,
		"file_path":   comment.FilePath,
		"line_number": comment.LineNumber,
		"created_at":  comment.CreatedAt,
		"updated_at":  comment.UpdatedAt,
		"author":      author,
	})
}

func ListMRComments(c *gin.Context) {
	ctx := context.Background()
	project, ok := verifyProjectAccess(c)
	if !ok {
		return
	}

	number, err := strconv.Atoi(c.Param("number"))
	if err != nil {
		utils.BadRequest(c, "Invalid MR number")
		return
	}

	var mrID string
	err = db.Pool.QueryRow(ctx,
		`SELECT id FROM merge_requests WHERE project_id=$1 AND number=$2`,
		project.ID, number,
	).Scan(&mrID)
	if err != nil {
		utils.NotFound(c, "Merge request not found")
		return
	}

	rows, err := db.Pool.Query(ctx,
		`SELECT c.id, c.mr_id, c.author_id, c.body, c.file_path,
		        c.line_number, c.created_at, c.updated_at,
		        u.username, u.display_name
		 FROM mr_comments c
		 JOIN users u ON u.id = c.author_id
		 WHERE c.mr_id=$1
		 ORDER BY c.created_at ASC`,
		mrID,
	)
	if err != nil {
		utils.InternalError(c, err)
		return
	}
	defer rows.Close()

	type commentWithAuthor struct {
		ID         string    `json:"id"`
		MRID       string    `json:"mr_id"`
		AuthorID   string    `json:"author_id"`
		Body       string    `json:"body"`
		FilePath   *string   `json:"file_path"`
		LineNumber *int      `json:"line_number"`
		CreatedAt  time.Time `json:"created_at"`
		UpdatedAt  time.Time `json:"updated_at"`
		Author     struct {
			ID          string  `json:"id"`
			Username    string  `json:"username"`
			DisplayName *string `json:"display_name"`
		} `json:"author"`
	}

	comments := []commentWithAuthor{}
	for rows.Next() {
		var com commentWithAuthor
		if err := rows.Scan(
			&com.ID, &com.MRID, &com.AuthorID, &com.Body,
			&com.FilePath, &com.LineNumber, &com.CreatedAt, &com.UpdatedAt,
			&com.Author.Username, &com.Author.DisplayName,
		); err != nil {
			utils.InternalError(c, err)
			return
		}
		com.Author.ID = com.AuthorID
		comments = append(comments, com)
	}

	utils.OK(c, comments)
}

// Ensure fmt is used (referenced in UpdateIssue via issues.go, but declared here for MR package)
var _ = fmt.Sprintf
