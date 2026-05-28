# 17 — Troubleshooting

## Diagnostic Commands

Run these first when something isn't working:

```bash
make ps                                    # container status + health
docker compose logs -f <service>           # live logs for one service
docker compose logs --tail=50 ai-engine    # last 50 lines
make db-shell                              # open psql
curl http://localhost:8000/health          # backend liveness
curl http://localhost:8000/api/v1/ping     # backend readiness
```

---

## Container Won't Start

### `otel-collector` shows no health state
Expected. The `otel/opentelemetry-collector-contrib` image is built FROM scratch — no shell, no curl, no wget. A healthcheck command would fail with "executable not found." This is correct behavior; the collector relies on `restart: unless-stopped` and dependent services use `condition: service_started`. See [ADR-004](18-decision-log.md).

### `backend` exits immediately
```bash
docker compose logs backend
```
Common causes:
1. `DATABASE_URL` password mismatch — ensure `POSTGRES_PASSWORD` in `.env` matches what postgres was initialised with. If changed after volume creation, run `make reset`.
2. `SECRET_KEY` not set — the Compose file uses `:?err` which fails fast. Set it in `.env`.
3. `postgres` not yet healthy — wait 30s and `docker compose restart backend`.

### `ai-engine` exits after a few seconds
```bash
docker compose logs ai-engine
```
Usually: `OperationalError: connection refused` — postgres or prometheus not ready. The `@retry(stop_after_attempt(10))` in `init_db()` gives 10 attempts. If it still fails, check that `prometheus` is healthy before ai-engine starts (see `depends_on`).

### `frontend` not loading
```bash
docker compose logs frontend
```
Frontend depends on `backend` being healthy. If backend is not healthy, frontend won't start.

---

## API Returns Unexpected Status Codes

### `401 Unauthorized` on every request
1. Token not attached — check browser DevTools → Network → request headers.
2. Token expired — re-login or call `POST /auth/refresh`.
3. Wrong token type — refresh token used as access token. Re-login.
4. `SECRET_KEY` changed after token was issued — clear localStorage and re-login.

```bash
# Verify backend is using the correct secret
docker compose exec backend env | grep SECRET_KEY
```

### `403 Forbidden`
The authenticated user's role doesn't have permission. Check the endpoint's `require_roles()` call in the router, and verify the user's role in the database:
```sql
SELECT email, role FROM users WHERE email = 'your@email.com';
```

### `422 Unprocessable Entity`
Pydantic validation failed. The response body contains `detail` with a list of validation errors showing exactly which field failed and why.

### `409 Conflict` on resolve incident
The incident is already `resolved` or `closed`. Check its current status:
```bash
curl http://localhost:8000/api/v1/incidents/<id> -H "Authorization: Bearer <token>"
```

---

## Database Issues

### `alembic.exc.CommandError: Target database is not up to date`
The `alembic_version` table in the DB has a revision that doesn't match local migration files.

```bash
make backend-shell
alembic current      # shows what revision DB thinks it's on
alembic heads        # shows what the code expects

# If DB was created by schema.sql (first run), stamp it as baseline
alembic stamp 0001

# Then upgrade
alembic upgrade head
```

### `UniqueViolation` when running seed
The seed data is already present. Re-seed only works on empty tables:
```bash
make reset    # wipes volumes
make up       # re-seeds automatically
```

### Can't connect to postgres
```bash
make db-shell   # tests connection
# If this fails:
docker compose ps postgres   # check it's running
docker compose logs postgres # check for startup errors
```

### Query is slow
```bash
make db-shell
EXPLAIN ANALYZE SELECT ...;   # check query plan
# Look for "Seq Scan" on large tables — may need a new index
```

---

## AI Engine Issues

### `WARNING: Service 'backend' not found in DB`
The `services` table has no row with `name = 'backend'` (or matching `prometheus_job`). Add it:
```bash
curl -X POST http://localhost:8000/api/v1/services \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{"name": "backend", "display_name": "Backend API", "status": "healthy", "prometheus_job": "backend"}'
```

Or update `MONITORED_SERVICES` in `.env` to match existing service names.

### `method=threshold_fallback` after a long time
The rolling buffer hasn't reached 20 samples. This means Prometheus queries are returning null/empty results for that service.

```bash
# Check if Prometheus has data for the service
curl "http://localhost:9090/api/v1/query?query=up{job=\"backend\"}"
# Should return {"value": [timestamp, "1"]}
```

If `up` is 0 or absent, Prometheus can't reach the service. Check `infra/prometheus/prometheus.yml` targets.

### Pipeline crashes every cycle
```bash
docker compose logs ai-engine | grep ERROR
```
Most common: Jaeger returns unexpected JSON structure when there are no traces. The ingester handles this gracefully — if you still see crashes, add debug logging to `jaeger.py`.

---

## Frontend Issues

### Charts show no data / loading forever
1. Check browser console for network errors.
2. `GET /api/v1/metrics/current` may return all-zero values if Prometheus has no data yet — wait 2 minutes after startup.
3. `VITE_API_BASE_URL` not set at build time. Rebuild: `docker compose build --no-cache frontend`.

### App keeps refreshing / infinite reload on login page
**Symptom:** Trang `/login` tự reload liên tục, không đăng nhập được.

