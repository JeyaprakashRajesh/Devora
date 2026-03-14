# DEVORA — AI Agent Implementation Plan

> **Stack:** React 18 + Vite + Tailwind · Go 1.22 · PostgreSQL 16 · Docker Compose
> **Architecture:** 3 containers. One docker-compose.yml. No microservices. Simple.

<!--
HOW TO USE THIS FILE
1. Read the entire file before writing any code.
2. Find the first task where the checkbox is [ ] (unchecked).
3. Re-read all [x] completed tasks above it first — understand what exists.
4. Implement the task fully.
5. Verify every line in PASS CRITERIA.
6. Mark [x] only when ALL pass criteria pass.
7. Move to the next [ ] task.
RULES: Never skip. Never reorder. Stop and report if blocked.
       Extend existing files — never recreate them.
       Every colour must use a CSS variable. No hardcoded hex.
-->

---

## ARCHITECTURE

```
frontend (React+nginx :3000) --> backend (Go+Gin :4000) --> storage (PostgreSQL :5432)
                                      |
                                      +--> gitea (:3001)  [Phase 2]
                                      +--> ide / code-server (:8080)  [Phase 3]
                                      +--> Docker socket (host deployments)
```

## COLOUR TOKENS — Obsidian Amber Theme

```css
/* dark :root[data-theme="dark"] */
--bg-base:#0c0a07;        /* warm near-black — page background */
--bg-surface:#141209;     /* warm dark brown — cards, sidebar */
--bg-elevated:#1c1813;    /* dropdowns, modals */
--bg-subtle:#231e17;      /* hover states, input backgrounds */
--border:#2e2720;         /* warm dark border */
--border-strong:#46392c;  /* active/focus border */
--text-primary:#fdf6ee;   /* warm white */
--text-secondary:#b8a898; /* warm grey */
--text-muted:#6b5a4e;     /* muted warm brown */

/* light :root[data-theme="light"] */
--bg-base:#fdfaf6;        /* warm off-white */
--bg-surface:#f7f2eb;     /* warm light surface */
--bg-elevated:#efe8dc;    /* warm elevated */
--bg-subtle:#e5ddd2;      /* warm hover */
--border:#d4c9bb;         /* warm light border */
--border-strong:#b8a898;  /* warm strong border */
--text-primary:#1a1410;   /* warm near-black */
--text-secondary:#5c4f44; /* warm dark grey */
--text-muted:#9c8878;     /* warm muted */

/* accents — same both themes */
--accent-primary:#f59e0b;  /* amber/gold — primary actions, buttons, links */
--accent-amber:#f59e0b;    /* same as primary — use for highlights, badges */
--accent-blue:#3b82f6;     /* cool blue — contrast accent, info */
--accent-green:#10b981;    /* emerald — success, live, passed */
--accent-red:#ef4444;      /* red — error, failed, destructive */
--accent-violet:#8b5cf6;   /* violet — AI features, IDE */
--accent-cyan:#06b6d4;     /* cyan — deployments, targets */

/* amber glow — for hover/active states on primary elements */
--accent-amber-glow:#f59e0b22;
--accent-amber-subtle:#f59e0b15;
--accent-blue-subtle:#3b82f615;
--accent-green-subtle:#10b98115;
--accent-red-subtle:#ef444415;
```

Typography: Inter (UI) · JetBrains Mono (code/IDs) · Base 13px

**Colour usage guide for AI:**
- Primary buttons, active nav, links → `var(--accent-amber)`
- Hover glow on primary elements → `var(--accent-amber-glow)`
- Success states, pipeline passed, online → `var(--accent-green)`
- Error states, failed builds, destructive → `var(--accent-red)`
- Info, secondary actions → `var(--accent-blue)`
- AI/IDE features → `var(--accent-violet)`
- Deployment indicators → `var(--accent-cyan)`
- All backgrounds, borders, text → warm brown-tinted tokens above

---

## GLOBAL PASS CRITERIA (must stay true after every task)

- [ ] `docker compose up --build` starts all containers with no errors
- [ ] `GET http://localhost:4000/health` returns `{"status":"ok"}`
- [ ] `http://localhost:3000` loads without console errors
- [ ] `tsc --noEmit` passes in frontend
- [ ] `go build ./...` passes in backend

---
---

# PHASE 1 — Complete RBAC System

**Goal:** Auth, org management, users, AWS-style custom role/permission toggles per resource.
**Complete when:** Admin registers org, invites user, creates custom role with toggled permissions, assigns it, and that user's API access is correctly restricted.

---

## TASK 1-01 — Project Scaffold & Docker Compose

**Context:** Nothing exists. Create the full folder structure and compose setup.

### Structure
```
devora/
├── docker-compose.yml
├── frontend/
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── package.json        (React 18, Vite, Tailwind, Zustand, React Query v5, axios, lucide-react, @dnd-kit/core)
│   ├── vite.config.ts
│   ├── tailwind.config.ts  (extend theme: bg-base, bg-surface, bg-elevated, bg-subtle, border, border-strong, text-primary, text-secondary, text-muted, accent-primary, accent-amber, accent-blue, accent-green, accent-red, accent-violet, accent-cyan, accent-amber-glow, accent-amber-subtle as CSS var utilities. fontFamily: sans=Inter mono=JetBrains Mono. borderRadius: DEFAULT=4px md=6px lg=10px)
│   ├── tsconfig.json
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       └── index.css       (CSS variables for both themes + Tailwind directives)
├── backend/
│   ├── Dockerfile
│   ├── go.mod              (module: github.com/devora/devora, go 1.22)
│   └── cmd/server/main.go  (skeleton: Gin + CORS + /health)
└── storage/
    ├── Dockerfile           (FROM postgres:16-alpine)
    └── init.sql             (empty — populated in Task 1-02)
```

### docker-compose.yml
```yaml
version: '3.9'
services:
  storage:
    build: ./storage
    environment:
      POSTGRES_DB: devora
      POSTGRES_USER: devora
      POSTGRES_PASSWORD: devora_secret
    ports: ['5432:5432']
    volumes: [pg_data:/var/lib/postgresql/data]
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U devora']
      interval: 5s
      retries: 5
  backend:
    build: ./backend
    ports: ['4000:4000']
    environment:
      DATABASE_URL: postgres://devora:devora_secret@storage:5432/devora?sslmode=disable
      JWT_SECRET: change_this_min_32_chars_in_production
      PORT: "4000"
      FRONTEND_URL: http://localhost:3000
      GITEA_URL: http://gitea:3001
      GITEA_ADMIN_USER: devora_admin
      GITEA_ADMIN_PASSWORD: devora_admin_secret
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    depends_on:
      storage:
        condition: service_healthy
  frontend:
    build: ./frontend
    ports: ['3000:3000']
    depends_on: [backend]
volumes:
  pg_data:
```

