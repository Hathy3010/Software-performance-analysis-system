# 20 — New Developer Onboarding

Welcome to the AIOps project. This checklist will take you from zero to productive contributor in roughly 2–3 hours.

---

## Phase 1: Understand the System (30 min)

Read these in order. Each is short and focused.

```
□ README.md                  ← quick overview and service URLs (5 min)
□ 01-project-overview.md     ← what it does and why (10 min)
□ 03-architecture.md         ← how the pieces connect (10 min)
□ 11-codemap.md              ← "where is X?" reference (5 min)
```

---

## Phase 2: Run It Locally (30 min)

Follow [12-local-setup.md](12-local-setup.md) exactly.

```
□ Install Docker Desktop 24+ and verify: docker compose version
□ Clone the repo and cd into the project root
□ Run: make setup
□ Edit .env — set POSTGRES_PASSWORD, SECRET_KEY, GRAFANA_ADMIN_PASSWORD
□ Run: make build    (takes 3–5 min first time)
□ Run: make up
□ Run: make ps       (wait until all containers show healthy)
```

Verify it works:
```
□ Open http://localhost:3000 — login page appears
□ Login with admin@aiops.local / Admin@123
□ Dashboard KPI cards load with data
□ Navigate to Incidents — 2 rows appear
□ Click an incident → RCA panel shows root cause
□ Open http://localhost:8000/docs — Swagger UI appears
□ Open http://localhost:9090/targets — targets show UP
□ Open http://localhost:16686 — Jaeger UI appears
```

---

## Phase 3: Explore the Codebase (45 min)

### Backend
```
□ Read backend/app/main.py — understand lifespan, routers, middleware
□ Read backend/app/core/deps.py — understand auth dependency injection
□ Read backend/app/routers/incidents.py — most complete router example
□ Open http://localhost:8000/docs — try GET /incidents as admin
```

### AI Engine
```
□ Read ai-engine/app/worker.py — understand the 5-stage pipeline
□ Read ai-engine/app/detection/anomaly.py — understand IsolationForest usage
□ Run: docker compose logs -f ai-engine (watch a live pipeline cycle)
```

### Frontend
```
□ Read frontend/src/App.jsx — routing structure
□ Read frontend/src/contexts/AuthContext.jsx — token management
□ Read frontend/src/hooks/usePolling.js — understand the useRef pattern
□ Read frontend/src/pages/Incidents.jsx — most feature-complete page
```

### Database
```
□ Run: make db-shell
□ Run: \dt (list tables)
□ Run: SELECT id, title, status, duration_seconds FROM incidents;
□ Run: SELECT service_id, anomaly_score, method FROM anomaly_results LIMIT 5;
□ Exit: \q
```

---

## Phase 4: Make a Small Change (30 min)

### Option A: Add a field to incident responses

1. Open `backend/app/schemas/incident.py` and add `notes: str | None = None` to `IncidentRead`
2. Open `backend/app/models/incident.py` and add `notes: Mapped[str | None] = mapped_column(Text, nullable=True)`
3. Run `make backend-shell` then `alembic revision --autogenerate -m "add_notes_to_incidents"`
4. Run `alembic upgrade head`
5. Test: `GET /incidents/{id}` in Swagger — verify `notes` field appears in response

### Option B: Change the anomaly detection threshold

1. Open `.env` and change `ANOMALY_SCORE_THRESHOLD=0.60`
2. Run `docker compose restart ai-engine`
3. Watch logs: `docker compose logs -f ai-engine` — should see more anomalies detected

### Option C: Add a frontend toast on page load

1. Open `frontend/src/pages/Dashboard.jsx`
2. In the `useEffect` that fetches summary, add `addToast('Dashboard loaded', 'info')` on success
3. Run `docker compose build frontend && docker compose up -d frontend`
4. Refresh the dashboard — info toast appears

---

## Phase 5: Read Reference Docs (as needed)

Keep these bookmarked for reference — don't try to read all at once:

| When you need to… | Read |
|---|---|
| Add a new table | [07-database-schema.md](07-database-schema.md) |
| Add a new API endpoint | [08-api-docs.md](08-api-docs.md) + [06-coding-standards.md](06-coding-standards.md) |
| Understand a module deeply | [09-core-modules.md](09-core-modules.md) |
| Trace a feature end-to-end | [10-feature-guide.md](10-feature-guide.md) |
| Debug a broken service | [17-troubleshooting.md](17-troubleshooting.md) |
| Understand why something was built a certain way | [18-decision-log.md](18-decision-log.md) |
| Write a test | [14-testing.md](14-testing.md) |
| Check security requirements | [15-security.md](15-security.md) |

---

## Key Concepts to Internalize

### 1. Dependency injection pattern
Every FastAPI route uses `Annotated` type aliases for clean dependency injection. Never write bare `Depends()` in a function signature.

```python
DBSession = Annotated[AsyncSession, Depends(get_db)]

async def my_handler(db: DBSession, _: AuthDep):
    ...
```

### 2. The AI engine has its own DB client
The backend uses async `asyncpg`. The AI engine uses sync `psycopg2`. This is intentional (see [ADR-006](18-decision-log.md)). Don't mix them.

### 3. `useRef` for polling state
The `usePolling` hook and chart history accumulation in Metrics use `useRef` deliberately to avoid stale closures. This is not a bug — it's the correct React pattern for interval-based state updates. See [ADR-007](18-decision-log.md).

### 4. `duration_seconds` is computed by PostgreSQL
Never set `Incident.duration_seconds` in application code. PostgreSQL computes it from `(COALESCE(resolved_at, NOW()) - started_at)`. Writing to it will fail with a `GeneratedAlwaysError`.

### 5. Enums are owned by `schema.sql`
Adding a new enum value requires updating `schema.sql` AND the SQLAlchemy model. Use `create_type=False` in models — enums must already exist in PostgreSQL.

---

## Who to Ask

| Topic | Contact |
|---|---|
| Backend / API design | Check [08-api-docs.md](08-api-docs.md) + Swagger first |
| AI engine / ML | Check [09-core-modules.md](09-core-modules.md) + inline code comments |
| Infrastructure / Docker | Check [13-deployment.md](13-deployment.md) + [17-troubleshooting.md](17-troubleshooting.md) |
| Database schema | Check [07-database-schema.md](07-database-schema.md) + `infra/db/schema.sql` |
| Design decisions | Check [18-decision-log.md](18-decision-log.md) before changing established patterns |

---

## Contribution Checklist

Before submitting any change:

```
□ Tests pass: cd backend && pytest  (or cd ai-engine && pytest)
□ Linting passes: ruff check app/
□ Type check passes: mypy app/core app/models app/schemas
□ Docker builds: docker compose build <service>
□ No hardcoded secrets
□ Database change has an Alembic migration
□ New endpoints documented in 08-api-docs.md
□ Significant design change has a new ADR in 18-decision-log.md
□ Commit message follows: type(scope): description
```
