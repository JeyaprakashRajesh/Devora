package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/devora/devora/internal/db"
	"github.com/devora/devora/internal/pipeline"
	"github.com/devora/devora/internal/utils"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// ─────────────────────────────────────────────────────
// PIPELINES
// ─────────────────────────────────────────────────────

type createPipelineRequest struct {
	Name       string                 `json:"name"`
	Definition map[string]interface{} `json:"definition"`
	Trigger    map[string]interface{} `json:"trigger"`
}

func CreatePipeline(c *gin.Context) {
	ctx := context.Background()
	project, ok := verifyProjectAccess(c)
	if !ok {
		return
	}
	userID := c.GetString("userID")

	var req createPipelineRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Invalid request body")
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		utils.BadRequest(c, "name is required")
		return
	}
	if req.Definition == nil {
		utils.BadRequest(c, "definition is required")
		return
	}

	defBytes, err := json.Marshal(req.Definition)
	if err != nil {
		utils.BadRequest(c, "Invalid definition JSON")
		return
	}

	if req.Trigger == nil {
		req.Trigger = map[string]interface{}{}
	}
	triggerBytes, err := json.Marshal(req.Trigger)
	if err != nil {
		utils.BadRequest(c, "Invalid trigger JSON")
		return
	}

	type pipelineRow struct {
		ID         string          `json:"id"`
		ProjectID  string          `json:"project_id"`
		Name       string          `json:"name"`
		Definition json.RawMessage `json:"definition"`
		Trigger    json.RawMessage `json:"trigger"`
		CreatedBy  *string         `json:"created_by"`
		CreatedAt  time.Time       `json:"created_at"`
	}

	var p pipelineRow
	err = db.Pool.QueryRow(ctx,
		`INSERT INTO pipelines (id, project_id, name, definition, trigger, created_by)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 RETURNING id, project_id, name, definition, trigger, created_by, created_at`,
		uuid.New().String(), project.ID, req.Name,
		string(defBytes), string(triggerBytes), userID,
	).Scan(
		&p.ID, &p.ProjectID, &p.Name, &p.Definition,
		&p.Trigger, &p.CreatedBy, &p.CreatedAt,
	)
	if err != nil {
		utils.InternalError(c, err)
		return
	}

	utils.Created(c, p)
}

func ListPipelines(c *gin.Context) {
	ctx := context.Background()
	project, ok := verifyProjectAccess(c)
	if !ok {
		return
	}

	rows, err := db.Pool.Query(ctx,
		`SELECT p.id, p.project_id, p.name, p.definition, p.trigger,
		        p.created_by, p.created_at,
		        (SELECT COUNT(*) FROM pipeline_runs r WHERE r.pipeline_id = p.id) AS run_count
		 FROM pipelines p
		 WHERE p.project_id = $1
		 ORDER BY p.created_at DESC`,
		project.ID,
	)
	if err != nil {
		utils.InternalError(c, err)
		return
	}
	defer rows.Close()

	type pipelineWithCount struct {
		ID         string          `json:"id"`
		ProjectID  string          `json:"project_id"`
		Name       string          `json:"name"`
		Definition json.RawMessage `json:"definition"`
		Trigger    json.RawMessage `json:"trigger"`
		CreatedBy  *string         `json:"created_by"`
		CreatedAt  time.Time       `json:"created_at"`
		RunCount   int             `json:"run_count"`
	}

	pipelines := []pipelineWithCount{}
	for rows.Next() {
		var p pipelineWithCount
		if err := rows.Scan(
			&p.ID, &p.ProjectID, &p.Name, &p.Definition,
			&p.Trigger, &p.CreatedBy, &p.CreatedAt, &p.RunCount,
		); err != nil {
			utils.InternalError(c, err)
			return
		}
		pipelines = append(pipelines, p)
	}

	utils.OK(c, pipelines)
}