### go.mod dependencies
```
github.com/gin-gonic/gin v1.10.0
github.com/gin-contrib/cors v1.7.2
github.com/golang-jwt/jwt/v5 v5.2.1
github.com/jackc/pgx/v5 v5.6.0
github.com/google/uuid v1.6.0
golang.org/x/crypto v0.24.0
```

### frontend/src/index.css
```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
@tailwind base;
@tailwind components;
@tailwind utilities;

/* ── OBSIDIAN AMBER — Dark Mode ── */
:root[data-theme="dark"] {
  --bg-base:            #0c0a07;
  --bg-surface:         #141209;
  --bg-elevated:        #1c1813;
  --bg-subtle:          #231e17;
  --border:             #2e2720;
  --border-strong:      #46392c;
  --text-primary:       #fdf6ee;
  --text-secondary:     #b8a898;
  --text-muted:         #6b5a4e;
  --accent-primary:     #f59e0b;
  --accent-amber:       #f59e0b;
  --accent-blue:        #3b82f6;
  --accent-green:       #10b981;
  --accent-red:         #ef4444;
  --accent-violet:      #8b5cf6;
  --accent-cyan:        #06b6d4;
  --accent-amber-glow:  #f59e0b22;
  --accent-amber-subtle:#f59e0b15;
  --accent-blue-subtle: #3b82f615;
  --accent-green-subtle:#10b98115;
  --accent-red-subtle:  #ef444415;
}

/* ── OBSIDIAN AMBER — Light Mode ── */
:root[data-theme="light"] {
  --bg-base:            #fdfaf6;
  --bg-surface:         #f7f2eb;
  --bg-elevated:        #efe8dc;
  --bg-subtle:          #e5ddd2;
  --border:             #d4c9bb;
  --border-strong:      #b8a898;
  --text-primary:       #1a1410;
  --text-secondary:     #5c4f44;
  --text-muted:         #9c8878;
  --accent-primary:     #d97706;
  --accent-amber:       #d97706;
  --accent-blue:        #2563eb;
  --accent-green:       #059669;
  --accent-red:         #dc2626;
  --accent-violet:      #7c3aed;
  --accent-cyan:        #0891b2;
  --accent-amber-glow:  #d9770622;
  --accent-amber-subtle:#d9770615;
  --accent-blue-subtle: #2563eb15;
  --accent-green-subtle:#05966915;
  --accent-red-subtle:  #dc262615;
}

* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  background: var(--bg-base);
  color: var(--text-primary);
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  line-height: 1.5;
}
code, pre, .mono { font-family: 'JetBrains Mono', monospace; }

/* Amber glow on focused inputs */
input:focus, textarea:focus, select:focus {
  outline: none;
  border-color: var(--accent-amber) !important;
  box-shadow: 0 0 0 3px var(--accent-amber-glow);
}

/* Scrollbar styling — matches warm theme */
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: var(--bg-base); }
::-webkit-scrollbar-thumb { background: var(--border-strong); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }
```

### frontend/tailwind.config.ts
```typescript
import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '4px',
        md: '6px',
        lg: '10px',
        full: '9999px',
      },
      colors: {
        // backgrounds
        'bg-base':        'var(--bg-base)',
        'bg-surface':     'var(--bg-surface)',
        'bg-elevated':    'var(--bg-elevated)',
        'bg-subtle':      'var(--bg-subtle)',
        // text
        'text-primary':   'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-muted':     'var(--text-muted)',
        // accents
        'accent-primary': 'var(--accent-primary)',
        'accent-amber':   'var(--accent-amber)',
        'accent-blue':    'var(--accent-blue)',
        'accent-green':   'var(--accent-green)',
        'accent-red':     'var(--accent-red)',
        'accent-violet':  'var(--accent-violet)',
        'accent-cyan':    'var(--accent-cyan)',
        'amber-glow':     'var(--accent-amber-glow)',
        'amber-subtle':   'var(--accent-amber-subtle)',
        'blue-subtle':    'var(--accent-blue-subtle)',
        'green-subtle':   'var(--accent-green-subtle)',
        'red-subtle':     'var(--accent-red-subtle)',
      },
      borderColor: {
        DEFAULT:  'var(--border)',
        strong:   'var(--border-strong)',
      },
    },
  },
  plugins: [],
} satisfies Config
```

### PASS CRITERIA
- [ ] `docker compose up --build` completes, all 3 containers running
- [ ] `GET http://localhost:4000/health` returns `{"status":"ok"}`
- [ ] `http://localhost:3000` loads blank React page, no console errors
- [ ] PostgreSQL accepting connections on port 5432

---

## TASK 1-02 — Database Schema

**Context:** Task 1-01 complete. Create full auth + RBAC schema in storage/init.sql.

### storage/init.sql (full contents)
```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL, slug TEXT UNIQUE NOT NULL, owner_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL, username TEXT NOT NULL, display_name TEXT,
  password_hash TEXT, status TEXT DEFAULT 'active' CHECK (status IN ('active','suspended','invited')),
  is_org_owner BOOLEAN DEFAULT FALSE, last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE organizations ADD CONSTRAINT fk_owner FOREIGN KEY (owner_id) REFERENCES users(id);

CREATE TABLE resources (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), name TEXT UNIQUE NOT NULL, label TEXT NOT NULL);
CREATE TABLE permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  resource_id UUID NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  action TEXT NOT NULL, label TEXT NOT NULL, description TEXT,
  UNIQUE(resource_id, action)
);
CREATE TABLE roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL, description TEXT, is_system BOOLEAN DEFAULT FALSE,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, name)
);
CREATE TABLE role_permissions (
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);
CREATE TABLE user_roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  resource_type TEXT, resource_id UUID,
  granted_by UUID REFERENCES users(id), expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE user_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL, description TEXT, created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(org_id, name)
);
CREATE TABLE user_group_members (
  group_id UUID NOT NULL REFERENCES user_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, user_id)
);
CREATE TABLE group_roles (
  group_id UUID NOT NULL REFERENCES user_groups(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, role_id)
);
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT UNIQUE NOT NULL, expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID REFERENCES organizations(id), actor_id UUID REFERENCES users(id),
  action TEXT NOT NULL, resource_type TEXT, resource_id UUID,
  metadata JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO resources (name, label) VALUES
  ('user','Users'),('role','Roles'),('group','User Groups'),
  ('project','Projects'),('repository','Repositories'),
  ('pipeline','Pipelines'),('deployment','Deployments'),('org','Organization');

INSERT INTO permissions (resource_id, action, label)
SELECT r.id, a.action, r.label || ' — ' || initcap(a.action)
FROM resources r
CROSS JOIN (VALUES ('create'),('read'),('update'),('delete'),('manage')) AS a(action);
```

