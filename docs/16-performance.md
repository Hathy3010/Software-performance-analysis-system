# 16 — Performance

## Design Targets

| Endpoint | Target (p99) | Notes |
|---|---|---|
| `GET /dashboard/summary` | < 200ms | 6 aggregation queries; indexed columns |
| `GET /incidents` (paginated) | < 100ms | Index on `started_at DESC`, skip/limit |
| `GET /metrics/current` | < 800ms | Blocks on 8 Prometheus HTTP queries |
| `POST /auth/login` | < 300ms | bcrypt cost factor 12 dominates (~200ms) |
| AI pipeline cycle | < 30s | Well within 60s scheduler interval |
| Frontend TTI (cold) | < 3s | Vite production build, Nginx gzip |

---

## Database Performance

### Index Strategy

The schema uses targeted indexes rather than indexing everything:

```sql
-- Hot path: live alert dashboard
CREATE INDEX idx_alerts_firing ON alerts(service_id, fired_at DESC)
    WHERE status = 'firing';                          -- partial index, tiny and fast

-- Hot path: incident list ordered by recency
CREATE INDEX idx_incidents_started_at ON incidents(started_at DESC);

-- Hot path: service health filter
CREATE INDEX idx_services_status ON services(status);

-- Composite: most common dashboard filter (service + status + severity)
CREATE INDEX idx_alerts_service_status_severity ON alerts(service_id, status, severity);

-- JSONB tag search
CREATE INDEX idx_services_tags ON services USING GIN(tags);
CREATE INDEX idx_alerts_labels ON alerts USING GIN(labels);
```

**Rule:** Never add an index without `EXPLAIN ANALYZE` evidence that it helps. Index writes slow down inserts.

### Connection Pooling

The backend uses SQLAlchemy's async connection pool:
- Default `pool_size=5`, `max_overflow=10`
- Configurable via `DATABASE_URL` pool parameters if needed
- `get_db()` yields a session and returns it to the pool after the request

The AI engine uses a context manager with `psycopg2` — single connection per pipeline cycle, not a pool. This is appropriate for a background worker.

### GENERATED ALWAYS Column

`incidents.duration_seconds` is a PostgreSQL-computed column. Zero application overhead — the database maintains it automatically. No risk of the application sending a stale value.

---

## Backend Performance

### Async I/O

The backend is fully async end-to-end:
- `asyncpg` driver: no blocking I/O on DB queries
- `httpx.AsyncClient`: no blocking I/O on Prometheus proxy calls
- All route handlers are `async def`

A single Uvicorn worker (default) handles concurrent requests via the async event loop. For higher concurrency, increase `--workers` in the Dockerfile CMD.

### bcrypt Cost Factor

`bcrypt` with cost factor 12 takes ~200ms per hash. This is intentional — it makes brute-force attacks expensive. Accept this latency on login. Do not lower the cost factor.

### Pydantic v2

Pydantic v2 (Rust-backed validation) is 5–50× faster than v1 for serialisation of large response objects. The `Page[IncidentRead]` serialisation of 20 incidents completes in < 1ms.

---

## AI Engine Performance

### IsolationForest Timing

| Buffer size | `fit()` time (observed) | Notes |
|---|---|---|
| 20 samples | ~2ms | Warm-up period just ended |
| 60 samples | ~8ms | Typical after 1 hour |
| 120 samples | ~15ms | Full buffer |

These timings are for 4 features, 100 trees. The entire pipeline (2 services) completes in ~2s, well within the 60s budget.

### Scikit-learn Threading

`IsolationForest(n_jobs=1)` — single-threaded. The AI engine runs in a daemon thread inside the FastAPI process. Using `n_jobs=-1` (all cores) would cause thread contention. Keep `n_jobs=1`.

### Numpy Vectorisation

Feature accumulation uses `np.ndarray` (not Python lists) for efficient IsolationForest input. The `deque` stores numpy arrays directly; `np.array(list(buf))` constructs the training matrix with one allocation.

---

## Frontend Performance

### Polling Intervals

| Page | Interval | Reason |
|---|---|---|
| Dashboard | 30s | Aggregated KPIs change slowly |
| Metrics | 10s | Near-real-time chart feel |
| Incidents (auto-refresh) | None (manual reload) | Avoids disrupting open modals |

### History Accumulation

`useRef` arrays cap at `MAX_POINTS = 50` entries. Memory footprint per chart: 50 × ~50 bytes = ~2.5KB. Negligible.

### Bundle Size

Vite production build with code splitting:
- `react-dom` → separate chunk (~130KB gzipped)
- `recharts` → separate chunk (~90KB gzipped)
- App code → ~30KB gzipped
- Total initial load: ~260KB gzipped

Nginx serves with gzip and long-lived `Cache-Control` for hashed asset filenames.

---

## Prometheus Query Performance

The backend's `GET /metrics/current` fires 8 serial HTTP calls to Prometheus (4 queries × 2 services). At 8ms per query: ~64ms network + processing time.

**Optimisation opportunity (not yet implemented):** Fire all 8 queries concurrently with `asyncio.gather()`. Estimated latency reduction: 64ms → ~15ms.

```python
# Current (serial)
for svc in _SERVICES:
    cpu = await _query(client, f'rate(...{svc}...)')
    mem = await _query(client, f'process_resident...{svc}...')

# Better (concurrent)
async def fetch_service(client, svc):
    cpu, mem, lat, err = await asyncio.gather(
        _query(client, cpu_promql),
        _query(client, mem_promql),
        _query(client, lat_promql),
        _query(client, err_promql),
    )
    ...
```

---

## Prometheus Storage Tuning

Default retention: `15d` (configurable via `PROMETHEUS_RETENTION` in `.env`).

At 15-second scrape intervals for 3 targets, Prometheus stores approximately:
- 3 targets × ~50 metrics each × 4 bytes/sample × 5760 samples/day × 15 days ≈ **~52MB**

Well within single-machine constraints.