func GetPipeline(c *gin.Context) {
	ctx := context.Background()
	project, ok := verifyProjectAccess(c)
	if !ok {
		return
	}

	pipelineID := c.Param("pid")

	type pipelineRow struct {
		ID         string          `json:"id"`
		ProjectID  string          `json:"project_id"`
		Name       string          `json:"name"`
		Definition json.RawMessage `json:"definition"`
		Trigger    json.RawMessage `json:"trigger"`
		CreatedBy  *string         `json:"created_by"`
		CreatedAt  time.Time       `json:"created_at"`
	}

	var p pipelineRow
	err := db.Pool.QueryRow(ctx,
		`SELECT id, project_id, name, definition, trigger, created_by, created_at
		 FROM pipelines WHERE id=$1 AND project_id=$2`,
		pipelineID, project.ID,
	).Scan(
		&p.ID, &p.ProjectID, &p.Name, &p.Definition,
		&p.Trigger, &p.CreatedBy, &p.CreatedAt,
	)
	if err != nil {
		utils.NotFound(c, "Pipeline not found")
		return
	}

	utils.OK(c, p)
}

func DeletePipeline(c *gin.Context) {
	ctx := context.Background()
	project, ok := verifyProjectAccess(c)
	if !ok {
		return
	}

	pipelineID := c.Param("pid")

	// Block if there are active runs
	var activeCount int
	db.Pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM pipeline_runs
		 WHERE pipeline_id=$1 AND status IN ('queued','running')`,
		pipelineID,
	).Scan(&activeCount)
	if activeCount > 0 {
		utils.Conflict(c, "Cannot delete pipeline with active runs")
		return
	}

	// Cascade delete runs then pipeline
	db.Pool.Exec(ctx, `DELETE FROM pipeline_runs WHERE pipeline_id=$1`, pipelineID)
	if _, err := db.Pool.Exec(ctx,
		`DELETE FROM pipelines WHERE id=$1 AND project_id=$2`,
		pipelineID, project.ID,
	); err != nil {
		utils.InternalError(c, err)
		return
	}

	utils.OK(c, gin.H{"message": "Pipeline deleted"})
}

// ─────────────────────────────────────────────────────
// PIPELINE RUNS
// ─────────────────────────────────────────────────────

func ListRuns(c *gin.Context) {
	ctx := context.Background()
	project, ok := verifyProjectAccess(c)
	if !ok {
		return
	}

	pipelineID := c.Param("pid")
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

	type runRow struct {
		ID           string     `json:"id"`
		PipelineID   *string    `json:"pipeline_id"`
		ProjectID    string     `json:"project_id"`
		Status       string     `json:"status"`
		TriggerType  *string    `json:"trigger_type"`
		TriggerActor *string    `json:"trigger_actor"`
		CommitSHA    *string    `json:"commit_sha"`
		Branch       *string    `json:"branch"`
		StartedAt    *time.Time `json:"started_at"`
		FinishedAt   *time.Time `json:"finished_at"`
		CreatedAt    time.Time  `json:"created_at"`
	}

	rows, err := db.Pool.Query(ctx,
		`SELECT id, pipeline_id, project_id, status,
		        trigger_type, trigger_actor, commit_sha, branch,
		        started_at, finished_at, created_at
		 FROM pipeline_runs
		 WHERE pipeline_id=$1 AND project_id=$2
		   AND ($3::text IS NULL OR status=$3)
		 ORDER BY created_at DESC
		 LIMIT $4 OFFSET $5`,
		pipelineID, project.ID, sPtr, limit, offset,
	)
	if err != nil {
		utils.InternalError(c, err)
		return
	}
	defer rows.Close()

	runs := []runRow{}
	for rows.Next() {
		var r runRow
		if err := rows.Scan(
			&r.ID, &r.PipelineID, &r.ProjectID, &r.Status,
			&r.TriggerType, &r.TriggerActor, &r.CommitSHA, &r.Branch,
			&r.StartedAt, &r.FinishedAt, &r.CreatedAt,
		); err != nil {
			utils.InternalError(c, err)
			return
		}
		runs = append(runs, r)
	}

	var total int
	db.Pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM pipeline_runs
		 WHERE pipeline_id=$1 AND project_id=$2
		   AND ($3::text IS NULL OR status=$3)`,
		pipelineID, project.ID, sPtr,
	).Scan(&total)

	utils.OK(c, gin.H{"runs": runs, "total": total})
}