### PASS CRITERIA
- [ ] `docker compose down -v && docker compose up --build` recreates schema cleanly
- [ ] `\dt` shows all 11 tables
- [ ] `SELECT COUNT(*) FROM resources` = 8
- [ ] `SELECT COUNT(*) FROM permissions` = 40

---

## TASK 1-03 — Go Backend Structure & DB Connection

**Context:** Tasks 1-01, 1-02 complete. Structure Go backend and connect to PostgreSQL.

### Directory structure
```
backend/
├── cmd/server/main.go          ← updated: registers all route groups
└── internal/
    ├── db/db.go                ← pgxpool connection
    ├── middleware/
    │   ├── auth.go             ← JWT verify, sets userID+orgID on gin context
    │   └── rbac.go             ← RequirePermission(resource, action) factory
    ├── models/models.go        ← Go structs for all DB tables
    ├── handlers/
    │   ├── auth.go
    │   ├── users.go
    │   ├── roles.go
    │   └── groups.go
    └── utils/
        ├── jwt.go
        ├── hash.go             ← bcrypt helpers
        └── response.go        ← OK, Created, BadRequest, Forbidden, etc.
```

### internal/db/db.go
```go
package db
import ("context";"log";"os";"github.com/jackc/pgx/v5/pgxpool")
var Pool *pgxpool.Pool
func Connect() {
  var err error
  Pool, err = pgxpool.New(context.Background(), os.Getenv("DATABASE_URL"))
  if err != nil { log.Fatalf("DB connect: %v", err) }
  if err = Pool.Ping(context.Background()); err != nil { log.Fatalf("DB ping: %v", err) }
  log.Println("Connected to PostgreSQL")
}
```

### internal/utils/response.go
```go
package utils
import "github.com/gin-gonic/gin"
func OK(c *gin.Context, data interface{})      { c.JSON(200, gin.H{"data": data}) }
func Created(c *gin.Context, data interface{}) { c.JSON(201, gin.H{"data": data}) }
func BadRequest(c *gin.Context, msg string)    { c.JSON(400, gin.H{"error": msg}) }
func Unauthorized(c *gin.Context)              { c.JSON(401, gin.H{"error": "Unauthorized"}) }
func Forbidden(c *gin.Context)                 { c.JSON(403, gin.H{"error": "Forbidden"}) }
func NotFound(c *gin.Context, msg string)      { c.JSON(404, gin.H{"error": msg}) }
func Conflict(c *gin.Context, msg string)      { c.JSON(409, gin.H{"error": msg}) }
func InternalError(c *gin.Context, _ error)    { c.JSON(500, gin.H{"error": "Internal server error"}) }
```

### PASS CRITERIA
- [ ] `go build ./...` succeeds
- [ ] Backend logs "Connected to PostgreSQL" on start
- [ ] All handler files exist (stubs returning 501 are fine)
- [ ] `GET /health` still returns `{"status":"ok"}`

---

## TASK 1-04 — Auth API

**Context:** Tasks 1-01 through 1-03 complete. Implement register, login, logout, /me.

### Endpoints
```
POST /api/auth/register   body: { org_name, org_slug, email, username, password }
POST /api/auth/login      body: { email, password }
POST /api/auth/logout
GET  /api/auth/me         requires auth middleware
```

### internal/utils/jwt.go
```go
package utils
import ("os";"time";"github.com/golang-jwt/jwt/v5")
type JWTClaims struct {
  UserID string `json:"sub"`
  OrgID  string `json:"org"`
  jwt.RegisteredClaims
}
func SignJWT(userID, orgID string) (string, error) {
  claims := JWTClaims{UserID: userID, OrgID: orgID,
    RegisteredClaims: jwt.RegisteredClaims{
      ExpiresAt: jwt.NewNumericDate(time.Now().Add(24*time.Hour)),
      IssuedAt:  jwt.NewNumericDate(time.Now()),
    }}
  return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(os.Getenv("JWT_SECRET")))
}
func VerifyJWT(tokenStr string) (*JWTClaims, error) {
  token, err := jwt.ParseWithClaims(tokenStr, &JWTClaims{}, func(t *jwt.Token) (interface{}, error) {
    return []byte(os.Getenv("JWT_SECRET")), nil
  })
  if err != nil || !token.Valid { return nil, err }
  return token.Claims.(*JWTClaims), nil
}
```

### POST /api/auth/register steps
```
1. Validate all fields present
2. Check org slug not taken → 409
3. Check email not taken → 409
4. bcrypt.GenerateFromPassword(password, 12)
5. INSERT organization (owner_id=NULL)
6. INSERT user (is_org_owner=true)
7. UPDATE organizations SET owner_id = user.id
8. Create 4 system roles (is_system=true):
     org_admin  → all 40 permissions
     developer  → project:read/create, repository:read/update, pipeline:read/create, deployment:read
     viewer     → project:read, repository:read, pipeline:read, deployment:read
     billing    → org:read, org:update
9. Assign org_admin role to user (INSERT user_roles, resource_type=NULL, resource_id=NULL)
10. SignJWT, INSERT session (store bcrypt hash of token)
11. Return { user, org, token }
```

### GET /api/auth/me steps
```
1. Get userID from gin context (set by auth middleware)
2. SELECT user, SELECT org
3. SELECT DISTINCT res.name || ':' || p.action
   FROM user_roles ur
   JOIN role_permissions rp ON rp.role_id = ur.role_id
   JOIN permissions p ON p.id = rp.permission_id
   JOIN resources res ON res.id = p.resource_id
   WHERE ur.user_id = $1
     AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
4. Return { user, org, permissions: ["project:create", ...] }
```

### internal/middleware/auth.go
```go
// Read Authorization: Bearer <token>
// Call utils.VerifyJWT
// Success: c.Set("userID", claims.UserID); c.Set("orgID", claims.OrgID); c.Next()
// Fail: utils.Unauthorized(c); c.Abort()
```

