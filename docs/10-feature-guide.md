# 10 — Feature Guide

This document traces each major feature from user action through to database, covering every layer.

---

## Feature 1: User Login

**User action:** Enter email + password, click Sign In.

**Frontend** (`pages/Login.jsx`):
- Controlled form state (`email`, `password`)
- Calls `useAuth().login(email, password)` on submit
- `AuthContext.login()` → `authApi.login()` → `POST /api/v1/auth/login`
- On success: stores `access_token` + `refresh_token` in localStorage, sets `user` state, redirects to `/`
- On failure: `addToast(error.response.data.detail, 'error')`

**Backend** (`routers/auth.py`):
- Validates credentials: `SELECT * FROM users WHERE email = ?`
- `verify_password(plain, hashed)` — bcrypt constant-time comparison
- Creates access token (30 min) + refresh token (7 days) with `type` claim
- Returns `{ access_token, refresh_token, token_type }`

**Guards:** `DashboardLayout.jsx` checks `useAuth().token` on every render — redirects to `/login` if falsy.

---

## Feature 2: Dashboard KPI Summary

**User action:** Land on Dashboard page (auto-loads, polls every 30 seconds).

**Frontend** (`pages/Dashboard.jsx`):
- `usePolling(fetchSummary, 30_000)`
- `dashboardApi.getSummary()` → `GET /api/v1/dashboard/summary`
- Renders 5 `StatCard` components, alert severity bar chart, service health grid

**Backend** (`routers/dashboard.py`):
- Single async function with 5 independent SQL aggregations:
  1. `GROUP BY service.status` → service counts
  2. `COUNT(incidents WHERE status IN ['open','investigating'])` → open_incidents
  3. `COUNT(alerts WHERE status = 'firing')` → firing_alerts
  4. `GROUP BY alert.severity WHERE status = 'firing'` → alert_severity breakdown
  5. `AVG(incidents.duration_seconds WHERE status = 'resolved')` → MTTR
  6. Raw SQL on `anomaly_results WHERE is_anomaly = true AND detected_at >= NOW()-24h` → recent_anomalies_24h

**Why no caching:** The summary is a live aggregate; staleness of 30 seconds is acceptable.

---

## Feature 3: Real-time Metrics Charts

**User action:** Navigate to Metrics page.

**Frontend** (`pages/Metrics.jsx`):
- Two `useRef` arrays: `cpuHistory` and `latencyHistory` (max 50 points each)
- `usePolling(fetchAndAppend, 10_000)`
- On each poll: `metricsApi.getCurrent()` → slice to last 49 items + append new point → `setCpuData([...cpuHistory.current])`
- `ResponsiveContainer > LineChart` with custom dark `ChartTooltip`

**Backend** (`routers/metrics.py`):
- Receives request, creates `httpx.AsyncClient(base_url=prometheus_url)`
- Fires 4 PromQL instant queries per configured service
- Returns `{ timestamp, services: [...], aggregates: { avg_cpu, avg_latency_p99_s } }`

**Why `useRef` for history:** Polling callbacks close over state values. If `setCpuData` was read directly inside the callback, it would always see the initial empty array. `useRef` holds a mutable reference that is always current.

---

## Feature 4: Incident Creation

**User action:** Click "New Incident" in Incidents page → fill form → Submit.

**Frontend** (`pages/Incidents.jsx`):
- `setModal('create')` → renders `CreateIncidentModal`
- Form fields: title, severity, service (dropdown), description, tags
- `incidentsApi.create(payload)` → `POST /api/v1/incidents`
- On success: `addToast('Incident created', 'success')`, refetch list, close modal

**Backend** (`routers/incidents.py`):
- `require_roles("admin", "analyst")` enforced at route level
- Creates `Incident` ORM object with `started_at = payload.started_at or datetime.now(utc)`
- `db.add(incident)` → `db.flush()` → `db.refresh(incident)` → returns full `IncidentRead`

**Database:** `INSERT INTO incidents (...) RETURNING *`; `duration_seconds` is computed by PostgreSQL as `EXTRACT(EPOCH FROM (NOW() - started_at))` while `resolved_at IS NULL`.

---

## Feature 5: RCA Inspection

**User action:** Click an incident row → incident modal opens → RCA section loads.