**Root cause:** `useAlertNotifications` hook được mount ngay cả khi chưa đăng nhập (React không cho phép gọi hook có điều kiện). Hook gọi `GET /api/v1/alerts` mỗi 10 giây → nhận `401 Unauthorized` → axios interceptor thực thi `window.location.href = '/login'` → trang reload → hook chạy lại → vòng lặp vô tận.

**Fix đã áp dụng** (`frontend/src/App.jsx`): Tách thành 2 component — `AlertBanner` (gọi hook) và `AlertListener` (kiểm tra token trước). Khi chưa login, `AlertBanner` không được mount nên hook không chạy.

```jsx
// SAI — hook luôn chạy dù chưa login
function AlertListener() {
  const { token } = useAuth()
  const { alarmActive } = useAlertNotifications()   // gọi API ngay!
  if (!token) return null
}

// ĐÚNG — hook chỉ chạy sau khi đã login
function AlertBanner() {
  const { alarmActive } = useAlertNotifications()   // an toàn
  if (!alarmActive) return null
  return <div>...</div>
}
function AlertListener() {
  const { token } = useAuth()
  if (!token) return null                           // chặn trước khi mount
  return <AlertBanner />
}
```

### Login redirects immediately back to login
Token is set in localStorage but `useAuth()` isn't picking it up. Open DevTools → Application → Local Storage → verify `access_token` is present and is a valid JWT (three dot-separated base64 segments).

### "Network Error" in console
CORS is blocking the request. Check:
```bash
docker compose exec backend env | grep CORS_ORIGINS
# Must include the origin you're calling from (e.g., http://localhost:3000)
```

### Page is blank (white screen)
JavaScript error during render. Check browser console for the error. Common causes:
- Missing `@/` import alias (only works inside Docker/Vite — not if files are opened directly)
- API response shape changed and component is accessing an undefined field

---

## Prometheus / Grafana Issues

### Prometheus targets show DOWN
```bash
open http://localhost:9090/targets
# Check the error message next to the DOWN target
```
Common causes:
- Service not yet started
- `metrics_path` mismatch in `prometheus.yml`
- Service container not on `monitoring-net`

Reload Prometheus config after changes:
```bash
make reload-prometheus
```

### Grafana dashboard shows "No data"
1. Prometheus datasource not connected — verify at `http://localhost:3001/connections/datasources`
2. Time range too narrow — widen to "Last 1 hour"
3. Service labels in dashboard query don't match Prometheus `job=` labels

---

## Port Conflicts

If a port is already in use on your machine:

```bash
# Find what's using port 5432
netstat -anp | grep 5432       # Linux
Get-NetTCPConnection -LocalPort 5432  # Windows PowerShell

# Change the conflicting port in .env
POSTGRES_PORT=5433         # add this mapping to docker-compose.yml if needed
BACKEND_PORT=8001
FRONTEND_PORT=3001
```

---

## PowerShell — HTTP Requests

### `POST` / `GET` không phải lệnh PowerShell

**Symptom:**
```
POST : The term 'POST' is not recognized as the name of a cmdlet, function, script file, or operable program.
```

**Nguyên nhân:** `POST`, `GET`, `PUT`, `DELETE` không phải lệnh PowerShell. Đây là HTTP verbs — chỉ dùng được trong curl (Linux/macOS) hoặc browser.

**Fix — dùng `Invoke-RestMethod` trong PowerShell:**

```powershell
# GET
Invoke-RestMethod -Method GET -Uri "http://localhost:8080/demo/status"

# POST không có body
Invoke-RestMethod -Method POST -Uri "http://localhost:8080/demo/wow_rca/start"

# POST có JSON body
Invoke-RestMethod -Method POST -Uri "http://localhost:8000/api/v1/auth/login" `
  -ContentType "application/json" `
  -Body '{"username":"admin","password":"Admin@123"}'

# POST với Authorization header
Invoke-RestMethod -Method POST -Uri "http://localhost:8000/api/v1/incidents/abc/resolve" `
  -Headers @{ Authorization = "Bearer $token" }

# PATCH
Invoke-RestMethod -Method PATCH -Uri "http://localhost:8000/api/v1/global-settings" `
  -ContentType "application/json" `
  -Headers @{ Authorization = "Bearer $token" } `
  -Body '{"anomaly_score_threshold": 0.65}'
```

### Demo scenario commands (PowerShell)

```powershell
# Xem danh sách scenarios
Invoke-RestMethod -Method GET -Uri "http://localhost:8080/demo/list"

# Xem scenario đang chạy
Invoke-RestMethod -Method GET -Uri "http://localhost:8080/demo/status"

# Bắt đầu scenario
Invoke-RestMethod -Method POST -Uri "http://localhost:8080/demo/wow_rca/start"
Invoke-RestMethod -Method POST -Uri "http://localhost:8080/demo/cascading_failure/start"
Invoke-RestMethod -Method POST -Uri "http://localhost:8080/demo/intermittent_failure/start"

# Dừng scenario hiện tại
Invoke-RestMethod -Method POST -Uri "http://localhost:8080/demo/stop"
```

### Alias ngắn gọn hơn (thêm vào PowerShell profile)

```powershell
function irm-post($uri) { Invoke-RestMethod -Method POST -Uri $uri }
function irm-get($uri)  { Invoke-RestMethod -Method GET  -Uri $uri }

# Dùng:
irm-post "http://localhost:8080/demo/wow_rca/start"
irm-get  "http://localhost:8080/demo/status"
```