### PASS CRITERIA
- [ ] `POST /api/auth/register` valid body → creates org + user + 4 system roles + returns token
- [ ] Duplicate slug → 409
- [ ] Duplicate email → 409
- [ ] `POST /api/auth/login` correct credentials → token
- [ ] `POST /api/auth/login` wrong password → 401
- [ ] `GET /api/auth/me` valid token → user + org + permissions array
- [ ] `GET /api/auth/me` no token → 401
- [ ] org_admin role has all 40 permissions in DB

---

## TASK 1-05 — RBAC Permission Middleware

**Context:** Tasks 1-01 through 1-04 complete. Auth works. Build the permission check.

### internal/middleware/rbac.go
```go
// RequirePermission(resource, action string) gin.HandlerFunc
// Usage: r.DELETE("/users/:id", Auth(), RequirePermission("user","delete"), handler)
//
// 1. Get userID from gin context
// 2. Query:
//      SELECT COUNT(*) FROM user_roles ur
//      JOIN role_permissions rp ON rp.role_id = ur.role_id
//      JOIN permissions p ON p.id = rp.permission_id
//      JOIN resources res ON res.id = p.resource_id
//      WHERE ur.user_id = $1 AND res.name = $2
//        AND (p.action = $3 OR p.action = 'manage')
//        AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
// 3. count > 0: c.Next()
// 4. count = 0: utils.Forbidden(c); c.Abort()
//
// Cache results: sync.Map key="userID:resource:action", TTL 30s
// 'manage' action grants all other actions on that resource
```

### PASS CRITERIA
- [ ] `RequirePermission("user","delete")` returns 403 for developer role
- [ ] `RequirePermission("user","delete")` returns 200 for org_admin
- [ ] manage action grants sub-actions
- [ ] Expired role grant (expires_at in past) is blocked → 403
- [ ] Cache hit adds < 5ms latency

---

## TASK 1-06 — Users & Roles API

**Context:** Tasks 1-01 through 1-05 complete.

### User endpoints
```
GET    /api/users                     RequirePermission("user","read")
POST   /api/users/invite              RequirePermission("user","create")
GET    /api/users/:id                 RequirePermission("user","read")
PATCH  /api/users/:id                 RequirePermission("user","update")
DELETE /api/users/:id                 RequirePermission("user","delete")
GET    /api/users/:id/roles
POST   /api/users/:id/roles           RequirePermission("role","manage")
DELETE /api/users/:id/roles/:roleId   RequirePermission("role","manage")
```

### Role endpoints
```
GET    /api/roles                     RequirePermission("role","read")
POST   /api/roles                     RequirePermission("role","create")
GET    /api/roles/:id                 RequirePermission("role","read")
PATCH  /api/roles/:id                 RequirePermission("role","update")
DELETE /api/roles/:id                 RequirePermission("role","delete")
  block if is_system=true → 403 "System roles cannot be deleted"
GET    /api/roles/:id/permissions
PUT    /api/roles/:id/permissions     RequirePermission("role","update")
  body: { permission_ids: ["uuid",...] }
  atomic tx: DELETE all existing, INSERT new ones
PATCH  /api/roles/:id/permissions/:permId  toggle single on/off

GET /api/permissions    returns all 40 permissions grouped by 8 resources
  shape: { data: [{ resource: {id,name,label}, permissions: [{id,action,label},...] }, ...] }
```

### PASS CRITERIA
- [ ] `GET /api/users` returns only users in same org
- [ ] `POST /api/users/invite` creates user with status='invited'
- [ ] `POST /api/roles` creates role with zero permissions
- [ ] `PUT /api/roles/:id/permissions` replaces permissions atomically in one transaction
- [ ] `PATCH /api/roles/:id/permissions/:permId` toggles single permission
- [ ] Cannot delete system role → 403
- [ ] User cannot modify own roles → 403
- [ ] `GET /api/permissions` returns 8 groups × 5 permissions = 40 total

---

## TASK 1-07 — User Groups API

**Context:** Tasks 1-01 through 1-06 complete.

### Endpoints
```
GET    /api/groups                      RequirePermission("group","read")
POST   /api/groups                      RequirePermission("group","create")
GET    /api/groups/:id
PATCH  /api/groups/:id                  RequirePermission("group","update")
DELETE /api/groups/:id                  RequirePermission("group","delete")
POST   /api/groups/:id/members          RequirePermission("group","manage")
DELETE /api/groups/:id/members/:userId  RequirePermission("group","manage")
POST   /api/groups/:id/roles            RequirePermission("role","manage")
DELETE /api/groups/:id/roles/:roleId    RequirePermission("role","manage")
```

### Group role inheritance rules
```
Assign role to group:
  INSERT group_roles
  INSERT user_roles for every current group member

Add user to group:
  INSERT user_group_members
  INSERT user_roles for every role the group has

Remove user from group:
  DELETE user_group_members
  DELETE user_roles where role came from this group membership
  Keep directly-assigned roles untouched
```

### PASS CRITERIA
- [ ] Assigning role to group propagates to all current members
- [ ] New user added to group inherits group roles
- [ ] Removing user removes group-inherited roles only
- [ ] `GET /api/groups/:id` returns member count and member list

---

## TASK 1-08 — Frontend Auth Pages & App Shell

**Context:** Tasks 1-01 through 1-07 complete. Build frontend foundation.

### Files
```
frontend/src/
├── store/
│   ├── auth.ts       ← Zustand: user, org, token, permissions, can(resource,action)
│   └── theme.ts      ← Zustand: theme, persisted to localStorage key 'devora-theme'
├── lib/
│   ├── api.ts        ← axios, baseURL from VITE_API_URL, JWT interceptor, 401→clearAuth+redirect
│   └── queryClient.ts
├── hooks/useTheme.ts ← sets data-theme on document.documentElement
├── components/
│   ├── ui/
│   │   ├── Button.tsx   variants: primary|secondary|ghost|destructive; sizes: sm|md|lg
│   │   ├── Input.tsx    label prop, error prop, helper text prop
│   │   ├── Badge.tsx    variant→accent colour mapping
│   │   ├── Card.tsx     bg-surface + border
│   │   ├── Spinner.tsx  sm|md|lg
│   │   └── Avatar.tsx   initials fallback
│   └── layout/
│       ├── AppShell.tsx    fixed TopBar 48px + fixed Sidebar 220px + scrollable main
│       ├── Sidebar.tsx
│       ├── TopBar.tsx
│       └── ThemeToggle.tsx sun/moon icon
└── pages/
    ├── auth/LoginPage.tsx
    ├── auth/RegisterPage.tsx
    └── dashboard/DashboardPage.tsx  (4 placeholder metric cards)
```

