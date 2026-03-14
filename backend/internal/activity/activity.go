package activity

import (
	"context"
	"encoding/json"

	"github.com/devora/devora/internal/db"
	"github.com/google/uuid"
)

func Log(projectID, actorID, activityType string, metadata map[string]interface{}) {
	metaBytes, _ := json.Marshal(metadata)
	_, _ = db.Pool.Exec(
		context.Background(),
		`INSERT INTO project_activity
		   (id, project_id, actor_id, type, metadata)
		 VALUES ($1, $2, $3, $4, $5)`,
		uuid.New().String(),
		projectID,
		actorID,
		activityType,
		string(metaBytes),
	)
}