# 04 — Technology Stack

## Backend

| Technology | Version | Why chosen |
|---|---|---|
| **Python** | 3.12 | Latest stable; `asyncio` native; best ML ecosystem |
| **FastAPI** | 0.111 | Native async, automatic OpenAPI docs, Pydantic integration, ASGI |
| **Uvicorn** | 0.29 | ASGI server; `[standard]` includes `uvloop` for performance |
| **SQLAlchemy** | 2.0 | `Mapped` type annotations; fully async with `asyncpg` driver |
| **asyncpg** | 0.29 | Fastest async PostgreSQL driver; pure Python protocol implementation |
| **Alembic** | 1.13 | SQLAlchemy's official migration tool; supports async env.py |
| **Pydantic v2** | 2.7 | Fastest Python validation library; 5–50× faster than v1 |
| **pydantic-settings** | 2.2 | `.env` file loading with type coercion |
| **python-jose** | 3.3 | JWT creation and validation; `[cryptography]` extra for RS256 support |
| **passlib** | 1.7 | Password hashing; `[bcrypt]` extra; constant-time comparison built-in |
| **httpx** | 0.27 | Async HTTP client for Prometheus/Jaeger proxy calls |
| **prometheus-fastapi-instrumentator** | 7.0 | Auto-instruments FastAPI routes with request duration histograms |
| **OTel Python SDK** | 1.24 | OTLP exporter, FastAPI + SQLAlchemy auto-instrumentation |

## AI Engine

| Technology | Version | Why chosen |
|---|---|---|
| **scikit-learn** | 1.5 | IsolationForest, PolynomialFeatures, LinearRegression; well-tested, fast |
| **NumPy** | 1.26 | Vectorised feature arrays for IsolationForest input |
| **Pandas** | 2.2 | Time-series manipulation for CPU history ingestion |
| **psycopg2-binary** | 2.9 | Sync PostgreSQL driver; appropriate for CPU-bound background thread |
| **tenacity** | 8.3 | `@retry` decorator with exponential backoff; cleaner than manual try/sleep loops |
| **prometheus-client** | 0.20 | Exposes AI engine's own `/metrics` for Prometheus scraping |

## Frontend

| Technology | Version | Why chosen |
|---|---|---|
| **React** | 18.3 | Concurrent rendering, hooks, widely adopted |
| **Vite** | 5.2 | Sub-second HMR; ES module native; replaces CRA |
| **TailwindCSS** | 3.4 | Utility-first; no CSS file maintenance; dark theme via `zinc-*` palette |
| **React Router** | 6.23 | Client-side routing with `NavLink` active state detection |
| **Axios** | 1.7 | Promise-based HTTP; request/response interceptors for auth and 401 handling |
| **Recharts** | 2.12 | React-native charting; `ResponsiveContainer` for fluid layouts |
| **clsx** | 2.1 | Conditional class name construction |
| **tailwind-merge** | 2.3 | Resolves conflicting Tailwind classes in the `cn()` utility |

## Infrastructure

| Technology | Version | Why chosen |
|---|---|---|
| **PostgreSQL** | 16 | GENERATED ALWAYS columns, UUID PK, JSONB, GIN indexes, mature ecosystem |
| **Docker Compose** | v2 | Single-machine orchestration; `depends_on.condition` for ordered startup |
| **Nginx** | Alpine | Serves Vite build artifacts; lightweight reverse proxy for frontend |
| **Prometheus** | 2.52 | Industry-standard metrics TSDB; PromQL for instant and range queries |
| **Grafana** | 10.4 | Best-in-class metric visualisation; provisioned datasources and dashboards |
| **Jaeger** | 1.57 | OpenTelemetry-native trace backend; all-in-one for single-machine deployment |
| **OTel Collector Contrib** | 0.102 | Vendor-neutral telemetry fan-out; scratch-based image (minimal attack surface) |

## Development Tools

| Tool | Purpose |
|---|---|
| **GNU Make** | Single entry point for all operator commands (`make up`, `make logs`, etc.) |
| **ruff** | Python linter (replaces flake8 + isort + pyupgrade) |
| **mypy** | Python static type checker |
| **ESLint** | JavaScript linting |
| **pytest** | Python test runner |
| **Vitest** | Vite-native JavaScript test runner |
| **React Testing Library** | Component testing with user-event simulation |

---

## Why Not X?

| Alternative considered | Why not chosen |
|---|---|
| Django REST Framework | Sync-first; heavier; Pydantic integration is bolted on |
| Flask | No native async; manual OpenAPI generation |
| Tortoise ORM | Less mature than SQLAlchemy 2.0; smaller ecosystem |
| SQLite | No GENERATED ALWAYS columns; not suitable for concurrent async writes |
| Webpack / CRA | Slow HMR; Vite is the modern standard |
| Redux | Overkill for this app's state complexity; Context API suffices |
| LSTM forecasting | Requires labelled training data and GPU; polynomial regression is interpretable and fast |
| Docker Swarm / Kubernetes | Out of scope for single-machine graduation project |
