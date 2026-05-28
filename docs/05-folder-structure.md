# 05 — Folder Structure

## Root Layout

```
d:\ISPAS\
├── .env                    ← active environment secrets (gitignored)
├── .env.example            ← template — committed, no real secrets
├── .gitignore
├── docker-compose.yml      ← 9-service orchestration
├── Makefile                ← all developer commands
│
├── docs/                   ← you are here
├── infra/                  ← infrastructure configuration (read-only mounts)
├── backend/                ← FastAPI REST API
├── ai-engine/              ← anomaly detection + RCA worker
├── demo-app/               ← instrumented synthetic microservice
└── frontend/               ← React dashboard
```

---

## `infra/` — Infrastructure Config

```
infra/
├── db/
│   ├── schema.sql           ← DDL: all tables, enums, indexes, triggers, constraints
│   └── seed.sql             ← demo data: 3 users, 5 services, 2 incidents, RCA, reports
│
├── otel/
│   └── otel-collector-config.yml   ← receivers, exporters, pipelines
│
├── prometheus/
│   └── prometheus.yml       ← scrape configs (backend:8000, demo-app:8080, otel-collector:8889)
│
└── grafana/
    ├── dashboards/
    │   └── aiops-overview.json     ← provisioned dashboard (auto-loaded on startup)
    └── provisioning/
        ├── datasources/
        │   └── datasources.yml     ← auto-configures Prometheus datasource
        └── dashboards/
            └── dashboards.yml      ← tells Grafana where to find dashboard JSON files
```

**Rule:** Never edit these files in a running container. Edit the source file and restart the container.

---

## `backend/` — FastAPI Service

```
backend/
├── Dockerfile              ← multi-stage: builder (pip install) → production (slim runtime)
├── requirements.txt        ← pinned dependencies
├── alembic.ini             ← Alembic configuration (points to env.py)
│
├── alembic/
│   ├── env.py              ← async migration runner (asyncio.run + connection.run_sync)
│   └── versions/
│       └── 0001_initial_schema.py  ← baseline no-op stamp
│
└── app/
    ├── main.py             ← FastAPI app factory, middleware, router inclusion, lifespan
    ├── config.py           ← Settings (pydantic-settings), lru_cache get_settings()
    │
    ├── core/
    │   ├── database.py     ← async engine, async_sessionmaker, Base declarative, get_db()
    │   ├── security.py     ← hash_password, verify_password, create_*_token, decode_token
    │   ├── deps.py         ← get_current_user, require_roles(), Pagination, DBSession type alias
    │   └── telemetry.py    ← init_telemetry(): FastAPIInstrumentor + SQLAlchemyInstrumentor
    │
    ├── models/             ← SQLAlchemy ORM models (one file per table)
    │   ├── user.py         ← User (id, email, username, role, is_active)
    │   ├── service.py      ← Service (name, type, status, prometheus_job, metadata_)
    │   ├── alert.py        ← Alert (severity, status, fingerprint, fired_at, resolved_at)
    │   ├── incident.py     ← Incident (duration_seconds GENERATED ALWAYS)
    │   └── report.py       ← Report (report_type, format, status, content)
    │
    ├── schemas/            ← Pydantic v2 request/response models
    │   ├── common.py       ← Page[T] generic pagination wrapper
    │   ├── auth.py         ← LoginRequest, TokenResponse, RefreshRequest
    │   ├── user.py         ← UserCreate, UserRead, UserUpdate
    │   ├── service.py      ← ServiceCreate, ServiceRead, ServiceUpdate
    │   ├── alert.py        ← AlertCreate, AlertRead, AlertUpdate
    │   ├── incident.py     ← IncidentCreate, IncidentRead, IncidentUpdate
    │   ├── report.py       ← ReportCreate, ReportRead
    │   └── dashboard.py    ← DashboardSummary, ServiceStatusCount, AlertSeverityCount
    │
    └── routers/            ← one file per resource group
        ├── auth.py         ← POST /auth/login, POST /auth/refresh
        ├── users.py        ← CRUD /users (admin only for write)
        ├── services.py     ← CRUD /services
        ├── alerts.py       ← CRUD /alerts + critical background task
        ├── incidents.py    ← CRUD /incidents + POST /resolve + GET /{id}/rca
        ├── reports.py      ← CRUD /reports
        ├── dashboard.py    ← GET /dashboard/summary (KPI aggregation)
        └── metrics.py      ← GET /metrics/current (Prometheus proxy)
```

---

## `ai-engine/` — ML Worker

