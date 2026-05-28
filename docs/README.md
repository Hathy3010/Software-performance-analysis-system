# AIOps — AI-based Software Performance Analysis System

> Monitors microservices, detects anomalies automatically, performs root cause analysis, and visualises incidents in a real-time operations dashboard.

---

## What is this?

AIOps is a full-stack platform that connects Prometheus metrics and Jaeger traces to an AI engine running Isolation Forest anomaly detection. When a service behaves abnormally, the system automatically identifies the likely root cause and links it to an incident — all without manual intervention.

Built as a graduation thesis project demonstrating production-grade engineering across the entire stack.

---

## Quick Start

```bash
# Prerequisites: Docker 24+, Docker Compose v2, GNU Make

git clone <repo-url> && cd ISPAS

make setup          # creates .env from .env.example
# ⚠ Edit .env — set POSTGRES_PASSWORD, SECRET_KEY, GRAFANA_ADMIN_PASSWORD

make build          # builds all custom Docker images (~3 min first time)
make up             # starts all 9 services

make ps             # wait until all show (healthy)
```

Open **http://localhost:3000** → login with `admin@aiops.local` / `Admin@123`

---

## Service URLs

| Service | URL | Purpose |
|---|---|---|
| **Dashboard** | http://localhost:3000 | Main React UI |
| **API Docs** | http://localhost:8000/docs | Swagger / OpenAPI |
| **Grafana** | http://localhost:3001 | Deep metric exploration |
| **Prometheus** | http://localhost:9090 | Raw metric queries |
| **Jaeger** | http://localhost:16686 | Distributed trace viewer |
| **Demo App** | http://localhost:8080 | Synthetic workload source |

---

## Documentation Index

| File | What it covers |
|---|---|
| [01-project-overview](01-project-overview.md) | Goals, scope, key capabilities |
| [02-business-context](02-business-context.md) | Problem being solved, stakeholders |
| [03-architecture](03-architecture.md) | System design, data flows, diagrams |
| [04-tech-stack](04-tech-stack.md) | Every technology + why it was chosen |
| [05-folder-structure](05-folder-structure.md) | Annotated file tree, where to find things |
| [06-coding-standards](06-coding-standards.md) | Naming, patterns, what to avoid |
| [07-database-schema](07-database-schema.md) | Tables, relationships, design decisions |
| [08-api-docs](08-api-docs.md) | All endpoints, request/response shapes |
| [09-core-modules](09-core-modules.md) | Deep dive into each core module |
| [10-feature-guide](10-feature-guide.md) | How each feature works end-to-end |
| [11-codemap](11-codemap.md) | "Where is X?" navigation guide |
| [12-local-setup](12-local-setup.md) | Step-by-step dev environment setup |
| [13-deployment](13-deployment.md) | Docker Compose deployment guide |
| [14-testing](14-testing.md) | Test strategy, how to run tests |
| [15-security](15-security.md) | Auth model, RBAC, JWT, secrets |
| [16-performance](16-performance.md) | Benchmarks, bottlenecks, tuning |
| [17-troubleshooting](17-troubleshooting.md) | Common problems and fixes |
| [18-decision-log](18-decision-log.md) | Architecture decisions and rationale |
| [19-changelog](19-changelog.md) | Version history |
| [20-onboarding](20-onboarding.md) | New developer checklist |

---

## Seed Credentials

| Role | Email | Password |
|---|---|---|
| Admin | admin@aiops.local | Admin@123 |
| Analyst | alice@aiops.local | Analyst@123 |
| Viewer | bob@aiops.local | Viewer@123 |
