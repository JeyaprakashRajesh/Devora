package handlers

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"log"
	"os"
	"strings"

	"github.com/devora/devora/internal/db"
	"github.com/devora/devora/internal/pipeline"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

func GiteaWebhook(c *gin.Context) {
	// 1. Read raw body
	body, err := io.ReadAll(c.Request.Body)
	if err != nil {
		c.JSON(400, gin.H{"error": "Cannot read body"})
		return
	}

	// 2. Verify HMAC-SHA256 signature
	secret := os.Getenv("WEBHOOK_SECRET")
	if secret != "" {
		sig := c.GetHeader("X-Gitea-Signature")
		mac := hmac.New(sha256.New, []byte(secret))
		mac.Write(body)
		expected := hex.EncodeToString(mac.Sum(nil))
		if !hmac.Equal([]byte(sig), []byte(expected)) {
			c.JSON(401, gin.H{"error": "Invalid signature"})
			return
		}
	}

	// 3. Parse event type
	event := c.GetHeader("X-Gitea-Event")

	// 4. Parse payload
	var payload map[string]interface{}
	if err := json.Unmarshal(body, &payload); err != nil {
		c.JSON(400, gin.H{"error": "Invalid JSON"})
		return
	}

	switch event {
	case "push":
		handlePushEvent(payload)
	case "pull_request":
		handlePREvent(payload)
	}

	c.JSON(200, gin.H{"ok": true})
}

func handlePushEvent(payload map[string]interface{}) {
	ctx := context.Background()

	// Extract repo ID from payload
	repo, _ := payload["repository"].(map[string]interface{})
	repoIDFloat, _ := repo["id"].(float64)
	repoID := int64(repoIDFloat)

	// Extract branch from ref (e.g. "refs/heads/main" → "main")
	ref, _ := payload["ref"].(string)
	branch := strings.TrimPrefix(ref, "refs/heads/")

	// Extract commit SHA
	after, _ := payload["after"].(string)

	// Find project by gitea_repo_id
	var projectID string
	err := db.Pool.QueryRow(ctx,
		`SELECT id FROM projects WHERE gitea_repo_id=$1`,
		repoID,
	).Scan(&projectID)
	if err != nil {
		return // project not found — ignore
	}

	// Find pipelines that match this project
	rows, err := db.Pool.Query(ctx,
		`SELECT id, definition, trigger FROM pipelines WHERE project_id=$1`,
		projectID,
	)
	if err != nil {
		log.Printf("handlePushEvent: query pipelines failed: %v", err)
		return
	}
	defer rows.Close()

	for rows.Next() {
		var pipelineID string
		var definition, trigger []byte
		if err := rows.Scan(&pipelineID, &definition, &trigger); err != nil {
			continue
		}

		// Parse trigger to check if this branch matches
		var triggerMap map[string]interface{}
		json.Unmarshal(trigger, &triggerMap)

		if matchesPushTrigger(triggerMap, branch) {
			runID := uuid.New().String()
			_, dbErr := db.Pool.Exec(ctx,
				`INSERT INTO pipeline_runs
				   (id, pipeline_id, project_id, status,
				    trigger_type, commit_sha, branch)
				 VALUES ($1,$2,$3,'queued','push',$4,$5)`,
				runID, pipelineID, projectID, after, branch,
			)
			if dbErr != nil {
				log.Printf("handlePushEvent: insert pipeline_run failed: %v", dbErr)
			} else {
				pipeline.TriggerRun(runID)
			}
		}
	}
}

func handlePREvent(payload map[string]interface{}) {
	ctx := context.Background()

	// Extract PR number and action
	action, _ := payload["action"].(string)
	pr, _ := payload["pull_request"].(map[string]interface{})
	prNumFloat, _ := pr["number"].(float64)
	prNum := int(prNumFloat)

	// Extract repo ID
	repo, _ := payload["repository"].(map[string]interface{})
	repoIDFloat, _ := repo["id"].(float64)
	repoID := int64(repoIDFloat)

	// Find project
	var projectID string
	err := db.Pool.QueryRow(ctx,
		`SELECT id FROM projects WHERE gitea_repo_id=$1`,
		repoID,
	).Scan(&projectID)
	if err != nil {
		return
	}

	// Sync MR status based on action
	var status string
	switch action {
	case "closed":
		merged, _ := pr["merged"].(bool)
		if merged {
			status = "merged"
		} else {
			status = "closed"
		}
	case "reopened":
		status = "open"
	default:
		return
	}

	if _, err := db.Pool.Exec(ctx,
		`UPDATE merge_requests SET status=$1, updated_at=NOW()
		 WHERE project_id=$2 AND gitea_pr_id=$3`,
		status, projectID, prNum,
	); err != nil {
		log.Printf("handlePREvent: update merge_requests failed: %v", err)
	}
}

func matchesPushTrigger(trigger map[string]interface{}, branch string) bool {
	on, ok := trigger["on"].(map[string]interface{})
	if !ok {
		return false
	}
	pushConf, ok := on["push"].(map[string]interface{})
	if !ok {
		return false
	}
	branches, ok := pushConf["branches"].([]interface{})
	if !ok {
		return true // no branch filter — match all
	}
	for _, b := range branches {
		bStr, _ := b.(string)
		if bStr == branch || bStr == "*" {
			return true
		}
	}
	return false
}