```
ai-engine/
├── Dockerfile
├── requirements.txt        ← scikit-learn, numpy, pandas, tenacity, psycopg2-binary
│
└── app/
    ├── main.py             ← FastAPI app + lifespan: init_db → start scheduler thread
    ├── config.py           ← anomaly_score_threshold, min_samples, monitored_services
    ├── worker.py           ← run_pipeline_once(): 5-stage orchestrator
    │
    ├── core/
    │   ├── database.py     ← sync engine, get_db_session() context manager, init_db()
    │   ├── logging_setup.py ← JSON structured logging
    │   └── telemetry.py    ← OTel init
    │
    ├── ingestion/
    │   ├── prometheus.py   ← fetch_current_metrics(), fetch_cpu_history()
    │   └── jaeger.py       ← fetch_trace_metrics() → Dict[str, TraceMetrics]
    │
    ├── detection/
    │   └── anomaly.py      ← AnomalyDetector: rolling buffer, IsolationForest, fallback
    │
    ├── rca/
    │   └── engine.py       ← RCAEngine: Rule A/B/C, confidence scoring, top-3
    │
    ├── forecasting/
    │   └── cpu_forecast.py ← PolynomialFeatures(2) + LinearRegression, 30-point output
    │
    └── persistence/
        └── repository.py   ← save_anomaly_result(), save_rca_result(), save_forecast()
```

---

## `frontend/` — React Dashboard

```
frontend/
├── Dockerfile              ← Stage 1: Node/Vite build → Stage 2: Nginx serve
├── nginx.conf              ← serves SPA (try_files → index.html), /health endpoint
├── .dockerignore
├── package.json            ← React 18, Vite, TailwindCSS, Axios, Recharts
├── vite.config.js          ← @/ alias → ./src, @vitejs/plugin-react
├── tailwind.config.js      ← content glob, no custom theme extensions
├── postcss.config.js       ← tailwindcss + autoprefixer
├── index.html              ← Vite entry point
│
└── src/
    ├── main.jsx            ← React.createRoot, mounts <App />
    ├── App.jsx             ← BrowserRouter + AuthProvider + ToastProvider + 5 Routes
    ├── index.css           ← @tailwind base/components/utilities
    │
    ├── api/                ← one file per backend resource
    │   ├── client.js       ← Axios instance (baseURL, Bearer interceptor, 401 redirect)
    │   ├── auth.js         ← login(), refresh()
    │   ├── dashboard.js    ← getSummary()
    │   ├── alerts.js       ← list(), get(), create(), update(), resolve()
    │   ├── incidents.js    ← list(), get(), create(), update(), resolve(), getRca()
    │   ├── services.js     ← CRUD functions
    │   └── metrics.js      ← getCurrent()
    │
    ├── contexts/
    │   ├── AuthContext.jsx ← token storage, JWT decode (atob), login/logout, useAuth()
    │   └── ToastContext.jsx ← addToast(msg, variant), auto-dismiss, useToast()
    │
    ├── hooks/
    │   └── usePolling.js   ← setInterval with useRef callback (stale-closure-safe)
    │
    ├── utils/
    │   ├── cn.js           ← cn(...classes): clsx + twMerge
    │   └── format.js       ← formatDate(), formatDuration(), formatBytes()
    │
    ├── components/
    │   ├── ui/
    │   │   ├── Badge.jsx       ← status/severity chips, all variants in one object
    │   │   ├── Button.jsx      ← primary/outline/ghost/destructive variants
    │   │   └── Skeleton.jsx    ← loading placeholder (pulsing zinc-800 block)
    │   └── layout/
    │       ├── Sidebar.jsx         ← NavLink navigation, active = blue-600/15
    │       ├── DashboardLayout.jsx ← auth guard (→ /login if no token), PageHeader
    │       └── ChartTooltip.jsx    ← dark Recharts custom tooltip (zinc-800 bg)
    │
    └── pages/
        ├── Login.jsx       ← form, useAuth().login(), error toast
        ├── Dashboard.jsx   ← 5 StatCards, alert bar chart, service grid, 30s poll
        ├── Metrics.jsx     ← CPU + latency LineCharts, useRef history, 10s poll
        ├── Incidents.jsx   ← table, search/filter, IncidentModal + RcaSection, resolve
        └── Services.jsx    ← table, ServiceForm modal (create/edit), DeleteConfirm modal
```

---

## Naming Conventions

| Layer | Convention | Example |
|---|---|---|
| Python modules | `snake_case` | `anomaly_detector.py` |
| Python classes | `PascalCase` | `AnomalyDetector` |
| Python functions | `snake_case` | `fetch_current_metrics` |
| React components | `PascalCase` | `IncidentModal` |
| React hooks | `camelCase` prefixed `use` | `usePolling` |
| API files | `camelCase` noun | `incidents.js` |
| CSS classes | Tailwind utilities only | `bg-zinc-900 text-zinc-50` |
| DB tables | `snake_case` plural | `anomaly_results` |
| DB columns | `snake_case` | `started_at`, `is_active` |
| Environment vars | `UPPER_SNAKE_CASE` | `ANOMALY_SCORE_THRESHOLD` |
