# 19 — Changelog

All notable changes to the AIOps platform are documented here.  
Format: `[version] YYYY-MM-DD — description`

---

## [1.0.0] 2026-04-30 — Initial production release

### Added — Infrastructure
- Docker Compose stack: 9 services (postgres, backend, ai-engine, demo-app, frontend, prometheus, grafana, jaeger, otel-collector)
- Three isolated Docker networks: `db-net` (internal), `monitoring-net` (internal), `frontend-net`
- Persistent volumes for postgres, prometheus, grafana data
- `Makefile` with `setup`, `up`, `down`, `build`, `rebuild`, `reset`, `logs`, `ps`, `db-shell`, `backend-shell`, `ai-shell`, `seed`, `reload-prometheus`, `open`
- `infra/db/schema.sql` — full DDL with 8 tables, 10 enum types, 30+ indexes, auto-update triggers
- `infra/db/seed.sql` — demo data: 3 users (admin/analyst/viewer), 5 services, 2 incidents, 3 alerts, 2 anomaly results, 1 RCA result, 1 report, 4 audit entries
- Prometheus scrape config for backend, demo-app, otel-collector (port 8889), self
- Grafana provisioned datasource (Prometheus) and dashboard (AIOps Overview)
- OTel Collector config: OTLP gRPC receiver → Jaeger exporter + Prometheus exporter

### Added — Backend (FastAPI)
- JWT authentication: `POST /auth/login`, `POST /auth/refresh`
- RBAC with three roles: admin, analyst, viewer
- `require_roles()` dependency factory; `Annotated` pattern throughout
- 8 API routers: auth, users, services, alerts, incidents, reports, dashboard, metrics
- `GET /incidents/{id}/rca` endpoint for RCA result inspection
- `POST /incidents/{id}/resolve` with 409 guard for already-resolved incidents
- `GET /dashboard/summary` — 6-query aggregation (services, incidents, alerts, anomalies, MTTR)
- `GET /metrics/current` — Prometheus proxy for frontend charts
- Background task on critical alert creation (logs CRITICAL severity)
- `Page[T]` generic pagination wrapper (skip/limit/total)
- SQLAlchemy 2.0 async models with `Mapped` annotations
- `Incident.duration_seconds` as SQLAlchemy `Computed` GENERATED ALWAYS column
- Alembic async migration setup; migration 0001 baseline stamp
- OpenTelemetry instrumentation (FastAPI + SQLAlchemy auto-instrumentation)
- Prometheus metrics endpoint via `prometheus-fastapi-instrumentator`

### Added — AI Engine
- 60-second scheduler pipeline (5 stages: ingest, detect, RCA, forecast, persist)
- `AnomalyDetector`: per-service rolling deque (maxlen=120), IsolationForest (n_estimators=100, contamination=0.05), z-score spike detection
- Threshold fallback during warm-up (< 20 samples)
- `RCAEngine`: Rule A (highest child latency), Rule B (child errors), Rule C (self-anomaly), top-3 candidates
- `CpuForecaster`: PolynomialFeatures(degree=2) + LinearRegression, 30-point output
- `PrometheusIngester`: instant queries for cpu/mem/latency/error_rate, range query for history
- `JaegerIngester`: trace metrics parsing (spans, durations, error flags, p99)
- `Repository`: persist anomaly results, RCA results (linked to open incidents), forecasts
- Tenacity retry (3 attempts, exponential backoff) on all external HTTP calls
- OTel instrumentation (FastAPI + custom spans)

### Added — Frontend (React)
- Login page with JWT authentication
- Dashboard page: 5 KPI cards, alert severity bar chart, service health grid (30s poll)
- Metrics page: CPU + latency Recharts LineCharts (10s poll, 50-point history via useRef)
- Incidents page: searchable/filterable table, IncidentModal with RCA section, resolve button
- Services page: full CRUD with create/edit/delete modals and form validation
- `AuthContext` — JWT decode, localStorage token management, useAuth() hook
- `ToastContext` — 4-variant (success/error/warning/info) auto-dismiss notifications
- `usePolling` hook — stale-closure-safe polling via useRef callback pattern
- `DashboardLayout` — auth guard, `PageHeader`, `Sidebar` with NavLink active state
- `Badge`, `Button`, `Skeleton` reusable UI components
- `cn()` utility (clsx + tailwind-merge)
- `format.js` utilities: formatDate, formatDuration, formatBytes
- Axios instance with Bearer interceptor and 401 → login redirect
- Vite `@/` alias, TailwindCSS dark theme (zinc-950 base)

### Added — Demo App
- FastAPI app with synthetic order and payment endpoints
- Configurable latency simulation (`_simulate_latency()`)
- 5% random HTTP 500 errors (`_maybe_raise_error()`)
- 10% chance of latency spike on `/api/payments` to trigger anomaly detection
- `SIMULATE_ANOMALIES` env var toggle
- OTel instrumentation
- Prometheus metrics endpoint

### Fixed
- `otel-collector` permanently unhealthy: removed healthcheck (scratch image), changed all three dependents to `condition: service_started`
- `vite.config.js` import path: changed `'path'` to `'node:path'` (SonarLint S7772)
- `incidents.py` SonarLint S8410: refactored to `Annotated[object, Depends(...)]` pattern
- `incidents.py` SonarLint S1192: extracted `_NOT_FOUND` constant
- `incidents.py` SonarLint S8415: added `responses=_404` / `responses=_404_409` to routes

---

## Planned — Future Versions

### [1.1.0] — Observability Enhancements
- Alertmanager integration for alert routing (Slack, email)
- Log aggregation (Loki or ELK)
- Grafana traces-to-metrics correlation

### [1.2.0] — AI Improvements
- Async model fitting (off the critical path)
- `asyncio.gather()` for concurrent Prometheus queries
- LSTM forecasting option alongside polynomial regression
- Anomaly confirmation workflow (human feedback loop)

### [2.0.0] — Kubernetes Migration
- Helm chart for all services
- Horizontal pod autoscaling for backend
- Managed PostgreSQL (RDS/Cloud SQL)
- Secrets management (Vault/AWS Secrets Manager)
