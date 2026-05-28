# 11 — Codemap

Use this file as a "where is X?" reference. If you're looking for something specific, find it here.

---

## "Where do I change X?"

| I want to… | Go to |
|---|---|
| Add a new API endpoint | `backend/app/routers/<resource>.py` + `backend/app/schemas/<resource>.py` |
| Add a new DB table | `infra/db/schema.sql` + `backend/app/models/<table>.py` + `alembic revision --autogenerate` |
| Change JWT expiry times | `backend/app/config.py` → `access_token_expire_minutes` / `refresh_token_expire_days` |
| Add a new user role | `infra/db/schema.sql` ENUM + `backend/app/models/user.py` Enum + `backend/app/core/deps.py` require_roles calls |
| Add a new monitored service to the AI engine | `MONITORED_SERVICES` env var in `.env` (comma-separated) |
| Change the anomaly score threshold | `ANOMALY_SCORE_THRESHOLD` in `.env` |
| Change the pipeline interval | `DETECTION_INTERVAL_SECONDS` in `.env` |
| Add a new Prometheus scrape target | `infra/prometheus/prometheus.yml` → `scrape_configs` |
| Add a new Grafana dashboard | Place JSON in `infra/grafana/dashboards/` |
| Add an OTel export destination | `infra/otel/otel-collector-config.yml` → `exporters` + `pipelines` |
| Change CORS allowed origins | `CORS_ORIGINS` in `.env` |
| Change poll interval on Dashboard page | `pages/Dashboard.jsx` → `usePolling(..., 30_000)` second arg |
| Change chart history depth | `pages/Metrics.jsx` → `MAX_POINTS` constant |
| Add a new frontend page | `frontend/src/pages/NewPage.jsx` + add `<Route>` in `App.jsx` + add `NavLink` in `Sidebar.jsx` |
| Add a Toast notification variant | `contexts/ToastContext.jsx` → `variantStyles` object |
| Change badge colors | `components/ui/Badge.jsx` → `variants` object |

---

## Key File Index

### Authentication
- Token creation/validation: `backend/app/core/security.py`
- FastAPI auth dependency: `backend/app/core/deps.py` → `get_current_user`
- Role enforcement factory: `backend/app/core/deps.py` → `require_roles()`
- Login endpoint: `backend/app/routers/auth.py`
- Frontend auth state: `frontend/src/contexts/AuthContext.jsx`
- Axios token attachment: `frontend/src/api/client.js`

### Database
- Schema DDL (ground truth): `infra/db/schema.sql`
- Seed data: `infra/db/seed.sql`
- ORM models: `backend/app/models/`
- Async session factory: `backend/app/core/database.py`
- Migration baseline: `backend/alembic/versions/0001_initial_schema.py`
- Migration runner: `backend/alembic/env.py`

### AI Engine
- Pipeline entry point: `ai-engine/app/worker.py` → `run_pipeline_once()`
- Scheduler setup: `ai-engine/app/main.py` → `lifespan()`
- Anomaly logic: `ai-engine/app/detection/anomaly.py` → `AnomalyDetector.score()`
- RCA logic: `ai-engine/app/rca/engine.py` → `RCAEngine.analyze()`
- Prometheus queries: `ai-engine/app/ingestion/prometheus.py`
- Jaeger queries: `ai-engine/app/ingestion/jaeger.py`
- Write to DB: `ai-engine/app/persistence/repository.py`

### Frontend State
- Global auth: `frontend/src/contexts/AuthContext.jsx`
- Toast notifications: `frontend/src/contexts/ToastContext.jsx`
- Polling: `frontend/src/hooks/usePolling.js`
- API calls: `frontend/src/api/*.js`

### Docker / Infrastructure
- Service definitions: `docker-compose.yml`
- Startup guards: `depends_on` blocks in `docker-compose.yml`
- Port mappings: `docker-compose.yml` → `ports:` sections
- Developer commands: `Makefile`
- Prometheus scrape targets: `infra/prometheus/prometheus.yml`
- OTel routing: `infra/otel/otel-collector-config.yml`

---

## Request Flow Map

```
GET /api/v1/incidents
  ↓ nginx (frontend container, if proxied)
  ↓ FastAPI app.include_router (main.py:55–62)
  ↓ CORS middleware (main.py:34–40)
  ↓ Prometheus instrumentator (auto)
  ↓ router = APIRouter(prefix="/incidents") (routers/incidents.py:13)
  ↓ list_incidents() handler (routers/incidents.py:22)
  ↓ Depends(get_current_user) (core/deps.py:get_current_user)
    ↓ OAuth2PasswordBearer extracts token
    ↓ decode_token(token) (core/security.py)
    ↓ db.get(User, uuid) (async)
  ↓ SQLAlchemy select(Incident).where(...).offset().limit()
  ↓ asyncpg executes query on postgres:5432
  ↓ Pydantic Page[IncidentRead] serialisation
  ↓ JSON response
  ↓ OTel span exported to otel-collector:4317
```

---

## Database Query Map

| What you need | Where the query is |
|---|---|
| List incidents with pagination + filters | `routers/incidents.py:list_incidents()` |
| Dashboard aggregation (6 queries) | `routers/dashboard.py:get_summary()` |
| RCA results for incident | `routers/incidents.py:get_incident_rca()` — raw SQL |
| Anomaly count (last 24h) | `routers/dashboard.py` — raw SQL on `anomaly_results` |
| MTTR calculation | `routers/dashboard.py` — `func.avg(Incident.duration_seconds)` |
| Insert anomaly result | `ai-engine/app/persistence/repository.py:save_anomaly_result()` |
| Link RCA to open incident | `ai-engine/app/persistence/repository.py:save_rca_result()` — subquery for open incident |

---

## Environment Variable Map

| Variable | Read by | File |
|---|---|---|
| `DATABASE_URL` | backend, ai-engine | `app/config.py` |
| `SECRET_KEY` | backend | `app/core/security.py` (via settings) |
| `CORS_ORIGINS` | backend | `app/main.py` (via settings) |
| `PROMETHEUS_URL` | backend, ai-engine | `app/config.py` |
| `JAEGER_URL` | ai-engine | `app/config.py` |
| `ANOMALY_SCORE_THRESHOLD` | ai-engine | `ai-engine/app/config.py` |
| `MONITORED_SERVICES` | ai-engine | `ai-engine/app/config.py` → `monitored_services_list` property |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | backend, ai-engine, demo-app | OTel SDK (reads env directly) |
| `OTEL_SERVICE_NAME` | backend, ai-engine, demo-app | OTel SDK (reads env directly) |
| `VITE_API_BASE_URL` | frontend | `api/client.js` → `import.meta.env.VITE_API_BASE_URL` |
| `SIMULATE_ANOMALIES` | demo-app | `demo-app/app/main.py` |
