package pipeline

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/devora/devora/internal/activity"
	"github.com/devora/devora/internal/db"
	"github.com/google/uuid"
)

// sem limits concurrent pipeline runs to 3.
var sem = make(chan struct{}, 3)

// PipelineDefinition matches the JSON structure stored in the DB definition column.
type PipelineDefinition struct {
	Name string                   `json:"name"`
	On   map[string]interface{}   `json:"on"`
	Jobs map[string]JobDefinition `json:"jobs"`
}

type JobDefinition struct {
	Image string            `json:"image"`
	Needs []string          `json:"needs"`
	Steps []StepDefinition  `json:"steps"`
	Env   map[string]string `json:"env"`
}

type StepDefinition struct {
	Name string `json:"name"`
	Run  string `json:"run"`
}

// TriggerRun enqueues a pipeline run for asynchronous execution.
func TriggerRun(runID string) {
	go executeRun(runID)
}

func executeRun(runID string) {
	// Acquire semaphore — blocks if 3 runs already active
	sem <- struct{}{}
	defer func() { <-sem }()

	ctx := context.Background()

	// ── Load run from DB ──
	var (
		runID2          string
		runProjectID    string
		runPipelineID   *string
		runCommitSHA    *string
		runBranch       *string
		runTriggerActor *string
		definitionBytes []byte
		cloneURL        *string
	)

	err := db.Pool.QueryRow(ctx,
		`SELECT r.id, r.pipeline_id, r.project_id,
		        r.commit_sha, r.branch, r.trigger_actor,
		        p.definition,
		        proj.gitea_clone_url
		 FROM pipeline_runs r
		 JOIN pipelines p ON p.id = r.pipeline_id
		 JOIN projects proj ON proj.id = r.project_id
		 WHERE r.id = $1`,
		runID,
	).Scan(
		&runID2, &runPipelineID, &runProjectID,
		&runCommitSHA, &runBranch, &runTriggerActor,
		&definitionBytes, &cloneURL,
	)
	if err != nil {
		log.Printf("pipeline: failed to load run %s: %v", runID, err)
		return
	}

	// ── Mark run as running ──
	db.Pool.Exec(ctx,
		`UPDATE pipeline_runs SET status='running', started_at=NOW() WHERE id=$1`,
		runID,
	)

	// ── Parse pipeline definition ──
	var def PipelineDefinition
	if err := json.Unmarshal(definitionBytes, &def); err != nil {
		markRunFailed(runID, "Invalid pipeline definition: "+err.Error())
		return
	}

	// ── Clone repo ──
	buildDir := filepath.Join(os.TempDir(), "devora-build", runID)
	defer RemoveDir(buildDir)

	if cloneURL != nil && *cloneURL != "" {
		cloneTarget := withGiteaCredentials(*cloneURL)
		log.Printf("pipeline: cloning %s into %s", cloneTarget, buildDir)
		if err := CloneRepo(cloneTarget, stringVal(runCommitSHA), buildDir); err != nil {
			markRunFailed(runID, "Git clone failed: "+err.Error())
			return
		}
	} else {
		// No repo — create empty working dir so steps can still run
		if err := os.MkdirAll(buildDir, 0755); err != nil {
			markRunFailed(runID, "Failed to create build dir: "+err.Error())
			return
		}
	}

	// ── Base environment variables ──
	baseEnv := map[string]string{
		"CI":         "true",
		"PROJECT_ID": runProjectID,
		"BRANCH":     stringVal(runBranch),
		"COMMIT_SHA": stringVal(runCommitSHA),
	}

	// ── Topological sort (respects needs:) ──
	orderedJobs, err := topoSort(def.Jobs)
	if err != nil {
		markRunFailed(runID, "Pipeline has circular dependencies: "+err.Error())
		return
	}

	// ── Create job records in DB ──
	jobIDs := make(map[string]string, len(orderedJobs))
	for _, jobName := range orderedJobs {
		jobID := uuid.New().String()
		jobIDs[jobName] = jobID
		db.Pool.Exec(ctx,
			`INSERT INTO pipeline_jobs (id, run_id, name, status)
			 VALUES ($1, $2, $3, 'pending')`,
			jobID, runID, jobName,
		)
	}

	// ── Execute jobs in topological order ──
	runFailed := false
	for _, jobName := range orderedJobs {
		// Check if the run has been cancelled between jobs
		var currentStatus string
		_ = db.Pool.QueryRow(ctx,
			`SELECT status FROM pipeline_runs WHERE id=$1`, runID,
		).Scan(&currentStatus)
		if currentStatus == "cancelled" {
			db.Pool.Exec(ctx,
				`UPDATE pipeline_jobs SET status='cancelled' WHERE run_id=$1 AND status='pending'`,
				runID,
			)
			return
		}

		if runFailed {
			// Skip remaining jobs
			db.Pool.Exec(ctx,
				`UPDATE pipeline_jobs SET status='skipped' WHERE id=$1`,
				jobIDs[jobName],
			)
			continue
		}

		exitCode := executeJob(ctx, runID, jobIDs[jobName], jobName,
			def.Jobs[jobName], buildDir, baseEnv)
		if exitCode != 0 {
			runFailed = true
		}
	}

	// ── Mark run complete ──
	finalStatus := "passed"
	if runFailed {
		finalStatus = "failed"
	}

	db.Pool.Exec(ctx,
		`UPDATE pipeline_runs SET status=$1, finished_at=NOW() WHERE id=$2 AND status != 'cancelled'`,
		finalStatus, runID,
	)

	// ── Write activity log ──
	actorID := stringVal(runTriggerActor)
	activity.Log(runProjectID, actorID,
		"pipeline."+finalStatus,
		map[string]interface{}{
			"run_id": runID,
			"status": finalStatus,
			"branch": stringVal(runBranch),
		},
	)

	log.Printf("pipeline: run %s finished with status %s", runID, finalStatus)
}

