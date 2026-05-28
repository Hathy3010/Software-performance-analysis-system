# 09 — Core Modules

## Backend: `app/core/`

### `database.py`
Creates the async SQLAlchemy engine and session factory.

Key exports:
- `Base` — declarative base for all ORM models
- `get_db()` — async generator yielding `AsyncSession`; commits on success, rolls back on exception
- `engine` — `create_async_engine` with `asyncpg` dialect

```python
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
```

**Pattern:** All routers receive `db: DBSession` where `DBSession = Annotated[AsyncSession, Depends(get_db)]`.

---

### `security.py`
All authentication primitives. Zero dependencies on FastAPI — pure functions only.

- `hash_password(password: str) → str` — bcrypt via passlib CryptContext
- `verify_password(plain, hashed) → bool` — constant-time comparison
- `create_access_token(sub, role, expires_delta) → str` — HS256, includes `type: "access"` claim
- `create_refresh_token(sub) → str` — HS256, includes `type: "refresh"` claim, 7-day expiry
- `decode_token(token) → dict` — validates signature + expiry, returns payload

The `type` claim distinguishes access from refresh tokens. The refresh endpoint explicitly checks `payload["type"] == "refresh"` before issuing a new access token.

---

### `deps.py`
FastAPI dependency factories. This is the single place where auth, DB access, and pagination are assembled.

- `get_current_user(token, db) → User` — validates JWT type="access", fetches User by UUID sub claim
- `require_roles(*roles) → Callable` — returns a dependency that raises 403 if user.role not in roles
- `Pagination` — dataclass with `skip` and `limit` from query params, defaults 0/20
- `DBSession` — type alias `Annotated[AsyncSession, Depends(get_db)]`
- `PaginationDep` — type alias `Annotated[Pagination, Depends(Pagination.from_query)]`

Usage in router:
```python
@router.post("/", dependencies=[Depends(require_roles("admin", "analyst"))])
async def create_incident(payload: IncidentCreate, db: DBSession):
    ...
```

---

### `telemetry.py`
Initialises OpenTelemetry on application startup.

Called once in the `lifespan` context manager in `main.py`. Instruments:
- `FastAPIInstrumentor` — records spans for every HTTP request/response
- `SQLAlchemyInstrumentor` — records spans for every SQL query (engine, statement, rows)
- `OTLPSpanExporter` — exports spans to `otel-collector:4317` via gRPC

The `OTEL_SERVICE_NAME` environment variable sets the service name visible in Jaeger.

---

## AI Engine: `app/`

### `worker.py`
The pipeline orchestrator. Entry point is `run_pipeline_once()`, called every 60 seconds by the scheduler thread in `main.py`.

Five stages:
1. **Ingest** — `PrometheusIngester.fetch_current_metrics()` + `JaegerIngester.fetch_trace_metrics()`
2. **Detect** — `AnomalyDetector.score(metrics)` for each service
3. **RCA** — `RCAEngine.analyze(anomalous_services, trace_data)` only if any service is anomalous
4. **Forecast** — `PrometheusIngester.fetch_cpu_history()` + `CpuForecaster.forecast_cpu()`
5. **Persist** — `Repository.save_anomaly_result/save_rca_result/save_forecast()`

Module-level singletons `_detector` and `_rca_engine` are created once on module import (buffer state is preserved across pipeline cycles).

---

### `detection/anomaly.py`
`AnomalyDetector` — the core ML component.

**State:** Per-service `deque(maxlen=120)` rolling buffer of 4D feature vectors `[cpu_rate, memory_mb, latency_p99_s, error_rate]`.

**Scoring flow:**
1. Append new features to buffer
2. Check z-score spike (threshold = 3.0) — always runs, can override is_anomaly
3. If `len(buffer) < min_samples (20)` → threshold_fallback heuristics
4. Else → `IsolationForest(n_estimators=100, contamination=0.05).fit(buffer)` then `.decision_function(features)`
5. Normalise: `score = clip(0.5 - decision_function, 0, 1)`

**Output:** `AnomalyResult(service, anomaly_score, is_anomaly, spike_detected, features, method, detail)`

`method` is either `"isolation_forest"` or `"threshold_fallback"` — useful for understanding data quality.

