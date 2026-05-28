# AIOps Platform — Project Overview

> **Graduation project** — Full-stack AI-powered Operations platform that monitors a microservice environment, detects anomalies automatically, traces root causes, and alerts operators in real time.

---

## Table of Contents

1. [Architecture](#architecture)
2. [Containers & Services](#containers--services)
3. [Tech Stack](#tech-stack)
4. [Data Flow](#data-flow)
5. [AI Engine — Algorithms & Models](#ai-engine--algorithms--models)
6. [Backend API](#backend-api)
7. [Frontend Pages](#frontend-pages)
8. [Database Schema](#database-schema)
9. [Roles & Permissions](#roles--permissions)
10. [Demo Scenarios](#demo-scenarios)
11. [Observability Pipeline](#observability-pipeline)
12. [Known Issues & Fixes](#known-issues--fixes)
13. [Access URLs](#access-urls)
14. [Seed Accounts](#seed-accounts)

---

## Architecture

```
Browser (React 18 + Tailwind)
        │
        ▼
   Nginx (port 3000)
        │  /api/* → proxy
        ▼
  FastAPI Backend (port 8000)
        │
        ├──────────────────────────────────────┐
        │                                      │
        ▼                                      ▼
  PostgreSQL 16                        Prometheus (port 9090)
  (system of record)                   Jaeger (port 16686)
        ▲
        │ writes every 60s
        │
  AI Engine (worker)
        │
        ├── Prometheus (metrics ingest)
        └── Jaeger (trace ingest for RCA)
                ▲
                │ via OTel Collector (port 4317)
                │
        Demo App (port 8080)
        Backend (port 8000)
```

**Total: 9 Docker containers** managed by a single `docker-compose.yml`.

---

## Containers & Services

| Container | Image / Build | Port | Role |
|---|---|---|---|
| `aiops-frontend` | `./frontend` (Nginx) | 3000 | React SPA, reverse-proxies `/api/*` to backend |
| `aiops-backend` | `./backend` (FastAPI) | 8000 | REST API + WebSocket, all business logic |
| `aiops-ai-engine` | `./ai-engine` (Python worker) | 8001 | Anomaly detection, RCA, forecasting — runs every 60s |
| `aiops-demo-app` | `./demo-app` (FastAPI) | 8080 | Instrumented microservice, generates synthetic traffic |
| `aiops-postgres` | `postgres:16-alpine` | — (internal) | Primary datastore |
| `aiops-prometheus` | `prom/prometheus:v2.52.0` | 9090 | Metrics scraping + storage (15-day retention) |
| `aiops-grafana` | `grafana/grafana:10.4.3` | 3001 | Pre-provisioned dashboards |
| `aiops-jaeger` | `jaegertracing/all-in-one:1.57` | 16686 | Distributed trace storage (in-memory) |
| `aiops-otel-collector` | `otel/opentelemetry-collector-contrib:0.102.0` | 4317/4318/8889 | OTel pipeline: receives traces/metrics, forwards to Jaeger + Prometheus |

### Docker Networks

| Network | Members | Note |
|---|---|---|
| `db-net` | postgres, backend, ai-engine | Internal only — DB never exposed to host |
| `monitoring-net` | otel-collector, prometheus, grafana, jaeger, backend, ai-engine, demo-app | Observability bus |
| `frontend-net` | frontend, backend | API proxy only |

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| **Frontend** | React | 18 |
| | Vite | — |
| | Tailwind CSS | — |
| | Recharts | — |
| | Axios | — |
| | React Router | v6 |
| | Lucide React | — |
| **Backend** | FastAPI | — |
| | SQLAlchemy (async) | — |
| | Pydantic | v2 |
| | httpx | — |
| | python-jose (JWT) | — |
| | bcrypt | cost=12 |
| | prometheus-fastapi-instrumentator | — |
| **AI / ML** | scikit-learn | IsolationForest |
| | NumPy | — |
| | tenacity | retry logic |
| **Database** | PostgreSQL | 16 |
| | asyncpg | async driver |
| | psycopg2 | sync driver (AI engine) |
| **Observability** | OpenTelemetry | SDK + Collector |
| | Prometheus | v2.52.0 |
| | Grafana | 10.4.3 |
| | Jaeger | 1.57 |
| **Infrastructure** | Docker Compose | — |
| | Nginx | Alpine |
| | Python | 3.12-slim |

---

## Data Flow

### Real-time Monitoring Pipeline

```
Demo App ──OTel (gRPC 4317)──► OTel Collector ──► Jaeger (traces)
                                                └──► Prometheus (metrics via :8889)

Prometheus ◄── scrape every 10s ── Backend (:8000/metrics)
Prometheus ◄── scrape every 10s ── Demo App (:8080/metrics)
Prometheus ◄── scrape every 30s ── AI Engine (:8001/metrics)
```

### AI Engine Detection Cycle (every 60 seconds)

```
1. INGEST
   ├── Prometheus: fetch CPU rate, memory MB, P99 latency, error rate
   └── (if anomaly) Jaeger: fetch last 15 min of traces

2. DETECT
   └── IsolationForest + Z-score spike → anomaly_score ∈ [0,1]

3. RCA (only if anomaly detected)
   └── 6 rules on trace spans → top-3 root cause candidates

4. FORECAST
   └── Polynomial regression degree=2 → CPU prediction for next 30 min

5. PERSIST → PostgreSQL
   ├── anomaly_results
   ├── rca_results
   └── anomaly_results (metric_name='cpu_forecast')

6. NOTIFY (if is_anomaly=true)
   └── SMTP email to all users with email_notifications=true
```

### Request Flow (Browser → Data)

```
Browser GET /api/v1/incidents
  → Nginx proxy → FastAPI
  → SQLAlchemy async query → PostgreSQL
  → JSON response → React state → UI render
```

---

## AI Engine — Algorithms & Models

### 1. Anomaly Detection — Isolation Forest

| Parameter | Value |
|---|---|
| Algorithm | `sklearn.ensemble.IsolationForest` |
| `n_estimators` | 100 |
| `contamination` | 0.05 (5% expected anomaly rate) |
| `random_state` | 42 |
| Buffer size | 120 samples per service (~2 hours at 60s interval) |
| Min samples to activate | 20 (uses threshold fallback before this) |

**Feature vector** per service (4 dimensions):
```
[cpu_rate, memory_mb, latency_p99_s, error_rate]
```

**Score mapping:**
```python
raw = clf.decision_function(features)   # negative = anomalous
score = clip(0.5 - raw, 0, 1)          # normalized to [0, 1]
is_anomaly = score > threshold (default 0.70)
```

**Threshold fallback** (warming up, n < 20 samples):
- CPU > 80% → +0.4
- Latency P99 > 1s → +0.4
- Error rate > 10% → +0.3

### 2. Spike Detector — Z-score

```python
z = |current - mean(history)| / std(history)
spike = any(z > 3.0)   # 3-sigma threshold
```
- Activates after 10+ samples
- Forces `is_anomaly=True` even if IF score is below threshold

### 3. Root Cause Analysis — Rule Engine

6 rules applied to Jaeger trace spans (last 15 minutes):

| Rule | Trigger | Reason Code | Confidence |
|---|---|---|---|
| A | Highest average child latency | `highest_child_latency` | 0.3 + avg_ms/2500 |
| B | Child 5xx errors | `server_error_propagation` | 0.5 + err_rate×0.45 |
| C | No downstream evidence | `self_anomaly` | 0.50 |
| D | Child 4xx errors | `client_error_4xx` | 0.35 + err_rate×0.40 |
| E | DB span > 200ms | `db_slow_query` | 0.45 + dur_ms/10000 |
| F | Exception in spans | `exception_detected` | 0.75 (infra) / 0.55 (app) |

Output: top-3 deduplicated candidates by service + confidence score.

**Multi-hop dependency chain** — BFS traversal of full span tree to identify propagation path.

### 4. CPU Forecasting — Polynomial Regression

```python
sklearn.pipeline.Pipeline([
    PolynomialFeatures(degree=2),
    LinearRegression()
])
```
- Minimum 5 history points required
- Lookback: 60 minutes of CPU rate samples
- Horizon: predicts next 30 minutes (30 × 1-min points)
- Output: trend label (`stable`, `increasing`, `decreasing`) + peak CPU

---

## Backend API

**Base URL:** `http://localhost:8000/api/v1`  
**Auth:** JWT Bearer token (30-min access token + 7-day refresh token)

### Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/login` | Public | Get access + refresh tokens |
| POST | `/auth/refresh` | Public | Refresh access token |
| GET | `/services` | Any | List monitored services |
| GET | `/services/{id}` | Any | Service detail + recent anomalies |
| GET | `/alerts` | Any | List alerts (filterable) |
| PATCH | `/alerts/{id}/acknowledge` | Analyst+ | Acknowledge alert with comment |
| GET | `/incidents` | Any | List incidents |
| GET | `/incidents/{id}` | Any | Incident detail |
| GET | `/incidents/{id}/rca` | Any | RCA results for incident |
| POST | `/incidents/{id}/resolve` | Analyst+ | Resolve incident |
| GET | `/dashboard` | Any | KPI summary (counts + recent events) |
| GET | `/metrics` | Any | Prometheus metrics proxy |
| GET | `/traces` | Analyst+ | List recent Jaeger traces |
| GET | `/traces/{id}` | Analyst+ | Full trace with enriched spans |
| GET | `/services/dependency-map` | Analyst+ | Service call graph from Jaeger |
| GET | `/analytics/http-breakdown` | Analyst+ | HTTP status distribution per service |
| GET | `/analytics/anomaly-history` | Analyst+ | Anomaly score time series |
| GET | `/analytics/db-queries` | Analyst+ | Slow DB queries from RCA |
| GET | `/analytics/exceptions` | Analyst+ | Exception distribution from RCA |
| GET | `/logs` | Any | Anomaly log entries |
| GET | `/reports` | Any | Generated reports |
| GET | `/users` | Admin | List users |
| POST | `/users` | Admin | Create user |
| PATCH | `/users/{id}` | Admin | Update user / role |
| DELETE | `/users/{id}` | Admin | Delete user |
| GET | `/notifications/settings` | Any | My notification preferences |
| PATCH | `/notifications/settings` | Any | Update preferences |
| GET | `/global-settings` | Admin | System-wide settings |
| PATCH | `/global-settings` | Admin | Update system settings |
| WS | `/ws/metrics` | Any | Live metric stream (WebSocket) |

---

## Frontend Pages

| Route | Access | Description |
|---|---|---|
| `/` | All | Dashboard — KPI tiles, alert summary, anomaly timeline |
| `/metrics` | All | Live Prometheus metrics with WebSocket stream + Recharts |
| `/logs` | All | Anomaly detection log table |
| `/incidents` | All | Incident list + detail modal with RCA section |
| `/services` | All | Service health grid with mini anomaly charts |
| `/traces` | Analyst+ | Jaeger trace list + full span waterfall viewer |
| `/service-map` | Analyst+ | Service dependency graph from Jaeger |
| `/analytics` | Analyst+ | 4 tabs: HTTP Breakdown, Anomaly History, Slow DB, Exceptions |
| `/settings` | All | User prefs / notification settings / global config (admin) |
| `/admin/users` | Admin | User CRUD table |

### UI Design System

```
Background:   bg-gray-900 / bg-zinc-900   (#111827 / #18181b)
Surface:      bg-gray-800 / bg-zinc-800   (#1F2937 / #27272a)
Border:       border-gray-700 / border-zinc-800
Text primary: text-white / text-zinc-100
Text muted:   text-gray-400 / text-zinc-400
Accent:       text-blue-400               (#60A5FA)
Success:      text-green-400
Warning:      text-yellow-400
Danger:       text-red-400 / text-red-500
```

---

## Database Schema

### Core Tables

| Table | Purpose |
|---|---|
| `users` | Auth — email, hashed_password, role (admin/analyst/viewer) |
| `services` | Monitored services — name, type, status, prometheus_job, team |
| `incidents` | Operational incidents — severity (low/medium/high/critical), status, service_id |
| `alerts` | Prometheus-style alerts — firing/resolved, fingerprint, linked to incident |
| `anomaly_results` | AI engine output — anomaly_score, is_anomaly, metric_name, features JSON |
| `rca_results` | Root cause analysis — candidates JSON, confidence_score, linked to incident |
| `reports` | Generated PDF/JSON reports |
| `audit_logs` | Immutable action log — user, action, old/new values, IP |
| `notification_settings` | Per-user email + sound + push preferences |
| `global_settings` | Singleton row — system-wide thresholds + SMTP config |

### Key Relationships

```
users ──(1:1)── notification_settings
services ──(1:N)── incidents
services ──(1:N)── alerts
services ──(1:N)── anomaly_results
services ──(1:N)── rca_results
incidents ──(1:N)── alerts
incidents ──(1:N)── rca_results
```

---

## Roles & Permissions

| Feature | viewer | analyst | admin |
|---|---|---|---|
| View dashboard, services, incidents, metrics, logs | ✓ | ✓ | ✓ |
| View traces, service map, analytics | ✗ | ✓ | ✓ |
| Acknowledge alerts | ✗ | ✓ | ✓ |
| Assign / resolve incidents | ✗ | ✓ | ✓ |
| Edit own notification preferences | ✓ | ✓ | ✓ |
| Edit global system settings | ✗ | ✗ | ✓ |
| User management (CRUD) | ✗ | ✗ | ✓ |
| View audit logs | ✗ | ✗ | ✓ |

---

## Demo Scenarios

Injected via Demo App API. Only one scenario active at a time.

### Scenario 1 — `latency_spike`

```powershell
Invoke-RestMethod -Method POST -Uri "http://localhost:8080/demo/latency_spike/start"
```

**Effect:** High P99 latency on `/api/orders` and `/api/payments`  
**Observable in:** Metrics page (latency spike), Anomaly History (score rises), AI engine logs

### Scenario 2 — `wow_rca` (recommended for demo)

```powershell
Invoke-RestMethod -Method POST -Uri "http://localhost:8080/demo/wow_rca/start"
```

**Effect:** DB connection pool exhaustion → payment errors → order cascade failures  
**Observable in:** Traces page (multi-hop spans), Incidents (new incident + RCA), Jaeger dependency graph  
**Duration:** 3 phases × ~5 minutes each

### Scenario 3 — `cascading_failure`

```powershell
Invoke-RestMethod -Method POST -Uri "http://localhost:8080/demo/cascading_failure/start"
```

**Effect:** Progressive failure — all endpoints degrade sequentially  
**Observable in:** Dashboard (multiple alerts), Service health (status → degraded → down)

### Stop any scenario

```powershell
Invoke-RestMethod -Method POST -Uri "http://localhost:8080/demo/stop"
```

### Check scenario status

```powershell
Invoke-RestMethod -Method GET -Uri "http://localhost:8080/demo/status"
```

---

## Observability Pipeline

### Prometheus Scrape Targets

| Job | Target | Interval | Metrics |
|---|---|---|---|
| `aiops-platform` | `backend:8000/metrics` | 10s | HTTP requests, latency, process CPU/memory |
| `storefront-service` | `demo-app:8080/metrics` | 10s | HTTP requests, latency, process CPU/memory |
| `ai-engine` | `ai-engine:8001/metrics` | 30s | Detection cycle metrics, Python runtime |
| `otel-collector` | `otel-collector:8889` | 15s | OTel pipeline metrics |
| `prometheus` | `localhost:9090` | 15s | Self-metrics |

### Key Prometheus Metrics

```
process_cpu_seconds_total{job="aiops-platform"}       → CPU rate
process_resident_memory_bytes{job="aiops-platform"}   → Memory
http_request_duration_seconds_bucket{job="..."}        → P99 latency
http_requests_total{job="...", status="5xx"}           → Error rate
```

### OTel → Jaeger Flow

```
Demo App / Backend
  → OTel SDK (auto-instrumentation: FastAPI, SQLAlchemy)
  → OTel Collector gRPC :4317
  → Jaeger OTLP receiver
  → Jaeger UI (port 16686)
```

---

## Known Issues & Fixes

### Issue 1 — OTEL service name mismatch (ACTIVE)

**Symptom:** Analytics → Slow DB Queries and Exceptions tabs are empty. RCA never runs.

**Root cause:** `backend` and `demo-app` containers use old `OTEL_SERVICE_NAME` values because they were not restarted after the rename.

```
Jaeger sees:      backend, demo-app
AI engine queries: aiops-platform, storefront-service
→ No traces found → trace_count=0 → RCA skipped
```

**Fix:**
```powershell
docker-compose restart backend demo-app
```

After restart, both containers pick up the new env vars. Jaeger starts receiving traces under `aiops-platform` and `storefront-service`. RCA populates within 2–3 detection cycles (~3 minutes).

---

### Issue 2 — Seed incidents not linked to monitored services

**Symptom:** The two seed incidents (`order-service`, `notification-service`) have no AI-generated RCA.

**Root cause:** AI engine monitors `aiops-platform` and `storefront-service` only. It never generates incidents/RCA for `order-service` or `notification-service`.

**Workaround:** Run a demo scenario to generate live incidents for the monitored services.

---

### Issue 3 — PowerShell does not support bare HTTP verbs

**Error:** `POST : The term 'POST' is not recognized`

**Fix:** Always use `Invoke-RestMethod`:
```powershell
# POST (no body)
Invoke-RestMethod -Method POST -Uri "http://localhost:8080/demo/wow_rca/start"

# POST (with JSON body)
Invoke-RestMethod -Method POST -Uri "http://localhost:8000/api/v1/auth/login" `
  -ContentType "application/json" `
  -Body '{"username":"admin","password":"Admin@123"}'

# GET
Invoke-RestMethod -Method GET -Uri "http://localhost:8080/demo/status"
```

---

### Issue 4 — App infinite refresh loop on login

**Symptom:** Browser reloads endlessly, cannot log in.

**Root cause:** `useAlertNotifications` hook called unauthenticated → API 401 → axios interceptor → `window.location.href = '/login'` → reload → repeat.

**Fix applied:** Hook is guarded by `AlertListener` component that only renders when a token exists.

---

## Access URLs

| Service | URL | Credentials |
|---|---|---|
| Frontend | http://localhost:3000 | See seed accounts below |
| Backend API docs | http://localhost:8000/docs | — |
| Prometheus | http://localhost:9090 | — |
| Grafana | http://localhost:3001 | `admin` / `${GRAFANA_ADMIN_PASSWORD}` |
| Jaeger UI | http://localhost:16686 | — |
| Demo App | http://localhost:8080 | — |

---

## Seed Accounts

| Role | Username | Password | Email |
|---|---|---|---|
| admin | `admin` | `Admin@123` | admin@aiops.local |
| analyst | `alice_analyst` | `Analyst@123` | alice@aiops.local |
| viewer | `bob_viewer` | `Viewer@123` | bob@aiops.local |

---

## Quick Start

```powershell
# 1. Set required env vars in .env file (copy from .env.example)
# Minimum required: POSTGRES_PASSWORD, SECRET_KEY, GRAFANA_ADMIN_PASSWORD

# 2. Start all services
docker-compose up -d

# 3. Wait ~30 seconds for health checks to pass

# 4. Open browser
Start-Process "http://localhost:3000"

# 5. (Optional) Start a demo scenario
Invoke-RestMethod -Method POST -Uri "http://localhost:8080/demo/wow_rca/start"
```

---

## Project File Structure

```
ISPAS/
├── backend/              FastAPI backend
│   ├── app/
│   │   ├── routers/      API endpoints (auth, alerts, incidents, analytics, ...)
│   │   ├── models/       SQLAlchemy ORM models
│   │   ├── schemas/      Pydantic request/response schemas
│   │   └── core/         Database, deps, telemetry
│   └── Dockerfile
├── frontend/             React frontend
│   ├── src/
│   │   ├── pages/        Route-level components
│   │   ├── components/   Reusable UI (Sidebar, Charts, ...)
│   │   ├── api/          Axios API clients
│   │   ├── hooks/        usePolling, useAlertNotifications, useMetricsWS
│   │   └── contexts/     Auth, Toast, TimeRange
│   └── nginx.conf
├── ai-engine/            AI worker
│   ├── app/
│   │   ├── ingestion/    Prometheus + Jaeger data fetching
│   │   ├── detection/    IsolationForest anomaly detector
│   │   ├── rca/          Rule-based RCA engine
│   │   ├── forecasting/  CPU forecast (polynomial regression)
│   │   └── persistence/  PostgreSQL write layer
│   └── Dockerfile
├── demo-app/             Synthetic traffic generator
│   ├── app/
│   │   ├── scenarios.py  Failure scenario definitions
│   │   ├── router_demo.py HTTP endpoints for scenario control
│   │   └── telemetry.py  OTel SDK setup
│   └── Dockerfile
├── infra/
│   ├── db/
│   │   ├── schema.sql    PostgreSQL schema (tables, enums, indexes)
│   │   └── seed.sql      Development seed data
│   ├── prometheus/
│   │   └── prometheus.yml Scrape targets config
│   ├── grafana/          Pre-provisioned dashboards
│   └── otel/             OTel Collector config
├── docs/                 Documentation + troubleshooting
└── docker-compose.yml    Full stack orchestration
```

---

*Generated: 2026-05-17 | AIOps Platform v1.0.0*