### store/auth.ts
```typescript
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useAuthStore = create(persist((set, get: any) => ({
  user: null, org: null, token: null, permissions: [] as string[],
  setAuth: (user:any, org:any, token:string, permissions:string[]) =>
    set({ user, org, token, permissions }),
  clearAuth: () => set({ user:null, org:null, token:null, permissions:[] }),
  can: (resource:string, action:string) => {
    const p = (get() as any).permissions as string[]
    return p.includes(`${resource}:manage`) || p.includes(`${resource}:${action}`)
  },
}), { name: 'devora-auth' }))
```

### Sidebar nav groups
```
GENERAL   → Dashboard (LayoutDashboard icon)
ACCESS    → Users (Users2) | Roles (Shield) | Groups (UsersRound)
PROJECTS  → Projects (FolderGit2)    ← greyed out, disabled until Phase 2
DEPLOY    → Deployments (Rocket)     ← greyed out, disabled until Phase 2

Active item: 2px left accent-amber border, bg-subtle background, text-primary
Height 36px, padding 0 12px, border-radius 4px
Bottom pinned: avatar + display name + logout button
```

### LoginPage
```
Centred card 400px wide on bg-base
Email + Password (show/hide Eye icon)
"Sign in" primary button full width + spinner while loading
Inline field errors (not toast)
"Create organization" ghost button → /register
On success: setAuth(), navigate to /dashboard
```

### RegisterPage
```
Fields: Org Name | Org Slug (auto-generated from name, editable, /^[a-z0-9-]+$/) | Your Name | Email | Password
On success: setAuth(), navigate to /dashboard
```

### PASS CRITERIA
- [ ] `/login` renders correctly in dark and light modes
- [ ] Register flow creates org + user, stores token, redirects to dashboard
- [ ] Wrong credentials shows inline error
- [ ] Unauthenticated access to `/dashboard` redirects to `/login`
- [ ] Theme toggle switches and persists on reload
- [ ] Sidebar shows org name + user name
- [ ] `can('user','delete')` returns false for developer, true for org_admin
- [ ] `grep -rn "#[0-9a-fA-F]" src/` returns zero results
- [ ] `tsc --noEmit` passes

---

## TASK 1-09 — Frontend RBAC Admin UI

**Context:** Tasks 1-01 through 1-08 complete.

### Pages
```
frontend/src/pages/admin/
├── UsersPage.tsx          table + invite button
├── UserDetailPage.tsx     profile + roles
├── RolesPage.tsx          roles list + create button
├── RoleDetailPage.tsx     permission toggle matrix ← key component
├── NewRolePage.tsx
├── GroupsPage.tsx
└── GroupDetailPage.tsx    members + role assignments (two-column)
```

### RoleDetailPage — permission toggle matrix
```
Table: rows = 8 resources, columns = 5 actions
Each cell = toggle switch
Toggle ON: accent-green; OFF: bg-subtle

Single toggle click: PATCH /api/roles/:id/permissions/:permId
Toggling "Manage" ON: auto-enable all other toggles in that row
"Manage" column tooltip: "Grants all actions for this resource"
"Save all" button: PUT /api/roles/:id/permissions

System roles: all toggles disabled
Banner: "System role — permissions cannot be modified"
```

### UsersPage
```
Table: avatar | name+email | status badge | roles | actions
Status badges: active=green | suspended=amber | invited=blue
Actions: Edit Roles (modal) | Suspend | Remove
"Invite User" button top-right
Client-side search by name or email
```

### PASS CRITERIA
- [ ] RoleDetailPage shows 8×5 toggle matrix
- [ ] Toggle calls API and updates immediately
- [ ] "Manage" ON enables all other toggles in row
- [ ] System role toggles are disabled and read-only
- [ ] UsersPage shows correct status badges
- [ ] Invite creates user with status 'invited'
- [ ] GroupDetailPage two-column: members left, roles right
- [ ] Assigning role to group reflects in group member's permissions

---

## PHASE 1 COMPLETE — Final Checks

- [ ] `docker compose down -v && docker compose up --build` clean start
- [ ] Register org → login → see dashboard
- [ ] Create custom role with only `project:read` on
- [ ] Invite user, assign custom role
- [ ] Login as that user → `can('project','create')` = false, `can('project','read')` = true
- [ ] That user gets 403 on any endpoint requiring project:create
- [ ] Create group, add users, assign role → members inherit role
- [ ] Dark + light themes correct on all admin pages
- [ ] `tsc --noEmit` zero errors
- [ ] `go build ./...` zero errors

---
---

# PHASE 2 — Complete Project Management

> Start ONLY after all Phase 1 checks are green. Re-read Phase 1 tasks first.

**Goal:** Projects with Git (Gitea), issues, kanban board, merge requests (permission-gated), GitLab-style pipelines, deployment to admin-allocated Docker containers.

---

## TASK 2-01 — Add Gitea to Docker Compose

**Context:** Phase 1 complete.

### Add to docker-compose.yml services block
```yaml
  gitea:
    image: gitea/gitea:1.21
    environment:
      GITEA__database__DB_TYPE: postgres
      GITEA__database__HOST: storage:5432
      GITEA__database__NAME: gitea
      GITEA__database__USER: devora
      GITEA__database__PASSWD: devora_secret
      GITEA__server__HTTP_PORT: "3001"
      GITEA__server__ROOT_URL: http://localhost:3001
      GITEA__server__DOMAIN: localhost
      GITEA__security__INSTALL_LOCK: "true"
      GITEA__service__DISABLE_REGISTRATION: "true"
    ports: ['3001:3001']
    volumes: [gitea_data:/data]
    depends_on:
      storage:
        condition: service_healthy
```
Add `gitea_data:` to volumes block.

### Append to storage/init.sql
```sql
CREATE DATABASE gitea;
GRANT ALL PRIVILEGES ON DATABASE gitea TO devora;
```

### PASS CRITERIA
- [ ] Gitea running at `http://localhost:3001`
- [ ] `GET http://localhost:3001/api/v1/version` returns version JSON
- [ ] Backend can reach `http://gitea:3001` internally

---

## TASK 2-02 — Project Database Schema

**Context:** Task 2-01 complete. Append to storage/init.sql.

