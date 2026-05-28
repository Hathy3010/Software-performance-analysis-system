# 18 — Decision Log

Architecture Decision Records (ADRs) document why key choices were made. This context prevents accidental reversals of intentional decisions.

---

## ADR-001: FastAPI over Django REST Framework

**Date:** 2025-10  
**Status:** Accepted

**Context:** The backend needs to serve a React dashboard and the AI engine needs to write results to the same database. The primary concerns are developer velocity, async I/O for concurrent dashboard polling, and automatic API documentation.

**Decision:** Use FastAPI.

**Reasoning:**
- Native `asyncio` support — no sync-to-async adapter layer needed
- Automatic OpenAPI docs from type annotations (zero extra work)
- Pydantic v2 integration baked in — request validation and response serialisation in one step
- `Annotated` dependency injection is clean and testable
- No ORM bundled — SQLAlchemy 2.0 async integrates without friction

**Consequences:**
- No built-in admin panel (unlike Django) — acceptable, we have Grafana
- Smaller ecosystem for batteries-included features (auth, permissions) — implemented ourselves in `core/security.py` and `core/deps.py`

---

## ADR-002: SQLAlchemy 2.0 Async over Tortoise ORM / encode/databases

**Date:** 2025-10  
**Status:** Accepted

**Context:** Need a Python async ORM for PostgreSQL that supports complex queries, relationships, and migrations.

**Decision:** Use SQLAlchemy 2.0 with `asyncpg` driver and Alembic for migrations.

**Reasoning:**
- SQLAlchemy 2.0 `Mapped` type annotations give compile-time type safety and excellent IDE support
- Alembic `--autogenerate` handles schema diffs reliably
- Tortoise ORM has a smaller community and less mature migration tooling
- `asyncpg` is the fastest async PostgreSQL driver available
- The `GENERATED ALWAYS` computed column for `duration_seconds` requires raw SQL support that SQLAlchemy handles cleanly

**Trade-offs:**
- More boilerplate than Tortoise for simple CRUD
- Async SQLAlchemy requires care around session lifecycle (commit/rollback in `get_db()`)

---

## ADR-003: Isolation Forest over LSTM / statistical thresholds

**Date:** 2025-11  
**Status:** Accepted

**Context:** The anomaly detection model must work without labelled training data and must be explainable to a thesis committee.

**Decision:** Use Isolation Forest (scikit-learn) as the primary detection model, with a z-score spike detector as an independent signal.

**Reasoning:**
- **Unsupervised** — requires no labelled anomalies (which we don't have)
- **Interpretable** — "your metric is in a low-density region of the training distribution" is explainable
- **Fast** — fits on 120 samples in ~15ms; no GPU required
- **Established** — peer-reviewed algorithm (Liu et al., 2008) with extensive validation

**Why not LSTM:**
- Requires labelled sequences or unsupervised pre-training
- Needs more data (hundreds/thousands of samples) to generalise
- Black-box outputs harder to explain at a thesis defense

**Consequences:**
- 20-sample warm-up period where threshold fallback is used instead
- Score is not probabilistic — just "how anomalous" relative to training data
- Re-fits on every call (no model persistence) — adds ~15ms per service per cycle

---

## ADR-004: Remove otel-collector healthcheck; use `service_started`

**Date:** 2025-12  
**Status:** Accepted

**Context:** The `aiops-otel-collector` container was permanently stuck in `unhealthy` state, preventing `backend`, `ai-engine`, and `demo-app` from starting.

**Root cause investigation:**
1. Healthcheck `CMD --dry-run` — flag doesn't exist in otelcol-contrib. Fixed to `wget`.
2. `wget` not available — `otel/opentelemetry-collector-contrib` is built FROM scratch. No shell, no utilities. Any `CMD` will fail with "executable not found."

**Decision:** Remove the healthcheck block entirely from `otel-collector`. Change all three dependent services from `condition: service_healthy` to `condition: service_started`.

**Reasoning:**
- The collector starts in < 5 seconds and is stable once started
- `restart: unless-stopped` ensures it auto-recovers from crashes
- Dependent services use `@retry` (tenacity) for their OTel connections — they handle a brief startup gap gracefully
- No alternative healthcheck mechanism exists for scratch-based images

**Consequences:**
- No health monitoring for otel-collector from Docker's perspective
- First few traces after startup may be dropped if collector isn't ready — acceptable
- The health_check extension (port 13133) is configured but only queryable from within the collector's network, not from Docker host

---

## ADR-005: Schema bootstrapped by `schema.sql`, tracked by Alembic

**Date:** 2025-12  
**Status:** Accepted

**Context:** Need to set up the PostgreSQL schema on first run and manage future changes.

**Decision:** Use PostgreSQL's `initdb` mechanism (`docker-entrypoint-initdb.d/`) for initial schema creation. Use Alembic migration 0001 as a no-op baseline stamp. All future changes use `alembic revision --autogenerate`.

**Reasoning:**
- `schema.sql` gives a clean, readable DDL reference — easier to read than Alembic upgrade scripts
- `initdb` only runs on first container start (empty volume) — idempotent for restarts
- Alembic baseline stamp means `alembic upgrade head` is a no-op on fresh installs (schema already applied by initdb)
- Future incremental changes go through Alembic — standard migration workflow

**Consequences:**
- Developer must remember to update both `schema.sql` (for documentation/reference) AND create an Alembic migration for actual schema changes
- `schema.sql` and Alembic history can diverge if discipline is not maintained

---

## ADR-006: AI Engine uses sync psycopg2, backend uses async asyncpg

**Date:** 2025-12  
**Status:** Accepted

**Context:** The AI engine writes results to the database in a background thread. The backend serves HTTP requests with async I/O.

**Decision:** AI engine uses `psycopg2-binary` (sync). Backend uses `asyncpg` (async).

**Reasoning:**
- The AI engine's pipeline runs in a `threading.Thread` — `asyncio` event loops cannot span thread boundaries safely
- scikit-learn's `IsolationForest.fit()` is CPU-bound and releases the GIL — threading is appropriate
- Using `asyncpg` from a background thread would require creating a new event loop per thread — complex and fragile
- `psycopg2` with a context manager (`get_db_session()`) is simpler and correct for this use case

**Consequences:**
- Two different database clients in the project — higher cognitive overhead
- Developers must not use `asyncpg` APIs in the AI engine or `psycopg2` in the backend

---

## ADR-007: `useRef` for chart history accumulation in frontend

**Date:** 2026-01  
**Status:** Accepted

**Context:** The Metrics page polls for new data every 10 seconds and needs to accumulate a 50-point rolling history for the Recharts `LineChart`.

**Problem:** Using React state inside a `setInterval` callback causes a stale closure — the callback always sees the state value from the first render (empty array), so history never accumulates.

**Decision:** Store history arrays in `useRef`. Mutate the ref directly inside the polling callback. Set state (for rendering) by copying from the ref: `setData([...historyRef.current])`.

**Reasoning:**
- `useRef` holds a stable, mutable reference that is always current — no stale closure
- Buffer mutations don't trigger re-renders (only the `setData` call does)
- The `usePolling` hook's `useRef(fn)` pattern ensures the latest callback is always called without recreating the interval

**Consequences:**
- Slightly less idiomatic React — mutating a ref is intentional here, not a workaround
- Must remember to copy from ref to state for rendering (`[...ref.current]`)
