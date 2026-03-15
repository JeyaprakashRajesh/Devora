package db

import (
  "context"
  "log"
  "os"

  "github.com/jackc/pgx/v5/pgxpool"
)

var Pool *pgxpool.Pool

func ensureSchemaCompatibility(ctx context.Context) error {
  statements := []string{
    `ALTER TABLE users
      ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS onboarding_complete BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS job_title TEXT,
      ADD COLUMN IF NOT EXISTS avatar_url TEXT`,
    `UPDATE users
     SET must_change_password = TRUE
     WHERE status = 'invited' AND must_change_password IS DISTINCT FROM TRUE`,
    // Only create these tables if projects already exists (existing DB upgrade path).
    // Fresh DBs have them created in the correct order by init.sql.
    `DO $mig$
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='projects')
         AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='project_permissions')
      THEN
        CREATE TABLE project_permissions (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          description TEXT,
          project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
          access_level TEXT NOT NULL CHECK (access_level IN ('read', 'write', 'full')),
          created_by UUID REFERENCES users(id),
          created_at TIMESTAMPTZ DEFAULT NOW(),
          UNIQUE(org_id, name)
        );
        CREATE TABLE group_permissions (
          group_id UUID NOT NULL REFERENCES user_groups(id) ON DELETE CASCADE,
          permission_id UUID NOT NULL REFERENCES project_permissions(id) ON DELETE CASCADE,
          PRIMARY KEY (group_id, permission_id)
        );
        CREATE TABLE user_permissions (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          permission_id UUID NOT NULL REFERENCES project_permissions(id) ON DELETE CASCADE,
          granted_by UUID REFERENCES users(id),
          granted_at TIMESTAMPTZ DEFAULT NOW(),
          UNIQUE(user_id, permission_id)
        );
      END IF;
    END $mig$`,
  }

  for _, statement := range statements {
    if _, err := Pool.Exec(ctx, statement); err != nil {
      return err
    }
  }

  return nil
}

func Connect() {
  ctx := context.Background()

  var err error
  Pool, err = pgxpool.New(ctx, os.Getenv("DATABASE_URL"))
  if err != nil {
    log.Fatalf("DB connect failed: %v", err)
  }
  if err = Pool.Ping(ctx); err != nil {
    log.Fatalf("DB ping failed: %v", err)
  }
  if err = ensureSchemaCompatibility(ctx); err != nil {
    log.Fatalf("DB compatibility migration failed: %v", err)
  }
  log.Println("Connected to PostgreSQL")
}
