<div align="center">

<br />

```
██████╗ ███████╗██╗   ██╗ ██████╗ ██████╗  █████╗
██╔══██╗██╔════╝██║   ██║██╔═══██╗██╔══██╗██╔══██╗
██║  ██║█████╗  ██║   ██║██║   ██║██████╔╝███████║
██║  ██║██╔══╝  ╚██╗ ██╔╝██║   ██║██╔══██╗██╔══██║
██████╔╝███████╗ ╚████╔╝ ╚██████╔╝██║  ██║██║  ██║
╚═════╝ ╚══════╝  ╚═══╝   ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝
```

**Your infrastructure. Your rules.**

Open-source self-hosted development & deployment platform — from first commit to production, entirely on your own hardware.

<br />

[![License: MIT](https://img.shields.io/badge/License-MIT-black.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-20_LTS-black.svg)](https://nodejs.org)
[![Rust](https://img.shields.io/badge/Rust-1.78+-black.svg)](https://rustlang.org)
[![K3s](https://img.shields.io/badge/Orchestration-K3s-black.svg)](https://k3s.io)
[![PRs Welcome](https://img.shields.io/badge/PRs-Welcome-black.svg)](CONTRIBUTING.md)
[![Status](https://img.shields.io/badge/Status-Active_Development-black.svg)]()

<br />

[**Quick Install**](#-quick-install) · [**Features**](#-features) · [**Architecture**](#-architecture) · [**Documentation**](#-documentation) · [**Contributing**](#-contributing)

<br />

</div>

---

## What is Devora?

Devora is a complete, self-hosted engineering platform that gives your team everything needed to build and ship software — without depending on any external SaaS tool.

```
Write code  →  Review it  →  Test it  →  Deploy it  →  Monitor it
     └──────────────────────────────────────────────────────┘
                    All inside one platform.
                    All on your own servers.
```

It combines a browser-based AI-powered code editor, Git hosting, project management, CI/CD pipelines, team chat, and a full deployment engine into a single system that installs on bare metal with one command.

---

## ✨ Features

### 🖥️ Cloud Code Editor
- Browser-based VS Code (code-server) — open your IDE from any machine
- **Per-developer sandboxed containers** — fully isolated filesystem, network, and compute per user
- Persistent workspaces — files survive pod restarts, resume in under a second
- Collaborative coding — real-time multiplayer editing, shared terminals, pair programming

### 🤖 AI Code Assistant
- Inline autocomplete, conversational chat, full **agent mode** (reads files, runs commands, proposes changes)
- AI-powered PR reviews — agent analyses diffs and posts inline comments automatically
- **Pluggable LLM backends** — local models via Ollama (Deepseek-Coder, CodeLlama, Qwen2.5-Coder) or cloud APIs (OpenAI, Anthropic, Gemini)
- Per-org custom system prompts, model selection, and context window policies
- RAG index of your entire codebase — agent understands your project, not just the open file

### 🔐 Access Control
- Multi-scope RBAC: platform → organization → project → resource level
- Roles: Super Admin, Org Admin, Project Manager, Tech Lead, Developer, Viewer, Contractor
- Time-limited tokens for external contributors
- SSO via Google, GitHub, Azure AD, LDAP/Active Directory (Keycloak-powered)

### 📁 Project Management
- Git hosting (branches, tags, protected rules, webhooks)
- Issue tracker with milestones, labels, priorities, subtasks, and sprints
- Kanban board and Gantt view
- Pull requests with inline code review, diff viewer, and approval workflows
- Issues link to branches → PRs → deployments → auto-close on merge

### ⚙️ CI/CD Pipelines
- YAML pipeline definitions (Gitea Actions-compatible format)
- Triggers: push, PR, schedule, manual, dependent pipeline
- Isolated build containers per job — no cross-contamination between runs
- Real-time log streaming to portal while the build runs
- Container vulnerability scanning (Trivy) on every built image before deploy

### 🚀 Deployment Engine
- **Unified deployment spec** — one YAML file works for any target (self-hosted or cloud)
- Self-hosted: K3s, Docker Compose, bare metal via SSH
- Cloud: AWS (ECS, EC2, Lambda), GCP (Cloud Run, GKE), Azure (AKS), Hetzner, DigitalOcean
- Deployment strategies: rolling, blue/green, canary
- **Automatic rollback** on health check failure
- Production deployments require explicit approval — with chat notification + email

### 💬 Team Chat
- Channels (org-wide and project-scoped), DMs, group messaging, threads
- Platform-native cards: deployment status, build results, PR reviews — all in chat
- @mentions, reactions, pinned messages, full-text search
- Real-time presence, typing indicators
- Deeply integrated — a failed deploy posts to your channel automatically

### 📊 Monitoring & Observability
- **Layered visibility** — Super Admin → Org Admin → Manager → Developer self-view
- Manager dashboards: team commit velocity, build success rates, deployment frequency
- Infrastructure dashboards: node CPU/RAM/disk, pod health, cluster capacity
- Unified notification center: every platform event in one inbox
- Ethical by design: managers see productivity signals, never code content

---

## 🏗️ Architecture

Devora is a microservices platform orchestrated by K3s (lightweight Kubernetes) running on your servers.

```
                        ┌─────────────────────────────┐
                        │     Browser / Client         │
                        └──────────────┬──────────────┘
                                       │ HTTPS + WSS
                        ┌──────────────▼──────────────┐
                        │      Traefik  (Ingress)      │
                        │   SSL termination + routing  │
                        └──┬──────────┬──────────┬────┘
                           │          │          │
                     /api/*      /ws        /ide/:id
                           │          │          │
              ┌────────────▼──┐  ┌────▼───┐  ┌──▼──────────────┐
              │  API Gateway  │  │  Chat  │  │ Sandbox Proxy   │
              │   (Fastify)   │  │  (WS)  │  │ → user's pod    │
              └──┬────────────┘  └────────┘  └─────────────────┘
                 │
   ┌─────────────┼──────────────────────────────────┐
   │             │                                  │
┌──▼───┐  ┌──────▼──────┐  ┌──────────┐  ┌────────▼────────┐
│ Auth │  │   Project   │  │  Deploy  │  │    Monitor      │
│ RBAC │  │ Git · Issues│  │  Engine  │  │ Metrics · Logs  │
│  SSO │  │ CI/CD · PRs │  │  (Rust)  │  │    Alerts       │
└──────┘  └─────────────┘  └──────────┘  └─────────────────┘
                 │                  │
                 └──────────────────┘
                          │
               ┌──────────▼──────────┐
               │   NATS Message Bus  │
               └──────────┬──────────┘
                          │
       ┌──────────────────┼──────────────────┐
       │                  │                  │
┌──────▼──┐  ┌────────────▼──┐  ┌───────────▼───┐
│Postgres │  │  ClickHouse   │  │     Redis     │
│  (×7)   │  │ Activity logs │  │ Cache/Presence│
└─────────┘  └───────────────┘  └───────────────┘
```

### Tech Stack

| Layer | Technology |
|---|---|
| **Backend services** | Node.js 20 LTS + Fastify |
| **Frontend** | React 18 + Vite + TailwindCSS |
| **Deploy engine** | Rust |
| **CLI installer** | Rust |
| **Databases** | PostgreSQL 16 (per-service) |
| **Cache** | Redis 7 |
| **Event store** | ClickHouse |
| **Message bus** | NATS |
| **Logs** | Loki + Promtail |
| **Metrics** | Prometheus |
| **Orchestration** | K3s |
| **Ingress** | Traefik v3 |
| **Object storage** | MinIO |
| **Container registry** | Harbor |
| **Git engine** | Gitea |
| **Auth / SSO** | Keycloak |
| **Secrets** | OpenBao |
| **AI serving** | Ollama |

---

## ⚡ Quick Install

> **Requirements:** Linux (Ubuntu 20.04+, Debian 11+, or RHEL 8+) · Ports 80, 443 open · Min 4 CPU / 8 GB RAM

```bash
curl -fsSL https://get.devora.dev | sh
devora init
```

The installer detects your hardware, recommends a profile, and sets up everything automatically.

### Installation Profiles

| Profile | Hardware | Developers |
|---|---|---|
| **Nano** | 4 CPU · 8 GB · 100 GB | Up to 5 |
| **Starter** | 8 CPU · 16 GB · 500 GB | Up to 20 |
| **Business** | 16 CPU · 32 GB · 2 TB | Up to 75 |
| **Enterprise** | Multi-node cluster | 75 – 500+ |

### Air-Gapped Install

For environments with no outbound internet access:

```bash
# On an internet-connected machine
devora bundle --output devora-bundle.tar.gz

# Transfer the bundle to your server, then:
devora init --bundle ./devora-bundle.tar.gz
```

---

## 🖥️ Cluster Scaling

Devora uses K3s. Adding a new physical server to your cluster is one command:

```bash
# On your master node
devora token
# → eyJhbGciOiJIUzI1NiJ9...

# On the new server
devora join \
  --master-ip 10.0.1.1 \
  --token <your-token> \
  --role worker-sandbox
```

The master node automatically begins scheduling workloads on the new machine within 60 seconds. Available roles: `worker-sandbox` · `worker-build` · `worker-ai` · `storage` · `worker-general`

**Pod-level scaling is automatic** — Kubernetes HPA scales services up and down based on load across all your workers with no manual intervention.

---

## 🛠️ CLI Reference

```bash
devora init                          # First-time setup wizard
devora join --master-ip X --token Y  # Add new server to cluster
devora status                        # Health check all services
devora upgrade                       # Rolling upgrade (zero downtime)
devora backup                        # Snapshot all data
devora restore --from backup.tar.gz  # Restore from backup
devora scale                         # Add / remove cluster nodes
devora logs [service]                # Tail service logs
devora config                        # Edit platform configuration
devora token                         # Print cluster join token
devora reset                         # Factory reset (⚠ destructive)
devora uninstall                     # Clean removal
```

---

## 📂 Repository Structure

```
devora/
├── apps/
│   ├── portal/               # React + Vite frontend
│   ├── gateway/              # API gateway (Fastify)
│   ├── auth-service/         # RBAC, sessions, SSO
│   ├── project-service/      # Git, issues, PRs, CI/CD
│   ├── chat-service/         # Messaging, WebSocket
│   ├── monitor-service/      # Metrics, logs, alerts
│   ├── sandbox-service/      # Workspace orchestration
│   └── notification-service/ # Unified notification engine
│
├── core/
│   ├── deploy-engine/        # Rust — deployment core
│   └── installer/            # Rust — devora CLI binary
│
├── packages/
│   ├── db/                   # Drizzle ORM schemas (shared)
│   ├── nats/                 # NATS client wrapper
│   ├── logger/               # Pino logger config
│   ├── errors/               # Shared error types
│   └── types/                # Shared TypeScript interfaces
│
├── infra/
│   ├── k3s/                  # K3s manifests
│   ├── traefik/              # Traefik config templates
│   └── compose/              # Docker Compose (dev mode)
│
└── docs/
    ├── architecture/         # Architecture Decision Records
    ├── api/                  # OpenAPI specifications
    └── contributing/         # Contribution guide + RFC process
```

---

## 🚀 Development Setup

### Prerequisites

- Node.js 20+
- Rust 1.78+
- Docker + Docker Compose

### Run Locally

```bash
# Clone the repo
git clone https://github.com/devora-platform/devora.git
cd devora

# Install Node.js dependencies (all services via workspaces)
npm install

# Start infrastructure: postgres, redis, clickhouse, nats, minio
docker compose -f infra/compose/dev.yml up -d

# Run database migrations
npm run db:migrate --workspace=packages/db

# Start all services in watch mode (Turborepo)
npm run dev

# Build Rust binaries (optional — needed for deploy/install features)
cd core/deploy-engine && cargo build
cd core/installer && cargo build
```

| Service | URL |
|---|---|
| Portal | http://localhost:3000 |
| API Gateway | http://localhost:4000 |
| NATS Dashboard | http://localhost:8222 |
| MinIO Console | http://localhost:9001 |

---

## 📖 Documentation

| Document | Description |
|---|---|
| [Technical Specification](docs/architecture/SPEC.md) | Full platform architecture and feature specification |
| [Installation Guide](docs/INSTALL.md) | Detailed install instructions for all profiles |
| [Configuration Reference](docs/CONFIG.md) | All configuration options explained |
| [API Reference](docs/api/) | OpenAPI specs for all services |
| [Contributing Guide](CONTRIBUTING.md) | How to contribute, RFC process, code standards |
| [Security Policy](SECURITY.md) | Vulnerability disclosure and security model |
| [Architecture Decisions](docs/architecture/) | ADRs for major design decisions |

---

## 🗺️ Roadmap

| Sprint | Focus | Status |
|---|---|---|
| Sprint 1 | Auth service + RBAC engine + portal skeleton | 🔲 Planned |
| Sprint 2 | Sandbox orchestration + code-server integration | 🔲 Planned |
| Sprint 3 | Chat service + notification engine | 🔲 Planned |
| Sprint 4 | Project management + Git integration | 🔲 Planned |
| Sprint 5 | Pull requests + CI/CD pipelines | 🔲 Planned |
| Sprint 6 | Rust deployment engine (self-hosted) | 🔲 Planned |
| Sprint 7 | Monitoring dashboards + admin views | 🔲 Planned |
| Sprint 8 | CLI installer + cloud provider adapters | 🔲 Planned |

Follow progress and vote on features in [GitHub Discussions](https://github.com/devora-platform/devora/discussions).

---

## 🤝 Contributing

Devora is actively developed and welcomes contributions of all kinds.

```bash
# Fork the repo, create a feature branch
git checkout -b feat/your-feature

# Make your changes, ensure tests pass
npm run test
npm run lint

# Open a pull request against main
```

- **Bug reports** → [GitHub Issues](https://github.com/devora-platform/devora/issues)
- **Feature requests** → [GitHub Discussions](https://github.com/devora-platform/devora/discussions)
- **Security vulnerabilities** → security@devora.dev *(please do not open a public issue)*
- **Major changes** → open an RFC in `docs/architecture/` before starting work

All contributions require: passing tests · lint-clean code · a clear PR description.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide including our RFC process and Architecture Decision Record format.

---

## 🔒 Security

Devora is designed with security at every layer:

- Per-user encrypted sandboxes (LUKS, per-user key, stored in OpenBao)
- Network namespace isolation between all developer sandboxes
- TLS 1.3 minimum, HSTS, security headers enforced at ingress
- Every image scanned for CVEs before deployment (Trivy)
- Runtime anomaly detection via Falco
- Complete immutable audit trail for all sensitive actions
- MFA enforced for admin roles

For the full security model, see the [Security Architecture](docs/architecture/SECURITY.md) document.  
To report a vulnerability, email **security@devora.dev**.

---

## 📄 License

Devora is open source under the **[MIT License](LICENSE)**.

You are free to use, modify, and distribute it — including for commercial purposes — with no restrictions. Your data stays yours.

---

<div align="center">

Built with intent. Owned by you.

**[devora.dev](https://devora.dev)** · **[Docs](https://docs.devora.dev)** · **[GitHub](https://github.com/devora-platform/devora)**

<br />

*Star the repo if Devora is useful to you — it helps more people find it.*

</div>