**Frontend** (`pages/Incidents.jsx`, `RcaSection`):
- `incidentsApi.getRca(incident.id)` → `GET /api/v1/incidents/{id}/rca`
- Renders candidates as cards: root cause service name, confidence badge, evidence JSON

**Backend** (`routers/incidents.py`):
- Raw SQL on `rca_results WHERE incident_id = :id ORDER BY created_at DESC LIMIT 10`
- Returns `{ incident_id, results: [...] }`

**AI Engine side** (how RCA gets into the DB):
- Runs automatically when `AnomalyDetector.score()` returns `is_anomaly=True`
- `RCAEngine.analyze()` returns `RCAResult` with top-3 candidates
- `Repository.save_rca_result()` finds the most recent open incident for that service and links the RCA result

---

## Feature 6: Incident Resolution

**User action:** Click "Resolve" button inside incident modal.

**Frontend:** `incidentsApi.resolve(id)` → `POST /api/v1/incidents/{id}/resolve`  
On success: incident status badge changes to green `resolved`, `duration_seconds` appears.

**Backend:**
- Checks `incident.status not in ("resolved", "closed")` → else `409 Conflict`
- Sets `incident.status = "resolved"`, `incident.resolved_at = datetime.now(utc)`
- `db.flush()` → PostgreSQL recomputes `duration_seconds` immediately
- Returns updated `IncidentRead` with `duration_seconds` populated

---

## Feature 7: Anomaly Detection Pipeline

**Trigger:** Background thread in `ai-engine` fires every 60 seconds.

**Stage 1 — Ingest:**
```
PrometheusIngester queries /api/v1/query for each service:
  - cpu_rate = rate(process_cpu_seconds_total{job}[5m])
  - memory_mb = process_resident_memory_bytes / 1024²
  - latency_p99 = histogram_quantile(0.99, ...)
  - error_rate = sum(5xx rate) / sum(total rate)
```

**Stage 2 — Detect:**
```
For each service:
  1. Append [cpu, mem, lat, err] to deque(maxlen=120)
  2. Z-score check: if any feature > 3σ from buffer mean → spike=True
  3. If buffer < 20: threshold scoring (cpu>0.8 → +0.4, lat>1s → +0.4, err>10% → +0.3)
     Else: IsolationForest.fit(buffer) → decision_function → normalise to [0,1]
  4. is_anomaly = score > threshold OR spike
```

**Stage 3 — RCA (anomalous only):**
```
JaegerIngester fetches traces for anomalous services
RCAEngine.analyze():
  For each anomalous service:
    - Find spans where span.service != anomalous_service (child spans)
    - Rule A: max avg child duration → confidence = min(0.95, 0.3 + avg_us/2_500_000)
    - Rule B: child error count → confidence = min(0.95, 0.5 + error_rate×0.45)
    - Rule C: no children → self (confidence=0.50)
    - Deduplicate, sort by confidence, top 3
```

**Stage 4 — Forecast:**
```
Fetch 60 min of CPU history from Prometheus
PolynomialFeatures(degree=2) + LinearRegression
Normalise timestamps to minutes-from-start
Predict 30 future (1-minute) points
```

**Stage 5 — Persist:**
```
INSERT INTO anomaly_results (one row per service)
INSERT INTO rca_results (linked to open incident if found)
INSERT INTO forecasts
```

---

## Feature 8: RBAC Enforcement

**Three layers where roles are checked:**

1. **FastAPI dependency** — `require_roles("admin", "analyst")` in `dependencies=[...]` raises 403 before the handler runs.
2. **JWT claim** — `get_current_user()` reads `role` from the token payload; no DB lookup needed for role check.
3. **Frontend UI** — Buttons and forms check `useAuth().user.role` before rendering. This is UX-only; the API still enforces independently.

| Operation | Admin | Analyst | Viewer |
|---|---|---|---|
| View anything | ✓ | ✓ | ✓ |
| Create/update services, alerts, incidents | ✓ | ✓ | ✗ |
| Resolve incidents | ✓ | ✓ | ✗ |
| Generate reports | ✓ | ✓ | ✗ |
| Manage users | ✓ | ✗ | ✗ |
| Delete incidents, services | ✓ | ✗ | ✗ |