```sql
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL, slug TEXT NOT NULL, description TEXT,
  visibility TEXT DEFAULT 'private' CHECK (visibility IN ('private','internal','public')),
  gitea_repo_id INTEGER, gitea_repo_url TEXT, default_branch TEXT DEFAULT 'main',
  created_by UUID REFERENCES users(id), archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(org_id, slug)
);
CREATE TABLE project_members (
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id UUID REFERENCES roles(id), added_by UUID REFERENCES users(id),
  added_at TIMESTAMPTZ DEFAULT NOW(), PRIMARY KEY (project_id, user_id)
);
CREATE TABLE project_groups (
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES user_groups(id) ON DELETE CASCADE,
  role_id UUID REFERENCES roles(id), PRIMARY KEY (project_id, group_id)
);
CREATE TABLE issues (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  number SERIAL, title TEXT NOT NULL, body TEXT,
  status TEXT DEFAULT 'open' CHECK (status IN ('open','in_progress','closed')),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low','medium','high','critical')),
  type TEXT DEFAULT 'task' CHECK (type IN ('task','bug','feature')),
  assignee_ids UUID[] DEFAULT '{}', created_by UUID REFERENCES users(id),
  closed_by UUID REFERENCES users(id), closed_at TIMESTAMPTZ, due_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE merge_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  number INTEGER NOT NULL, title TEXT NOT NULL, body TEXT,
  status TEXT DEFAULT 'open' CHECK (status IN ('open','merged','closed','draft')),
  source_branch TEXT NOT NULL, target_branch TEXT NOT NULL,
  author_id UUID REFERENCES users(id), merged_by UUID REFERENCES users(id),
  merged_at TIMESTAMPTZ, gitea_pr_id INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE pipelines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL, definition JSONB NOT NULL, trigger JSONB NOT NULL,
  created_by UUID REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE pipeline_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pipeline_id UUID REFERENCES pipelines(id),
  project_id UUID NOT NULL REFERENCES projects(id),
  status TEXT DEFAULT 'queued' CHECK (status IN ('queued','running','passed','failed','cancelled')),
  trigger_type TEXT, trigger_actor UUID REFERENCES users(id),
  commit_sha TEXT, branch TEXT, started_at TIMESTAMPTZ, finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE pipeline_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id UUID NOT NULL REFERENCES pipeline_runs(id) ON DELETE CASCADE,
  name TEXT NOT NULL, status TEXT DEFAULT 'pending',
  logs TEXT DEFAULT '', exit_code INTEGER,
  started_at TIMESTAMPTZ, finished_at TIMESTAMPTZ
);
CREATE TABLE deploy_containers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  project_id UUID REFERENCES projects(id),
  name TEXT NOT NULL, docker_id TEXT, image TEXT NOT NULL,
  status TEXT DEFAULT 'stopped', host_port INTEGER, internal_port INTEGER DEFAULT 3000,
  env_vars JSONB DEFAULT '{}', created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### PASS CRITERIA
- [ ] `docker compose down -v && docker compose up --build` creates all new tables
- [ ] All 9 new tables exist

---

## TASK 2-03 — Projects API

**Context:** Task 2-02 complete.

### backend/internal/handlers/projects.go endpoints
```
POST   /api/projects                  RequirePermission("project","create")
GET    /api/projects                  RequirePermission("project","read")
GET    /api/projects/:id              RequirePermission("project","read")
PATCH  /api/projects/:id              RequirePermission("project","update")
DELETE /api/projects/:id              RequirePermission("project","delete")
POST   /api/projects/:id/members      RequirePermission("project","manage")
DELETE /api/projects/:id/members/:uid RequirePermission("project","manage")
POST   /api/projects/:id/groups       RequirePermission("project","manage")
DELETE /api/projects/:id/groups/:gid  RequirePermission("project","manage")
GET    /api/projects/:id/members
```

### Create project steps
```
1. INSERT projects
2. POST http://gitea:3001/api/v1/orgs/{org_slug}/repos
   auth: Basic base64(admin:password)
   body: { name: slug, private: true, auto_init: true, default_branch: "main" }
3. Store gitea_repo_id + gitea_repo_url on project
4. Register Gitea webhook → POST /api/v1/repos/{org}/{repo}/hooks
   { type:"gitea", config:{ url:"http://backend:4000/api/internal/webhook", content_type:"json" }, events:["push","pull_request"], active:true }
5. Return project
```

### PASS CRITERIA
- [ ] Create project → Gitea repo created automatically
- [ ] `GET /api/projects` returns only projects user is a member of (org_admin sees all)
- [ ] Adding group to project adds all group members as project_members
- [ ] Gitea repo visible at `http://localhost:3001`

---

## TASK 2-04 — Issues & Merge Requests API

**Context:** Task 2-03 complete.

### Issues
```
POST   /api/projects/:id/issues             RequirePermission("project","read")
GET    /api/projects/:id/issues             RequirePermission("project","read")
GET    /api/projects/:id/issues/:num
PATCH  /api/projects/:id/issues/:num        RequirePermission("project","update")
POST   /api/projects/:id/issues/:num/close  RequirePermission("project","update")
```

### Merge Requests
```
POST   /api/projects/:id/mrs               RequirePermission("repository","create")
GET    /api/projects/:id/mrs               RequirePermission("repository","read")
GET    /api/projects/:id/mrs/:num
POST   /api/projects/:id/mrs/:num/merge    RequirePermission("repository","manage")
  → call Gitea merge API → UPDATE status='merged' → close linked issues
POST   /api/projects/:id/mrs/:num/close    RequirePermission("repository","update")
```

### Gitea webhook handler
```
POST /api/internal/webhook  (validate X-Gitea-Signature HMAC, no JWT auth)
push event:
  find project by gitea_repo_id
  find pipelines where trigger.branches contains pushed branch
  INSERT pipeline_run (status=queued), launch runner goroutine
pull_request event:
  sync MR status to merge_requests table
```

### PASS CRITERIA
- [ ] Issues have sequential numbers per project
- [ ] `POST .../mrs/:num/merge` → 403 for developer role
- [ ] `POST .../mrs/:num/merge` → succeeds for org_admin, calls Gitea API
- [ ] Push to Gitea → webhook received → pipeline_run created in DB

---

## TASK 2-05 — Pipeline Execution Engine

**Context:** Task 2-04 complete.