---

### `rca/engine.py`
`RCAEngine` — rule-based causal analysis using Jaeger trace data.

**Three rules (applied in order):**
- **Rule A** — Find the child span service with the highest average duration. Confidence scales from 0.3 at low latency to 0.95 at 2500ms avg.
- **Rule B** — Find child services that had error spans. Confidence scales from 0.5 at 0% error rate to 0.95 at 100%.
- **Rule C** — If no child evidence found, the anomalous service itself is the root cause (confidence 0.50).

**Deduplication:** If Rule A and Rule B both implicate the same service, keep the higher-confidence one.

**Output:** `RCAResult(source_service, candidates[:3], summary)`

---

### `ingestion/prometheus.py`
`fetch_current_metrics(services)` — instant PromQL queries for 4 metrics per service:
- `rate(process_cpu_seconds_total{job}[5m])`
- `process_resident_memory_bytes{job}`
- `histogram_quantile(0.99, sum by (le) (rate(http_request_duration_seconds_bucket{job}[5m])))`
- `sum(rate(http_requests_total{job,status=~"5.."}[5m]))` and the denominator for error_rate

All queries wrapped with `@retry(stop=stop_after_attempt(3))`.

`fetch_cpu_history(service, window_min=60)` — range query returning `(timestamp, cpu_rate)` tuples for forecasting.

---

### `ingestion/jaeger.py`
`fetch_trace_metrics(services, window_min=5)` — queries Jaeger HTTP API `/api/traces` for each service.

Parses the Jaeger response format:
- `processes` dict maps `processID` to `serviceName`
- `spans` array: extracts `duration`, looks for `error=true` in tags
- Returns `Dict[str, TraceMetrics]` with p99 duration, error count, raw span list

---

### `forecasting/cpu_forecast.py`
`forecast_cpu(history)` — CPU forecasting using polynomial regression.

```python
pipeline = Pipeline([
    ("poly", PolynomialFeatures(degree=2)),
    ("lr", LinearRegression()),
])
# Fit on (minutes_from_start, cpu_rate) pairs
# Predict 30 future points
```

Normalises timestamps to minutes-from-start to avoid numerical instability with large epoch values.

---

### `persistence/repository.py`
All database write operations for the AI engine. Uses the sync `get_db_session()` context manager (psycopg2).

- `save_anomaly_result(result)` — looks up service by `name` in `services` table, inserts into `anomaly_results`
- `save_rca_result(result, anomaly)` — finds most recent open incident for the anomalous service, inserts into `rca_results` with link
- `save_forecast(service, points)` — inserts into `forecasts` table with JSONB data points

All functions use try/except and log warnings for missing services (common during first startup before services are registered).

---

## Frontend: Core Modules

### `api/client.js`
Axios instance with two interceptors:
1. **Request** — reads `access_token` from localStorage, attaches `Authorization: Bearer ...`
2. **Response** — catches 401 responses, redirects to `/login`

```javascript
const client = axios.create({ baseURL: import.meta.env.VITE_API_BASE_URL + '/api/v1' })

client.interceptors.request.use(config => {
  const token = localStorage.getItem('access_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

client.interceptors.response.use(null, error => {
  if (error.response?.status === 401) window.location.href = '/login'
  return Promise.reject(error)
})
```

---

### `contexts/AuthContext.jsx`
Manages authentication state for the entire app.

- Reads tokens from localStorage on mount
- Decodes JWT payload with `atob(token.split('.')[1])` to extract `{ id, role, exp }`
- Exposes `{ token, user, login(email, pass), logout() }` via `useAuth()` hook
- `login()` calls `authApi.login()`, stores both tokens, sets user state

---

### `hooks/usePolling.js`
Polling abstraction that avoids the stale-closure problem:

```javascript
export function usePolling(fn, intervalMs, immediate = true) {
  const fnRef = useRef(fn)
  useEffect(() => { fnRef.current = fn }, [fn])

  useEffect(() => {
    if (immediate) fnRef.current()
    const id = setInterval(() => fnRef.current(), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs, immediate])
}
```

The `fnRef` pattern ensures the latest version of `fn` is always called without recreating the interval.
