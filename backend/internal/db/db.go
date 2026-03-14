package db

import (
  "context"
  "log"
  "os"
  "github.com/jackc/pgx/v5/pgxpool"
)

var Pool *pgxpool.Pool

func Connect() {
  var err error
  Pool, err = pgxpool.New(context.Background(), os.Getenv("DATABASE_URL"))
  if err != nil {
    log.Fatalf("DB connect failed: %v", err)
  }
  if err = Pool.Ping(context.Background()); err != nil {
    log.Fatalf("DB ping failed: %v", err)
  }
  log.Println("Connected to PostgreSQL")
}