### backend/internal/pipeline/runner.go
```go
// ExecuteRun(runID string) — called as goroutine, max 3 concurrent (semaphore chan)
//
// 1. Load run + definition from DB
// 2. UPDATE run status='running', started_at=NOW()
// 3. git clone {gitea_repo_url} /tmp/devora-build/{runID} at commit_sha
// 4. Parse jobs from definition JSONB, sort by 'needs' dependency order
// 5. For each job:
//    a. UPDATE job status='running', started_at=NOW()
//    b. docker create: image (default ubuntu:22.04), cmd=["sh","-c", all steps joined with &&],
//       working_dir=/workspace, env=[COMMIT_SHA,BRANCH,PROJECT_ID + user env],
//       bind mount: /tmp/devora-build/{runID}:/workspace
//    c. docker start
//    d. Stream stdout+stderr → append to pipeline_jobs.logs every 2 seconds
//    e. Wait for exit
//    f. exit 0: UPDATE job status='passed'
//       exit !=0: UPDATE job status='failed', stop all subsequent jobs, break
//    g. docker rm container
// 6. All passed: UPDATE run status='passed', finished_at=NOW()
//    Any failed: UPDATE run status='failed', finished_at=NOW()
```

### Pipeline endpoints
```
GET  /api/projects/:id/pipelines
POST /api/projects/:id/pipelines            RequirePermission("pipeline","create")
GET  /api/projects/:id/pipelines/:pid/runs
GET  /api/projects/:id/runs/:runId
GET  /api/projects/:id/runs/:runId/jobs/:jobId/logs  ← SSE stream from logs column
POST /api/projects/:id/runs/:runId/cancel
POST /api/projects/:id/pipelines/:pid/trigger        RequirePermission("pipeline","create")
```

### PASS CRITERIA
- [ ] Push to Gitea → webhook → pipeline runs automatically
- [ ] Jobs execute in Docker containers with cloned repo mounted
- [ ] Logs update in DB every 2 seconds
- [ ] SSE streams logs to client in real-time
- [ ] `needs:` ordering honoured
- [ ] Failed job stops remaining jobs
- [ ] Cancel kills Docker container, marks run cancelled

---

## TASK 2-06 — Deployment Containers API

**Context:** Task 2-05 complete.

### backend/internal/handlers/deployments.go
```
GET    /api/deploy/containers              RequirePermission("deployment","read")
POST   /api/deploy/containers              RequirePermission("deployment","create")
GET    /api/deploy/containers/:id
POST   /api/deploy/containers/:id/start   RequirePermission("deployment","update")
POST   /api/deploy/containers/:id/stop    RequirePermission("deployment","update")
DELETE /api/deploy/containers/:id          RequirePermission("deployment","delete")
GET    /api/deploy/containers/:id/logs    ← SSE stream docker logs
POST   /api/deploy/containers/:id/assign  RequirePermission("deployment","manage")
  body: { project_id }
```

### Container create steps
```
1. docker pull {image}
2. docker create --name devora-{name} -p {host_port}:{internal_port} {image}
3. INSERT deploy_containers with docker_id
4. Return container record

Start: docker start {docker_id} → UPDATE status='running'
Stop:  docker stop {docker_id}  → UPDATE status='stopped'

Pipeline scripts use the container by name:
  In pipeline step: run: docker exec devora-{name} sh deploy.sh
```

### PASS CRITERIA
- [ ] Admin allocates container → Docker container created on host
- [ ] Start/stop works, status updates correctly
- [ ] Container logs stream via SSE
- [ ] Non-admin without `deployment:manage` gets 403

---

## TASK 2-07 — Frontend Project Management UI

**Context:** Task 2-06 complete.

### Pages
```
frontend/src/pages/projects/
├── ProjectsPage.tsx
├── NewProjectPage.tsx
└── [projectId]/
    ├── ProjectLayout.tsx     inner nav: Issues|Board|MRs|Pipelines|Settings
    ├── OverviewPage.tsx
    ├── IssuesPage.tsx        filterable list: status, priority, type
    ├── BoardPage.tsx         kanban: Open|In Progress|Closed (@dnd-kit/core)
    ├── MergeRequestsPage.tsx
    ├── MrDetailPage.tsx      diff viewer + merge button
    ├── PipelinesPage.tsx     run list
    ├── PipelineRunPage.tsx   job cards + log SSE stream
    └── SettingsPage.tsx      members + groups access management
frontend/src/pages/deploy/
├── ContainersPage.tsx
└── ContainerDetailPage.tsx
```

### BoardPage
```
3 columns: Open | In Progress | Closed
@dnd-kit/core for drag and drop
On drop: PATCH /api/projects/:id/issues/:num { status: newColumn }
Issue card: title + priority badge + type badge + assignee avatar
```

### MrDetailPage
```
Diff: GET /api/projects/:id/mrs/:num returns diff from Gitea API
Render unified diff (react-diff-viewer or prism syntax highlighting)
Merge button:
  disabled + tooltip "Insufficient permissions" if can('repository','manage') = false
  enabled → POST .../merge → spinner → success state
```

### PipelineRunPage
```
Job cards row: name + status icon (queued=grey|running=blue spinner|passed=green|failed=red)
Click job → expand log panel below
Log panel: monospace JetBrains Mono, SSE connection, auto-scroll to bottom
```

### PASS CRITERIA
- [ ] Create project → Gitea repo appears at localhost:3001
- [ ] Kanban drag-and-drop updates issue status
- [ ] Merge button disabled for developer, enabled for org_admin
- [ ] Pipeline run page shows real-time logs
- [ ] Admin allocates container and assigns to project
- [ ] Settings page manages project members + groups

---

## PHASE 2 COMPLETE — Final Checks

- [ ] `docker compose down -v && docker compose up --build` clean start
- [ ] Create project → Gitea repo created
- [ ] Push commit → pipeline triggered automatically
- [ ] Pipeline logs visible real-time
- [ ] Developer cannot merge MR (403), org_admin can
- [ ] Admin allocates container, pipeline can deploy to it
- [ ] Kanban drag-and-drop works
- [ ] User without project access gets 403

---
---

# PHASE 3 — Code IDE (code-server)

> Start ONLY after all Phase 2 checks are green.

---

## TASK 3-01 — Add code-server to Docker Compose

### Add to services
```yaml
  ide:
    image: codercom/code-server:4.20.0
    user: "1000:1000"
    environment:
      PASSWORD: ""
      HASHED_PASSWORD: ""
    ports: ['8080:8080']
    volumes: [ide_workspaces:/home/coder/workspaces]
    command: >-
      --bind-addr 0.0.0.0:8080 --auth none
      --disable-telemetry /home/coder/workspaces
```
Add `ide_workspaces:` to volumes block.