func GetRun(c *gin.Context) {
	ctx := context.Background()
	project, ok := verifyProjectAccess(c)
	if !ok {
		return
	}

	runID := c.Param("runId")

	type runRow struct {
		ID           string     `json:"id"`
		PipelineID   *string    `json:"pipeline_id"`
		ProjectID    string     `json:"project_id"`
		Status       string     `json:"status"`
		TriggerType  *string    `json:"trigger_type"`
		TriggerActor *string    `json:"trigger_actor"`
		CommitSHA    *string    `json:"commit_sha"`
		Branch       *string    `json:"branch"`
		StartedAt    *time.Time `json:"started_at"`
		FinishedAt   *time.Time `json:"finished_at"`
		CreatedAt    time.Time  `json:"created_at"`
	}

	var r runRow
	err := db.Pool.QueryRow(ctx,
		`SELECT id, pipeline_id, project_id, status,
		        trigger_type, trigger_actor, commit_sha, branch,
		        started_at, finished_at, created_at
		 FROM pipeline_runs WHERE id=$1 AND project_id=$2`,
		runID, project.ID,
	).Scan(
		&r.ID, &r.PipelineID, &r.ProjectID, &r.Status,
		&r.TriggerType, &r.TriggerActor, &r.CommitSHA, &r.Branch,
		&r.StartedAt, &r.FinishedAt, &r.CreatedAt,
	)
	if err != nil {
		utils.NotFound(c, "Run not found")
		return
	}

	// Load jobs without full logs
	type jobSummary struct {
		ID         string     `json:"id"`
		Name       string     `json:"name"`
		Status     string     `json:"status"`
		ExitCode   *int       `json:"exit_code"`
		StartedAt  *time.Time `json:"started_at"`
		FinishedAt *time.Time `json:"finished_at"`
		LogSize    int        `json:"log_size"`
	}

	jobRows, err := db.Pool.Query(ctx,
		`SELECT id, name, status, exit_code,
		        started_at, finished_at,
		        length(logs) AS log_size
		 FROM pipeline_jobs WHERE run_id=$1
		 ORDER BY created_at ASC`,
		runID,
	)
	if err != nil {
		utils.InternalError(c, err)
		return
	}
	defer jobRows.Close()

	jobs := []jobSummary{}
	for jobRows.Next() {
		var j jobSummary
		if err := jobRows.Scan(
			&j.ID, &j.Name, &j.Status, &j.ExitCode,
			&j.StartedAt, &j.FinishedAt, &j.LogSize,
		); err != nil {
			utils.InternalError(c, err)
			return
		}
		jobs = append(jobs, j)
	}

	utils.OK(c, gin.H{
		"id":            r.ID,
		"pipeline_id":   r.PipelineID,
		"project_id":    r.ProjectID,
		"status":        r.Status,
		"trigger_type":  r.TriggerType,
		"trigger_actor": r.TriggerActor,
		"commit_sha":    r.CommitSHA,
		"branch":        r.Branch,
		"started_at":    r.StartedAt,
		"finished_at":   r.FinishedAt,
		"created_at":    r.CreatedAt,
		"jobs":          jobs,
	})
}

func CancelRun(c *gin.Context) {
	ctx := context.Background()
	project, ok := verifyProjectAccess(c)
	if !ok {
		return
	}

	runID := c.Param("runId")

	var status string
	err := db.Pool.QueryRow(ctx,
		`SELECT status FROM pipeline_runs WHERE id=$1 AND project_id=$2`,
		runID, project.ID,
	).Scan(&status)
	if err != nil {
		utils.NotFound(c, "Run not found")
		return
	}
	if status != "queued" && status != "running" {
		utils.Conflict(c, "Run cannot be cancelled")
		return
	}

	db.Pool.Exec(ctx,
		`UPDATE pipeline_runs SET status='cancelled', finished_at=NOW() WHERE id=$1`,
		runID,
	)
	db.Pool.Exec(ctx,
		`UPDATE pipeline_jobs SET status='cancelled'
		 WHERE run_id=$1 AND status IN ('pending','running')`,
		runID,
	)

	utils.OK(c, gin.H{"message": "Run cancelled"})
}

