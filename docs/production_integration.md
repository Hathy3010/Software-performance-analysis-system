# AIOps – Final Production Integration Guide
## PROMPT 8 — Full-Stack Assembly, Deployment, and Thesis Defense

**Version:** 1.0 | **Date:** 2026-04-30  
**Stack:** FastAPI · React 18 · PostgreSQL 16 · Prometheus · Grafana · Jaeger · OTel · Docker Compose

---

## Table of Contents

1. [Final Folder Structure](#1-final-folder-structure)
2. [Environment Variables Reference](#2-environment-variables-reference)
3. [Startup Commands](#3-startup-commands)
4. [Migration Steps](#4-migration-steps)
5. [Service Run Order](#5-service-run-order)
6. [Common Bug Fixes](#6-common-bug-fixes)
7. [Deployment Checklist](#7-deployment-checklist)
8. [Thesis Defense Demo Flow](#8-thesis-defense-demo-flow)

---

## 1. Final Folder Structure

```
d:\ISPAS\
│
├── .env                          ← active secrets (never commit)
├── .env.example                  ← template committed to git
├── .gitignore
├── docker-compose.yml            ← 9-container orchestration
├── Makefile                      ← all operator commands
│
├── docs/
│   ├── thesis_artifacts.md       ← UML diagrams, requirements, risks
│   └── production_integration.md ← this file
│
├── infra/
│   ├── db/
│   │   ├── schema.sql            ← DDL: tables, enums, indexes, triggers
│   │   └── seed.sql              ← demo data: 3 users, 5 services, incidents, RCA
│   ├── otel/
│   │   └── otel-collector-config.yml
│   ├── prometheus/
│   │   └── prometheus.yml
│   └── grafana/
│       ├── dashboards/
│       │   └── aiops-overview.json
│       └── provisioning/
│           ├── datasources/datasources.yml
│           └── dashboards/dashboards.yml
│
├── backend/
│   ├── Dockerfile                ← multi-stage Python 3.12 build
│   ├── requirements.txt
│   ├── alembic.ini
│   ├── alembic/
│   │   ├── env.py                ← async alembic runner
│   │   └── versions/
│   │       └── 0001_initial_schema.py   ← baseline stamp (no-op)
│   └── app/
│       ├── main.py               ← FastAPI app, routers, lifespan
│       ├── config.py             ← pydantic-settings, lru_cache
│       ├── core/
│       │   ├── database.py       ← async engine, sessionmaker, Base
│       │   ├── security.py       ← bcrypt, JWT create/decode
│       │   ├── deps.py           ← get_current_user, require_roles, Pagination
│       │   └── telemetry.py      ← OTel init (FastAPI + SQLAlchemy instrumentation)
│       ├── models/
│       │   ├── user.py
│       │   ├── service.py
│       │   ├── alert.py
│       │   ├── incident.py       ← duration_seconds GENERATED ALWAYS
│       │   └── report.py
│       ├── schemas/
│       │   ├── common.py         ← Page[T] generic
│       │   ├── auth.py
│       │   ├── user.py
│       │   ├── service.py
│       │   ├── alert.py
│       │   ├── incident.py
│       │   ├── report.py
│       │   └── dashboard.py
│       └── routers/
│           ├── auth.py           ← POST /login, POST /refresh
│           ├── users.py
│           ├── services.py
│           ├── alerts.py         ← background critical-alert task
│           ├── incidents.py      ← + GET /{id}/rca endpoint
│           ├── reports.py
│           ├── dashboard.py      ← aggregate KPIs, MTTR, anomaly count
│           └── metrics.py        ← Prometheus proxy for frontend charts
│
├── ai-engine/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/
│       ├── main.py               ← FastAPI + lifespan scheduler thread
│       ├── config.py             ← pydantic-settings for AI tuning params
│       ├── worker.py             ← 5-stage pipeline orchestrator
│       ├── core/
│       │   ├── database.py       ← sync psycopg2 engine + session context
│       │   ├── logging_setup.py
│       │   └── telemetry.py
│       ├── ingestion/
│       │   ├── prometheus.py     ← fetch_current_metrics, fetch_cpu_history
│       │   └── jaeger.py         ← fetch_trace_metrics (spans + errors)
│       ├── detection/
│       │   └── anomaly.py        ← AnomalyDetector (IsolationForest + fallback)
│       ├── rca/
│       │   └── engine.py         ← RCAEngine (rule-based, 3 rules, top-3 rank)
│       ├── forecasting/
│       │   └── cpu_forecast.py   ← PolynomialRegression degree-2, 30-min horizon
│       └── persistence/
│           └── repository.py     ← save_anomaly_result, save_rca_result, save_forecast
│
├── demo-app/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/
│       ├── main.py               ← synthetic workload with chaos endpoints
│       └── telemetry.py          ← OTel init
│
└── frontend/
    ├── Dockerfile                ← multi-stage Vite build → Nginx
    ├── nginx.conf
    ├── .dockerignore
    ├── package.json
    ├── vite.config.js            ← @/ alias → src/
    ├── tailwind.config.js
    ├── postcss.config.js
    ├── index.html
    └── src/
        ├── main.jsx
        ├── App.jsx               ← BrowserRouter, 5 routes, providers
        ├── index.css             ← Tailwind directives
        ├── api/
        │   ├── client.js         ← Axios instance, Bearer interceptor, 401 redirect
        │   ├── auth.js
        │   ├── dashboard.js
        │   ├── alerts.js
        │   ├── incidents.js
        │   ├── services.js
        │   └── metrics.js
        ├── contexts/
        │   ├── AuthContext.jsx   ← JWT decode, localStorage, login/logout
        │   └── ToastContext.jsx  ← 4-variant auto-dismiss toasts
        ├── hooks/
        │   └── usePolling.js     ← setInterval + useRef (stale-closure-safe)
        ├── utils/
        │   ├── cn.js             ← clsx + tailwind-merge
        │   └── format.js         ← formatDate, formatDuration, formatBytes
        ├── components/
        │   ├── ui/
        │   │   ├── Badge.jsx     ← all status/severity variants
        │   │   ├── Button.jsx
        │   │   └── Skeleton.jsx
        │   └── layout/
        │       ├── Sidebar.jsx       ← NavLink with active state
        │       ├── DashboardLayout.jsx ← auth guard, PageHeader
        │       └── ChartTooltip.jsx  ← dark Recharts tooltip
        └── pages/
            ├── Login.jsx
            ├── Dashboard.jsx     ← 5 KPI cards, alert chart, service grid, 30s poll
            ├── Metrics.jsx       ← CPU + latency Recharts, 10s poll, useRef history
            ├── Incidents.jsx     ← table, filters, modal, RCA section, resolve
            └── Services.jsx      ← CRUD, 3 modal states, form validation
```

---

## 2. Environment Variables Reference

Copy `.env.example` to `.env` then fill in every value marked `REQUIRED`.

```bash
# ── Copy template ──────────────────────────────────────────────────────────────
cp .env.example .env
```

### 2.1 Complete `.env` Reference

```dotenv
# =============================================================================
# PostgreSQL
# =============================================================================
POSTGRES_DB=aiops
POSTGRES_USER=aiops_user
POSTGRES_PASSWORD=<REQUIRED — min 16 chars, no @ symbol>

# =============================================================================
# FastAPI Backend
# =============================================================================
# Generate: python -c "import secrets; print(secrets.token_hex(32))"
SECRET_KEY=<REQUIRED — 64-char hex string>
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7
CORS_ORIGINS=http://localhost:3000
ENVIRONMENT=development          # set to "production" for prod deploy

# =============================================================================
# AI Engine
# =============================================================================
ANOMALY_SCORE_THRESHOLD=0.70     # 0.0–1.0: lower = more sensitive
DETECTION_INTERVAL_SECONDS=60   # pipeline cadence in seconds

# =============================================================================
# Demo App
# =============================================================================
SIMULATE_ANOMALIES=true          # enable chaos endpoint auto-fire
DEMO_APP_PORT=8080

# =============================================================================
# Grafana
# =============================================================================
GRAFANA_ADMIN_USER=admin
GRAFANA_ADMIN_PASSWORD=<REQUIRED — min 8 chars>
GRAFANA_PORT=3001
GRAFANA_LOG_LEVEL=warn

# =============================================================================
# Prometheus
# =============================================================================
PROMETHEUS_PORT=9090
PROMETHEUS_RETENTION=15d

# =============================================================================
# Jaeger
# =============================================================================
JAEGER_UI_PORT=16686
JAEGER_SPAN_TTL=72h

# =============================================================================
# Frontend (injected at Vite build time)
# =============================================================================
VITE_API_BASE_URL=http://localhost:8000
VITE_GRAFANA_URL=http://localhost:3001
VITE_JAEGER_URL=http://localhost:16686

# =============================================================================
# Port overrides (change only if default ports conflict)
# =============================================================================
BACKEND_PORT=8000
FRONTEND_PORT=3000
```

### 2.2 Secret Generation Commands

```bash
# JWT SECRET_KEY (run once, paste into .env)
python -c "import secrets; print(secrets.token_hex(32))"

# Strong PostgreSQL password (no special shell chars)
python -c "import secrets, string; print(secrets.token_urlsafe(24))"
```

### 2.3 Variable Ownership by Service

| Variable | Used by | Required |
|---|---|---|
| `POSTGRES_PASSWORD` | postgres, backend, ai-engine | Yes |
| `SECRET_KEY` | backend | Yes |
| `ANOMALY_SCORE_THRESHOLD` | ai-engine | No (default 0.70) |
| `GRAFANA_ADMIN_PASSWORD` | grafana | Yes |
| `VITE_API_BASE_URL` | frontend (build-time) | No (default localhost:8000) |
| `SIMULATE_ANOMALIES` | demo-app | No (default true) |

---

## 3. Startup Commands

### 3.1 First-Run (clean machine)

```bash
# 1. Prerequisites check
docker --version          # need Docker 24+
docker compose version    # need Compose v2.x (not v1 docker-compose)
make --version            # need GNU Make 4+

# 2. Clone / enter project root
cd d:/ISPAS

# 3. Create .env from template
make setup
# → edit .env, set POSTGRES_PASSWORD, SECRET_KEY, GRAFANA_ADMIN_PASSWORD

# 4. Build all custom images (backend, ai-engine, demo-app, frontend)
make build

# 5. Start the full stack
make up
```

### 3.2 Verify All Services Healthy

```bash
# Shows container status + health state
make ps

# Expected output: all 9 containers should show "healthy" or "Up"
# ─────────────────────────────────────────────────────────────────────────
# NAME                    STATUS          PORTS
# aiops-postgres          Up (healthy)    5432/tcp
# aiops-jaeger            Up (healthy)    0.0.0.0:16686->16686/tcp
# aiops-otel-collector    Up              0.0.0.0:4317->4317/tcp
# aiops-prometheus        Up (healthy)    0.0.0.0:9090->9090/tcp
# aiops-backend           Up (healthy)    0.0.0.0:8000->8000/tcp
# aiops-ai-engine         Up (healthy)    0.0.0.0:8001->8001/tcp
# aiops-demo-app          Up (healthy)    0.0.0.0:8080->8080/tcp
# aiops-grafana           Up (healthy)    0.0.0.0:3001->3000/tcp
# aiops-frontend          Up (healthy)    0.0.0.0:3000->80/tcp
```

### 3.3 Quick-Reference Commands

```bash
make up                # start all (detached)
make down              # stop all
make restart           # restart all
make logs              # tail all logs
make ps                # status table
make rebuild           # force no-cache build (after code changes)
make reset             # ⚠ destroys all volumes + data — asks for YES confirmation

# Individual service logs
docker compose logs -f backend
docker compose logs -f ai-engine
docker compose logs -f postgres

# Shell access
make db-shell          # psql inside postgres container
make backend-shell     # bash inside backend container
make ai-shell          # bash inside ai-engine container
```

### 3.4 Development Mode (local, no Docker)

```bash
# ── Backend ───────────────────────────────────────────────────────────────────
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# ── AI Engine ─────────────────────────────────────────────────────────────────
cd ai-engine
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8001

# ── Frontend ──────────────────────────────────────────────────────────────────
cd frontend
npm install
npm run dev             # Vite dev server → http://localhost:5173
```

---

## 4. Migration Steps

### 4.1 How the Schema is Bootstrapped

The database schema is created by PostgreSQL's `initdb` mechanism:

```
postgres container starts
  └── runs /docker-entrypoint-initdb.d/01-schema.sql  ← creates all tables/enums/indexes
  └── runs /docker-entrypoint-initdb.d/02-seed.sql    ← inserts demo data
```

**This only runs on first-start when the volume is empty.** Subsequent restarts skip initdb entirely.

### 4.2 Alembic — Adding Future Schema Changes

Migration 0001 is a **baseline stamp** (no-op). All future changes must go through Alembic:

```bash
# ── From inside the backend container ─────────────────────────────────────────
make backend-shell

# Generate a new migration from model changes
alembic revision --autogenerate -m "add_column_X_to_table_Y"

# Apply all pending migrations
alembic upgrade head

# Check current revision
alembic current

# Roll back one step
alembic downgrade -1
```

```bash
# ── From host machine (requires DATABASE_URL in environment) ──────────────────
cd backend
export DATABASE_URL="postgresql+asyncpg://aiops_user:<pass>@localhost:5432/aiops"
alembic upgrade head
```

### 4.3 Alembic `env.py` — Async Pattern

The project uses SQLAlchemy async. Alembic's `env.py` bridges this:

```python
# backend/alembic/env.py — key pattern
import asyncio
from sqlalchemy.ext.asyncio import async_engine_from_config

async def run_migrations_online():
    connectable = async_engine_from_config(configuration)
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()

asyncio.run(run_migrations_online())
```

### 4.4 Reset and Re-seed (development only)

```bash
# Full wipe and re-initialize
make reset       # confirms "YES", removes volumes

make up          # re-creates containers; initdb runs again on fresh volume
```

### 4.5 Manual Re-seed (without volume wipe)

```bash
make seed
# Runs: docker compose exec postgres psql -f /docker-entrypoint-initdb.d/02-seed.sql
# Note: will fail with unique constraint errors if data already exists
# Safe to run only on empty tables or after make reset
```

---

## 5. Service Run Order

Docker Compose resolves `depends_on` automatically. Understanding the order helps debug startup failures.

### 5.1 Dependency Graph

```
Level 0 (no deps)
  └── jaeger

Level 1 (depends on jaeger)
  └── otel-collector  ← condition: service_healthy (jaeger)

Level 2 (depends on otel-collector)
  └── postgres        ← no dependency on otel; starts in parallel

Level 3 (depends on postgres + otel-collector)
  ├── backend         ← condition: service_healthy (postgres)
  │                     condition: service_started (otel-collector)
  └── ai-engine       ← condition: service_healthy (postgres, prometheus)
                         condition: service_started (otel-collector)

Level 4 (depends on backend)
  └── frontend        ← condition: service_healthy (backend)

Level 5 (no blocking deps)
  ├── demo-app        ← condition: service_started (otel-collector)
  ├── prometheus      ← no deps
  └── grafana         ← condition: service_healthy (prometheus)
```

### 5.2 Expected Startup Timeline

| Time | Event |
|---|---|
| T+0s | jaeger, postgres, prometheus start simultaneously |
| T+10s | jaeger healthy → otel-collector starts |
| T+15s | postgres healthy → backend starts |
| T+20s | prometheus healthy → grafana starts |
| T+25s | otel-collector started → demo-app, ai-engine start |
| T+40s | backend healthy → frontend starts |
| T+60s | all services healthy; first AI pipeline cycle runs |

### 5.3 Readiness Checks

```bash
# Backend API
curl http://localhost:8000/health
# → {"status":"ok","service":"backend"}

# AI Engine
curl http://localhost:8001/health
# → {"status":"ok","service":"ai-engine"}

# Demo App
curl http://localhost:8080/health
# → {"status":"ok","service":"demo-app"}

# Prometheus
curl http://localhost:9090/-/healthy
# → Prometheus Server is Healthy.

# Grafana
curl http://localhost:3001/api/health
# → {"commit":"...","database":"ok","version":"10.4.3"}
```

---

## 6. Common Bug Fixes

### BUG-01: `otel-collector` stays in non-healthy state

**Symptom:** `docker compose ps` shows `aiops-otel-collector` with no health or `starting` forever.

**Root cause:** The otelcol-contrib image is built FROM scratch — no shell, no wget, no curl. Any healthcheck CMD will fail with "executable not found."

**Fix** (already applied in `docker-compose.yml`):
```yaml
otel-collector:
  # No healthcheck block — scratch image has no utilities
  # Dependents use service_started, not service_healthy
depends_on:
  otel-collector:
    condition: service_started   # ← NOT service_healthy
```

---

### BUG-02: `backend` or `ai-engine` container exits with `connection refused` to postgres

**Symptom:** Container starts, logs show `sqlalchemy.exc.OperationalError: connection refused`, then exits.

**Root cause:** `postgres` container started but `pg_isready` hasn't passed yet, OR the `DATABASE_URL` contains a typo in the password.

**Fix:**
```bash
# 1. Check postgres health
docker compose ps postgres
# Must show "(healthy)" — wait up to 60s after `make up`

# 2. Verify DATABASE_URL has no URL-unsafe chars in password
#    Passwords with @, /, ?, # must be percent-encoded
#    Easiest: use only alphanumeric + underscore in POSTGRES_PASSWORD

# 3. Test connection manually
make db-shell
# If this opens psql, the database is fine

# 4. Force restart the failing service
docker compose restart backend
```

---

### BUG-03: Frontend shows blank page / 404 on all API calls

**Symptom:** Dashboard loads but KPI cards show loading skeletons forever; browser console shows `Network Error` or `404`.

**Root cause:** `VITE_API_BASE_URL` was not set at build time, defaulting to empty string. Axios requests go to `undefined/api/v1/...`.

**Fix:**
```bash
# 1. Ensure .env has the correct value BEFORE running make build
VITE_API_BASE_URL=http://localhost:8000

# 2. Rebuild the frontend image (Vite bakes env vars at build time)
docker compose build --no-cache frontend
docker compose up -d frontend
```

---

### BUG-04: JWT `401 Unauthorized` immediately after login

**Symptom:** Login succeeds (200 returned), but next API call returns 401.

**Root cause A:** Token stored in wrong localStorage key — `AuthContext.jsx` key mismatch.

**Root cause B:** `SECRET_KEY` changed after tokens were issued (e.g., `.env` edited then `make restart`).

**Fix:**
```bash
# Clear browser storage and re-login
# In browser DevTools → Application → Local Storage → Clear All

# Verify SECRET_KEY is set and matches what backend uses
docker compose exec backend env | grep SECRET_KEY
```

---

### BUG-05: Alembic `Target database is not up to date` error

**Symptom:** Running `alembic upgrade head` fails with version mismatch.

**Root cause:** The `alembic_version` table in the DB has a different revision than the local migration files.

**Fix:**
```bash
# Check current DB revision
alembic current

# Check what head should be
alembic heads

# If the DB was created by schema.sql (not by alembic), stamp it as baseline
alembic stamp 0001

# Then upgrade normally
alembic upgrade head
```

---

### BUG-06: AI engine logs `Service not found in DB` every cycle

**Symptom:** `ai-engine` logs show `WARNING: Service 'backend' not found in DB — skipping persist`.

**Root cause:** The `services` table has no row with `prometheus_job = 'backend'`. The seed data uses `api-gateway`, `order-service` etc., not the internal Docker services.

**Fix — Option A:** Add the real services to the DB via the API:
```bash
curl -X POST http://localhost:8000/api/v1/services \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"backend","display_name":"Backend API","status":"healthy","prometheus_job":"backend"}'

curl -X POST http://localhost:8000/api/v1/services \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"demo-app","display_name":"Demo App","status":"healthy","prometheus_job":"demo-app"}'
```

**Fix — Option B:** Update `MONITORED_SERVICES` in `.env` to match seed service names:
```dotenv
# In .env (ai-engine reads this)
MONITORED_SERVICES=order-service,payment-service
```

---

### BUG-07: Prometheus shows targets as `DOWN`

**Symptom:** `http://localhost:9090/targets` shows `backend` or `demo-app` as DOWN.

**Root cause:** The `prometheus_fastapi_instrumentator` did not expose `/metrics` because `PROMETHEUS_INSTRUMENTATOR_INSTRUMENT` env var is missing, OR the service is not yet healthy when Prometheus first scrapes.

**Fix:**
```bash
# Check if /metrics endpoint is live
curl http://localhost:8000/metrics | head -20

# Hot-reload Prometheus config (picks up new targets)
make reload-prometheus

# Verify prometheus.yml scrape targets match container hostnames
cat infra/prometheus/prometheus.yml
# job_name should use Docker service names: backend:8000, demo-app:8080
```

---

### BUG-08: `CORS error` in browser when calling API

**Symptom:** Browser console: `Access to XMLHttpRequest blocked by CORS policy`.

**Root cause:** `CORS_ORIGINS` in `.env` doesn't include the frontend origin, or it has a trailing slash.

**Fix:**
```dotenv
# Correct — no trailing slash
CORS_ORIGINS=http://localhost:3000

# For multiple origins (comma-separated, no spaces)
CORS_ORIGINS=http://localhost:3000,http://localhost:5173
```

Then `docker compose restart backend` (no rebuild needed — CORS is a runtime env var).

---

### BUG-09: `IsolationForest` always returns `threshold_fallback` method

**Symptom:** `ai-engine` logs show `method=threshold_fallback` even after hours of running.

**Root cause:** `MIN_ISOLATION_FOREST_SAMPLES` default is 20. If Prometheus has no data for a service (targets DOWN), the buffer never fills.

**Fix:**
```bash
# 1. Confirm Prometheus has data
curl "http://localhost:9090/api/v1/query?query=rate(process_cpu_seconds_total{job=\"backend\"}[5m])"
# Should return result with a value

# 2. Lower the threshold for demo (optional)
# In ai-engine config.py, MIN_ISOLATION_FOREST_SAMPLES = 5 for quick demo
```

---

### BUG-10: Frontend `usePolling` stops updating after tab is hidden

**Symptom:** Metrics charts freeze when you switch browser tabs, then don't recover.

**Root cause:** Browsers throttle `setInterval` in background tabs. This is expected browser behavior.

**Fix (already implemented):** The `useRef` pattern ensures data accumulates correctly regardless of throttling. When the tab regains focus, the next tick immediately updates the chart. No fix needed — behavior is correct by design.

---

## 7. Deployment Checklist

Run through this list in order before thesis defense or any demo session.

### 7.1 Pre-Start Checklist

```
□ docker --version            → 24.x or higher
□ docker compose version      → 2.x (Plugin, not standalone)
□ .env file exists            → run: ls -la .env
□ POSTGRES_PASSWORD set       → not the placeholder string
□ SECRET_KEY set              → 64-char hex, not "change-me-in-production"
□ GRAFANA_ADMIN_PASSWORD set  → not the placeholder string
□ No port conflicts on host   → ports: 3000, 8000, 8001, 8080, 9090, 3001, 16686, 4317
```

### 7.2 Build Checklist

```
□ make build completes without error
□ No "COPY failed" or "RUN failed" messages in build output
□ docker images | grep aiops  → shows backend, ai-engine, demo-app, frontend images
□ Frontend build shows: "dist/assets/index-[hash].js" in Vite output
```

### 7.3 Runtime Health Checklist

```
□ make up                        → no error output
□ make ps                        → all 9 containers shown
□ postgres: (healthy)
□ jaeger: (healthy)
□ otel-collector: Up (no health — expected, scratch image)
□ prometheus: (healthy)
□ backend: (healthy)
□ ai-engine: (healthy)
□ demo-app: (healthy)
□ grafana: (healthy)
□ frontend: (healthy)
```

### 7.4 Application Checklist

```
□ http://localhost:3000          → AIOps login page loads
□ Login with admin@aiops.local / Admin@123  → redirects to dashboard
□ Dashboard KPI cards show data  → services, alerts, incidents counts
□ Metrics page charts animate    → CPU/latency lines update every 10s
□ Incidents page shows 2 rows    → from seed.sql data
□ Click incident → RCA panel     → shows root cause + confidence score
□ Services page shows 5 rows     → from seed.sql
□ http://localhost:8000/docs     → Swagger UI with all endpoints
□ http://localhost:9090          → Prometheus targets page: all UP
□ http://localhost:3001          → Grafana login (admin / .env password)
□ http://localhost:16686         → Jaeger UI, traces from backend
```

### 7.5 AI Engine Checklist

```
□ docker compose logs ai-engine | tail -50
  → should show: "Pipeline complete in X.Xs"
  → should show: "AnomalyResult service=backend score=X.XX"
  → no Python exceptions in last 5 minutes
□ After 20+ minutes: method=isolation_forest (not threshold_fallback)
□ Check anomaly_results table:
    make db-shell
    SELECT service_id, anomaly_score, method, detected_at
    FROM anomaly_results ORDER BY detected_at DESC LIMIT 5;
```

### 7.6 Security Checklist

```
□ curl http://localhost:8000/api/v1/incidents → returns 401 (not 200)
□ SECRET_KEY != "change-me-in-production"
□ POSTGRES_PASSWORD is not in any committed file (check git status)
□ .env is in .gitignore → run: git check-ignore -v .env
□ No debug logs expose tokens or passwords in docker compose logs
```

### 7.7 Demo Data Checklist

```
□ 3 users seeded:
  - admin@aiops.local    / Admin@123   (role: admin)
  - alice@aiops.local    / Analyst@123 (role: analyst)
  - bob@aiops.local      / Viewer@123  (role: viewer)

□ 5 services seeded: api-gateway, auth-service, order-service,
                     payment-service, notification-service

□ 2 incidents seeded:
  - "High latency on order-service" (status: investigating, severity: high)
  - "notification-service is down"  (status: open, severity: critical)

□ 3 alerts seeded (2 firing high/critical + 1 medium)
□ 1 RCA result seeded with causal graph + recommendations
□ 1 report seeded (status: ready)
```

---

## 8. Thesis Defense Demo Flow

### 8.1 Pre-Demo Setup (15 minutes before)

```bash
# 1. Hard reset for a clean state
make reset          # type YES
make up             # fresh stack with seed data

# 2. Wait for all services to be healthy
watch docker compose ps   # Ctrl+C when all show healthy (≈60s)

# 3. Open browser tabs (in this order)
#    Tab 1: http://localhost:3000          ← AIOps Dashboard
#    Tab 2: http://localhost:8000/docs     ← Swagger API
#    Tab 3: http://localhost:9090          ← Prometheus
#    Tab 4: http://localhost:16686         ← Jaeger
#    Tab 5: http://localhost:3001          ← Grafana

# 4. Pre-login as admin so the demo starts on the dashboard
#    URL: http://localhost:3000 → login as admin@aiops.local / Admin@123
```

### 8.2 Demo Script (15 minutes total)

---

#### Scene 1 — System Overview (2 min)

> "This is the AIOps platform — an AI-driven operations dashboard that monitors microservices, detects anomalies, and performs root cause analysis automatically."

- **Show:** Dashboard at `localhost:3000`
- **Point to:** 5 KPI cards (Services: 5, Active Alerts, Open Incidents: 2, MTTR, Anomalies detected)
- **Point to:** Alert severity bar chart → note the 1 critical + 1 high + 1 medium
- **Point to:** Service health grid → `notification-service` shown as `down` (red), `order-service` as `degraded`

---

#### Scene 2 — Real-time Metrics (2 min)

> "The system polls Prometheus every 10 seconds and streams live CPU and latency data for all monitored services."

- **Navigate to:** Metrics page
- **Show:** Two Recharts line charts updating live
- **Point to:** The chart x-axis scrolling right with each new data point
- **Open Tab 3 (Prometheus):** `http://localhost:9090/graph`
  - Query: `rate(process_cpu_seconds_total{job="backend"}[5m])`
  - Show the same data source the AI engine reads

---

#### Scene 3 — Incident Management & RCA (4 min)

> "When an anomaly is detected, the system creates incidents. The AI engine performs root cause analysis by correlating Prometheus metrics with Jaeger distributed traces."

- **Navigate to:** Incidents page
- **Show:** Two seeded incidents in the table
- **Click:** "High latency on order-service" row → modal opens
- **Show:** Incident details: severity=high, status=investigating, started 45 min ago
- **Expand:** RCA panel
- **Explain:**
  > "The RCA engine analyzed Jaeger traces from `order-service` and found that 72% of latency came from downstream `payment-service` calls. It identified a missing database index introduced in deploy v2.4.1 as the root cause with 87% confidence."
- **Point to:** Causal graph, contributing factors, recommendations
- **Click:** "Resolve" button on the second incident (`notification-service is down`)
- **Show:** Badge changes to green `resolved`; duration_seconds appears (auto-computed by PostgreSQL GENERATED ALWAYS column)

---

#### Scene 4 — AI Engine Pipeline (3 min)

> "The AI engine runs a 5-stage pipeline every 60 seconds: ingest metrics, detect anomalies using Isolation Forest, run RCA, forecast CPU, and persist results."

- **Open terminal:** `docker compose logs -f ai-engine`
- **Show:** Live log output including:
  - `fetch_current_metrics` for each service
  - `AnomalyResult: service=backend score=0.XX method=isolation_forest`
  - `Pipeline complete in X.Xs`
- **Return to browser — Switch to Tab 2 (Swagger):** `localhost:8000/docs`
- **Demonstrate:** `GET /api/v1/dashboard/summary` → Execute → Show live JSON response
- **Open psql:** `make db-shell`
  ```sql
  SELECT service_id, anomaly_score, method, detected_at
  FROM anomaly_results
  ORDER BY detected_at DESC
  LIMIT 3;
  ```
- **Show:** Live rows being inserted every 60 seconds

---

#### Scene 5 — Distributed Tracing (2 min)

> "Every API call is instrumented with OpenTelemetry. Traces flow through the OTel Collector to Jaeger, where we can see the full request lifecycle including database queries."

- **Open Tab 4 (Jaeger):** `localhost:16686`
- **Select service:** `backend`
- **Click:** "Find Traces"
- **Click a trace:** Show the span waterfall — HTTP handler → SQLAlchemy query → response
- **Point to:** Tags showing `http.method`, `db.statement`, `http.status_code`

---

#### Scene 6 — RBAC Demo (1 min)

> "Access control is enforced at every layer. Let me show what happens when a viewer tries to create an incident."

- **Click:** Logout (top-right)
- **Login as:** `bob@aiops.local` / `Viewer@123`
- **Navigate to:** Services page → Show: no Create/Edit/Delete buttons
- **Navigate to:** Incidents page → Show: no "New Incident" button
- **Open Tab 2 (Swagger):** Try `POST /api/v1/incidents` as viewer → Show 403 Forbidden

---

#### Scene 7 — Grafana Observability (1 min)

> "Operations teams can also use Grafana for deep metric exploration, building on the same Prometheus data source."

- **Open Tab 5 (Grafana):** `localhost:3001` → login with `.env` credentials
- **Open:** The `AIOps Overview` provisioned dashboard
- **Show:** CPU usage panel, error rate panel, request throughput

---

### 8.3 Handling Common Demo Questions

| Question | Answer |
|---|---|
| "How does IsolationForest detect anomalies?" | "It learns the normal behavior distribution from 120 rolling samples per service. New observations are scored as anomalous if they fall in low-density regions. Score 0 = normal, 1 = highly anomalous. We use 0.70 as threshold." |
| "What if Prometheus is down?" | "The AI engine uses tenacity retry (3 attempts, exponential backoff). If all fail, that pipeline cycle is skipped and logged. The next cycle runs in 60s." |
| "Why PostgreSQL GENERATED column for duration?" | "It's computed atomically at the database level — no race condition possible between setting resolved_at and computing the duration. The value is always consistent." |
| "How do you prevent JWT token theft?" | "Short-lived access tokens (30 min), refresh tokens (7 days) stored only in localStorage. In production, HttpOnly cookies would be the next security step." |
| "Can this scale beyond Docker Compose?" | "Yes — the backend is stateless (no in-memory sessions), so it's horizontally scalable. PostgreSQL and Prometheus can be replaced with managed cloud services. Kubernetes manifests would be the natural next step." |
| "What is the RCA confidence based on?" | "Rule A scores by average child span duration (scales to 0.95 at 2500ms). Rule B scores by child error rate (scales from 0.50 to 0.95). The rule-based approach is explainable — suitable for production where operators need to understand why." |

---

### 8.4 Emergency Recovery During Demo

```bash
# One container crashed
docker compose restart <service-name>

# Database connection lost
docker compose restart postgres backend ai-engine

# Everything broken — nuclear option (60s to full recovery)
make reset && make up

# Check what went wrong
docker compose logs --tail=50 <service-name>

# Frontend not loading after restart
docker compose restart frontend
# Wait 15s, then hard-refresh browser (Ctrl+Shift+R)
```

---

### 8.5 Demo Environment Snapshot

After `make up` with seed data, the system should show:

| Component | Value |
|---|---|
| Total services | 5 |
| Healthy services | 3 (api-gateway, auth-service, payment-service) |
| Degraded services | 1 (order-service) |
| Down services | 1 (notification-service) |
| Active alerts | 3 (1 critical, 1 high, 1 medium) |
| Open incidents | 2 |
| Anomaly results in DB | ≥ 2 (from seed) + growing from AI engine |
| RCA results in DB | 1 (from seed) |
| Reports ready | 1 |
| Seeded users | 3 (admin, analyst, viewer) |

---

## Appendix A: Quick Reference Card

```
┌────────────────────────────────────────────────────────────────┐
│  AIOps — Quick Reference                                       │
├────────────────────────────────────────────────────────────────┤
│  First run:    make setup && make build && make up             │
│  Start:        make up                                         │
│  Stop:         make down                                       │
│  Logs:         make logs  (or: docker compose logs -f X)       │
│  Status:       make ps                                         │
│  Wipe + reset: make reset                                      │
├────────────────────────────────────────────────────────────────┤
│  URLs                                                          │
│  Frontend      http://localhost:3000                           │
│  API Docs      http://localhost:8000/docs                      │
│  Grafana       http://localhost:3001                           │
│  Prometheus    http://localhost:9090                           │
│  Jaeger        http://localhost:16686                          │
│  Demo App      http://localhost:8080                           │
├────────────────────────────────────────────────────────────────┤
│  Demo credentials                                              │
│  Admin:    admin@aiops.local    / Admin@123                    │
│  Analyst:  alice@aiops.local    / Analyst@123                  │
│  Viewer:   bob@aiops.local      / Viewer@123                   │
│  Grafana:  admin / <GRAFANA_ADMIN_PASSWORD from .env>          │
└────────────────────────────────────────────────────────────────┘
```

## Appendix B: Technology Justifications (for committee questions)

| Choice | Why |
|---|---|
| FastAPI over Flask/Django | Native async (asyncio), automatic OpenAPI docs, Pydantic validation, ASGI — ideal for high-concurrency monitoring APIs |
| SQLAlchemy 2.0 async | Async I/O without blocking the event loop; `Mapped` annotations give compile-time type safety |
| Isolation Forest | Unsupervised — no labeled anomaly data required; low memory footprint (O(n·trees)); well-suited for rolling time-series with 4 features |
| PostgreSQL GENERATED ALWAYS | Atomically consistent computed column; `duration_seconds` is always in sync with `resolved_at`; no application-layer bugs |
| OpenTelemetry | Vendor-neutral; single SDK for traces, metrics, logs; exporters are swappable (Jaeger today → Tempo tomorrow) |
| Tenacity for retries | Declarative `@retry` decorator; exponential backoff prevents thundering-herd during infrastructure restarts |
| React useRef for history accumulation | Avoids stale closures in polling callbacks; buffer mutations don't trigger re-renders; chart gets full history on each update |
| Docker Compose with `depends_on` | Deterministic startup ordering; `service_healthy` condition waits for actual readiness, not just container start |

---

*Document version: 1.0 — 2026-04-30*  
*All commands assume the working directory is `d:\ISPAS` unless otherwise noted.*