### PASS CRITERIA
- [ ] code-server accessible at `http://localhost:8080`
- [ ] Volume persists between container restarts

---

## TASK 3-02 — Workspace Management API

### Append to storage/init.sql
```sql
CREATE TABLE workspaces (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  path TEXT NOT NULL, status TEXT DEFAULT 'stopped',
  created_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(project_id, user_id)
);
```

### backend/internal/handlers/workspaces.go
```
POST /api/workspaces                 body: { project_id }
  1. Check existing workspace in DB for user+project
  2. If none:
       path = "/home/coder/workspaces/{project.slug}-{userID[:8]}"
       exec.Command("docker","exec","devora-ide-1","git","clone",repoURL,path)
       INSERT workspace record
  3. Return { id, path, ide_url: "http://localhost:8080/?folder={path}" }

GET  /api/workspaces/:id
POST /api/workspaces/:id/commit      body: { message }
  exec git add -A && git commit -m {message} && git push inside ide container
GET  /api/workspaces/:id/status
  exec git status --short → return list of modified files
```

### PASS CRITERIA
- [ ] POST clones project repo into code-server volume
- [ ] ide_url opens code-server with correct folder
- [ ] Second POST for same user+project returns existing workspace (idempotent)
- [ ] Commit endpoint pushes to Gitea successfully
- [ ] New commit via API triggers pipeline run

---

## TASK 3-03 — Frontend IDE Button

### Add to ProjectLayout.tsx sidebar
```
New nav item: "Open IDE" (Code2 icon, accent-violet colour)
On click:
  POST /api/workspaces { project_id }
  Show spinner + "Preparing workspace..." text
  On success: window.open(ide_url, '_blank')
  On error: show inline error
Dot indicator next to nav item:
  grey = not created | blue = cloning | green = ready
```

### PASS CRITERIA
- [ ] "Open IDE" button in project sidebar
- [ ] Clicking opens code-server in new tab with project files
- [ ] Status indicator shows correct state
- [ ] Commit via API pushes to Gitea and triggers pipeline

---

## PHASE 3 COMPLETE — Final Checks

- [ ] `docker compose down -v && docker compose up --build` all services start
- [ ] Open IDE → code-server loads with correct project files
- [ ] Commit via API → appears in Gitea
- [ ] Commit triggers pipeline
- [ ] Two users get separate workspace directories

---
---

# PHASE 4 — Add-on Features

> Start ONLY after all Phase 3 checks are green.

---

## TASK 4-01 — Real-time Notifications (SSE)

### Schema
```sql
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL, title TEXT NOT NULL, body TEXT, action_url TEXT,
  read_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Backend
```
GET  /api/notifications
POST /api/notifications/:id/read
POST /api/notifications/read-all
GET  /api/notifications/stream    ← SSE, one per user, keep-alive

Internal func: NotifyUser(userID, type, title, body, url)
  INSERT notification + push to user's open SSE connection

Triggers:
  pipeline passed → notify trigger_actor
  pipeline failed → notify trigger_actor
  MR merged       → notify MR author
```

### Frontend
```
TopBar: Bell icon with amber badge (unread count)
Click: slide-out right panel listing notifications
Each: type icon + title + body + relative time + read indicator
Mark individual / all as read → badge count updates
```

### PASS CRITERIA
- [ ] Pipeline completion sends notification
- [ ] Bell badge shows correct unread count
- [ ] Panel lists notifications, clicking navigates to action_url
- [ ] Mark as read updates badge immediately

---

## TASK 4-02 — Audit Log Viewer

### Backend
```
Verify all create/update/delete handlers have audit_log inserts
Add any missing ones

GET /api/audit?page=1&limit=50&action=&actor_id=&resource_type=&from=&to=
  RequirePermission("org","manage")
  Returns paginated rows with actor user details joined
```

### Frontend
```
Admin sidebar GENERAL section: add "Audit Log" (FileText icon)
Table: Timestamp | Actor (avatar+name) | Action | Resource | Details
Filters: date range | action type | actor search
Details: expand row to show metadata JSON
```

### PASS CRITERIA
- [ ] All CRUD operations produce audit log entries
- [ ] Audit page paginates correctly
- [ ] Date range and action type filters work

---

## TASK 4-03 — API Key Management

### Schema
```sql
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL, key_hash TEXT UNIQUE NOT NULL,
  last_used_at TIMESTAMPTZ, expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Backend
```
GET    /api/keys        list my keys (never return full key after creation)
POST   /api/keys        generate "dvr_" + 32 random chars → return full key ONCE → store hash
DELETE /api/keys/:id    revoke immediately

Auth middleware update:
  Also accept Authorization: Bearer dvr_{key}
  Hash the key, lookup api_keys, check not expired
  Set userID + orgID from key record
```

### Frontend
```
User menu bottom of sidebar → "API Keys"
Table: name | created | last used | expires | revoke
"Create API Key" → modal: name + optional expiry → shows full key with copy button
Warning: "Copy this now — it will never be shown again"
```

### PASS CRITERIA
- [ ] API key works as Bearer token
- [ ] Full key shown only once
- [ ] Revoke immediately blocks access
- [ ] Expired key returns 401

---

## TASK 4-04 — Theme Polish

```
Update frontend/src/hooks/useTheme.ts init:
  1. Check localStorage for saved preference
  2. If none: check window.matchMedia('(prefers-color-scheme: dark)')
  3. Apply, then listen for OS changes

Audit all pages:
  grep -rn "#[0-9a-fA-F]" src/ must return zero results
  Check all pages in light mode for contrast issues
```

### PASS CRITERIA
- [ ] `grep -rn "#[0-9a-fA-F]" frontend/src/` returns zero results
- [ ] All pages correct in both themes
- [ ] OS preference auto-detected on first visit
- [ ] Manual choice overrides OS preference

---

## PHASE 4 COMPLETE — Full Project Final Checks

- [ ] All Phase 1, 2, 3 checks still pass
- [ ] Notifications arrive in real-time
- [ ] Audit log shows all actions
- [ ] API key works as auth
- [ ] Both themes polished everywhere
- [ ] `docker compose down -v && docker compose up --build` clean start
- [ ] `tsc --noEmit` zero errors
- [ ] `go build ./...` zero errors
- [ ] `grep -rn "#[0-9a-fA-F]" frontend/src/` zero results

---

*End of DEVORA_PLAN.md — 4 Phases · 22 Tasks · ~150 pass criteria*