func TriggerPipeline(c *gin.Context) {
	ctx := context.Background()
	project, ok := verifyProjectAccess(c)
	if !ok {
		return
	}
	userID := c.GetString("userID")

	pipelineID := c.Param("pid")

	// Verify pipeline exists and belongs to project
	var pipelineName string
	err := db.Pool.QueryRow(ctx,
		`SELECT name FROM pipelines WHERE id=$1 AND project_id=$2`,
		pipelineID, project.ID,
	).Scan(&pipelineName)
	if err != nil {
		utils.NotFound(c, "Pipeline not found")
		return
	}

	var body struct {
		Branch *string `json:"branch"`
	}
	c.ShouldBindJSON(&body)

	branch := project.DefaultBranch
	if body.Branch != nil && *body.Branch != "" {
		branch = *body.Branch
	}

	runID := uuid.New().String()
	_, err = db.Pool.Exec(ctx,
		`INSERT INTO pipeline_runs
		   (id, pipeline_id, project_id, status,
		    trigger_type, trigger_actor, branch)
		 VALUES ($1,$2,$3,'queued','manual',$4,$5)`,
		runID, pipelineID, project.ID, userID, branch,
	)
	if err != nil {
		utils.InternalError(c, err)
		return
	}

	pipeline.TriggerRun(runID)

	utils.Created(c, gin.H{
		"run_id":  runID,
		"message": "Pipeline triggered",
	})
}

// ─────────────────────────────────────────────────────
// SSE LOG STREAMING
// ─────────────────────────────────────────────────────

func StreamJobLogs(c *gin.Context) {
	ctx := context.Background()
	project, ok := verifyProjectAccess(c)
	if !ok {
		return
	}

	runID := c.Param("runId")
	jobID := c.Param("jobId")

	// Verify job belongs to this run and project
	type jobInfo struct {
		Status string
		Logs   string
	}
	var job jobInfo

	err := db.Pool.QueryRow(ctx,
		`SELECT pj.status, COALESCE(pj.logs, '')
		 FROM pipeline_jobs pj
		 JOIN pipeline_runs pr ON pr.id = pj.run_id
		 WHERE pj.id=$1 AND pj.run_id=$2 AND pr.project_id=$3`,
		jobID, runID, project.ID,
	).Scan(&job.Status, &job.Logs)
	if err != nil {
		utils.NotFound(c, "Job not found")
		return
	}

	// Set SSE headers
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")

	finished := func(s string) bool {
		return s == "passed" || s == "failed" || s == "cancelled" || s == "skipped"
	}

	// If already finished, send all logs and close
	if finished(job.Status) {
		fmt.Fprintf(c.Writer, "data: %s\n\n", job.Logs)
		c.Writer.Flush()
		return
	}

	// Stream live: poll every second
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()

	timeout := time.After(30 * time.Minute)
	sent := len(job.Logs) // bytes already sent

	// Send whatever we already have
	if sent > 0 {
		fmt.Fprintf(c.Writer, "data: %s\n\n", job.Logs)
		c.Writer.Flush()
	}

	reqCtx := c.Request.Context()

	for {
		select {
		case <-reqCtx.Done():
			return
		case <-timeout:
			return
		case <-ticker.C:
			var currentLogs, currentStatus string
			db.Pool.QueryRow(context.Background(),
				`SELECT COALESCE(logs,''), status FROM pipeline_jobs WHERE id=$1`,
				jobID,
			).Scan(&currentLogs, &currentStatus)

			// Send new content since last position
			if len(currentLogs) > sent {
				newContent := currentLogs[sent:]
				fmt.Fprintf(c.Writer, "data: %s\n\n", newContent)
				c.Writer.Flush()
				sent = len(currentLogs)
			}

			if finished(currentStatus) {
				fmt.Fprintf(c.Writer, "event: done\ndata: %s\n\n", currentStatus)
				c.Writer.Flush()
				return
			}
		}
	}
}