func withGiteaCredentials(cloneURL string) string {
	u, err := url.Parse(cloneURL)
	if err != nil {
		return cloneURL
	}
	if u.User != nil {
		return cloneURL
	}
	user := os.Getenv("GITEA_ADMIN_USER")
	pass := os.Getenv("GITEA_ADMIN_PASSWORD")
	if user == "" || pass == "" {
		return cloneURL
	}
	u.User = url.UserPassword(user, pass)
	return u.String()
}

func executeJob(
	ctx context.Context,
	runID, jobID, jobName string,
	jobDef JobDefinition,
	buildDir string,
	baseEnv map[string]string,
) int {
	// ── Mark job running ──
	db.Pool.Exec(ctx,
		`UPDATE pipeline_jobs SET status='running', started_at=NOW() WHERE id=$1`,
		jobID,
	)

	image := jobDef.Image
	if image == "" {
		image = "ubuntu:22.04"
	}

	// Pull image before running
	log.Printf("pipeline: pulling image %s for job %s", image, jobName)
	if err := PullImage(image); err != nil {
		appendLog(ctx, jobID, "ERROR pulling image: "+err.Error())
		markJobFailed(ctx, jobID, -1)
		return -1
	}

	// Build combined step command (all steps joined with &&)
	stepCmds := make([]string, 0, len(jobDef.Steps))
	for _, step := range jobDef.Steps {
		appendLog(ctx, jobID, fmt.Sprintf("─── Step: %s ───", step.Name))
		stepCmds = append(stepCmds, step.Run)
	}
	fullCmd := strings.Join(stepCmds, " && ")

	// Merge env vars (job-level overrides base)
	env := make(map[string]string, len(baseEnv)+len(jobDef.Env))
	for k, v := range baseEnv {
		env[k] = v
	}
	for k, v := range jobDef.Env {
		env[k] = v
	}

	// ── Stream container output ──
	var (
		mu        sync.Mutex
		logBuffer []string
		lineCount int
	)

	exitCode, err := RunContainer(image, fullCmd, buildDir, env, func(line string) {
		mu.Lock()
		logBuffer = append(logBuffer, line)
		lineCount++
		flush := lineCount%10 == 0
		var toFlush []string
		if flush {
			toFlush = logBuffer
			logBuffer = nil
		}
		mu.Unlock()

		if flush {
			flushLogs(ctx, jobID, toFlush)
		}
	})

	// Final flush of any buffered lines
	mu.Lock()
	remaining := logBuffer
	mu.Unlock()
	flushLogs(ctx, jobID, remaining)

	if err != nil {
		appendLog(ctx, jobID, "ERROR: "+err.Error())
		markJobFailed(ctx, jobID, -1)
		return -1
	}

	// ── Update job final status ──
	status := "passed"
	if exitCode != 0 {
		status = "failed"
	}
	db.Pool.Exec(ctx,
		`UPDATE pipeline_jobs
		 SET status=$1, exit_code=$2, finished_at=NOW()
		 WHERE id=$3`,
		status, exitCode, jobID,
	)

	return exitCode
}

func flushLogs(ctx context.Context, jobID string, lines []string) {
	if len(lines) == 0 {
		return
	}
	text := strings.Join(lines, "\n") + "\n"
	db.Pool.Exec(ctx,
		`UPDATE pipeline_jobs SET logs = logs || $1 WHERE id=$2`,
		text, jobID,
	)
}

func appendLog(ctx context.Context, jobID, line string) {
	db.Pool.Exec(ctx,
		`UPDATE pipeline_jobs SET logs = logs || $1 WHERE id=$2`,
		line+"\n", jobID,
	)
}

func markRunFailed(runID, reason string) {
	db.Pool.Exec(context.Background(),
		`UPDATE pipeline_runs SET status='failed', finished_at=NOW() WHERE id=$1`,
		runID,
	)
	log.Printf("pipeline: run %s failed: %s", runID, reason)
}

func markJobFailed(ctx context.Context, jobID string, exitCode int) {
	db.Pool.Exec(ctx,
		`UPDATE pipeline_jobs
		 SET status='failed', exit_code=$1, finished_at=NOW()
		 WHERE id=$2`,
		exitCode, jobID,
	)
}

// topoSort returns job names in dependency order using DFS.
func topoSort(jobs map[string]JobDefinition) ([]string, error) {
	visited := map[string]bool{}
	inStack := map[string]bool{}
	result := []string{}

	var visit func(name string) error
	visit = func(name string) error {
		if inStack[name] {
			return fmt.Errorf("circular dependency at job: %s", name)
		}
		if visited[name] {
			return nil
		}
		inStack[name] = true
		job := jobs[name]
		for _, dep := range job.Needs {
			if _, ok := jobs[dep]; !ok {
				return fmt.Errorf("job %q depends on unknown job %q", name, dep)
			}
			if err := visit(dep); err != nil {
				return err
			}
		}
		inStack[name] = false
		visited[name] = true
		result = append(result, name)
		return nil
	}

	for name := range jobs {
		if err := visit(name); err != nil {
			return nil, err
		}
	}
	return result, nil
}

func stringVal(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

// runID2 suppresses the unused variable warning for the scanned run ID.
var _ = fmt.Sprintf
