# 08 — API Documentation

## Base URL

```
http://localhost:8000/api/v1
```

Interactive docs (Swagger UI): **http://localhost:8000/docs**  
ReDoc: **http://localhost:8000/redoc**

---

## Authentication

All endpoints except `/auth/login`, `/health`, and `/api/v1/ping` require:

```
Authorization: Bearer <access_token>
```

Tokens are obtained from `POST /auth/login`. Access tokens expire in 30 minutes. Use `POST /auth/refresh` to get a new one.

---

## Common Response Shapes

### Paginated List — `Page[T]`
```json
{
  "items": [...],
  "total": 42,
  "skip": 0,
  "limit": 20
}
```

### Error
```json
{
  "detail": "Incident not found"
}
```

### Pagination Query Params
`?skip=0&limit=20` — all list endpoints support these.

---

## Auth Endpoints

### `POST /auth/login`
Authenticate and receive JWT tokens.

**Request:**
```json
{
  "username": "admin@aiops.local",
  "password": "Admin@123"
}
```
*Note: FastAPI OAuth2PasswordRequestForm expects `username` and `password` as form fields or JSON.*

**Response 200:**
```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "token_type": "bearer"
}
```

**Errors:** `401` — invalid credentials or inactive account.

---

### `POST /auth/refresh`
Exchange a refresh token for a new access token.

**Request:**
```json
{
  "refresh_token": "eyJ..."
}
```

**Response 200:** Same shape as `/auth/login`.

**Errors:** `401` — expired or invalid refresh token, or wrong token type.

---

## User Endpoints (`/users`)

All write operations require `admin` role.

### `GET /users` → `Page[UserRead]`
Query params: `skip`, `limit`, `role` (filter), `is_active` (filter)

### `POST /users` → `UserRead` (201)
```json
{
  "email": "new@aiops.local",
  "username": "new_user",
  "password": "SecurePass@123",
  "role": "analyst",
  "full_name": "New User"
}
```

### `GET /users/{id}` → `UserRead`
### `PATCH /users/{id}` → `UserRead`
Fields: `email`, `username`, `full_name`, `role`, `is_active`, `password` (all optional)

### `DELETE /users/{id}` → 204

---

## Service Endpoints (`/services`)

Write requires `admin` or `analyst`. Read is open to all authenticated users.

### `GET /services` → `Page[ServiceRead]`
Query params: `skip`, `limit`, `status`, `namespace`, `team`

### `POST /services` → `ServiceRead` (201)
```json
{
  "name": "order-service",
  "display_name": "Order Service",
  "status": "healthy",
  "namespace": "prod",
  "team": "commerce",
  "prometheus_job": "order-service",
  "endpoint_url": "http://order-service:8002",
  "description": "Manages order lifecycle"
}
```

### `GET /services/{id}` → `ServiceRead`
### `PATCH /services/{id}` → `ServiceRead`
### `DELETE /services/{id}` → 204 (admin only, cascades to alerts)

---

## Alert Endpoints (`/alerts`)

Write requires `admin` or `analyst`.

### `GET /alerts` → `Page[AlertRead]`
Query params: `skip`, `limit`, `severity`, `status`, `service_id`

### `POST /alerts` → `AlertRead` (201)
```json
{
  "service_id": "bbbbbbbb-...",
  "alert_name": "HighP99Latency",
  "severity": "high",
  "status": "firing",
  "message": "P99 latency is 2347ms",
  "metric_name": "http_request_duration_seconds",
  "metric_value": 2.347,
  "threshold_value": 2.0,
  "labels": {"env": "prod"},
  "annotations": {"runbook": "https://..."}
}
```

Note: A `CRITICAL` severity + `firing` status alert triggers a background log task automatically.

### `GET /alerts/{id}` → `AlertRead`
### `PATCH /alerts/{id}` → `AlertRead`
### `DELETE /alerts/{id}` → 204

---

## Incident Endpoints (`/incidents`)

Write requires `admin` or `analyst`. Delete requires `admin`.

### `GET /incidents` → `Page[IncidentRead]`
Query params: `skip`, `limit`, `status`, `severity`, `service_id`

### `POST /incidents` → `IncidentRead` (201)
```json
{
  "title": "High error rate on payment-service",
  "description": "5xx rate above 5% for 10 minutes",
  "severity": "critical",
  "status": "open",
  "service_id": "bbbbbbbb-...",
  "started_at": "2026-04-30T14:00:00Z",
  "tags": ["payment", "prod"]
}
```

### `GET /incidents/{id}` → `IncidentRead`

### `PATCH /incidents/{id}` → `IncidentRead`

### `POST /incidents/{id}/resolve` → `IncidentRead`
Sets `status = "resolved"` and `resolved_at = NOW()`. PostgreSQL auto-computes `duration_seconds`.

**Errors:** `409` — incident is already resolved or closed.

### `GET /incidents/{id}/rca` → RCA results
```json
{
  "incident_id": "cccccccc-...",
  "results": [
    {
      "id": "...",
      "root_cause_description": "payment-service slow due to missing index",
      "confidence_score": 0.87,
      "evidence": {...},
      "created_at": "2026-04-30T14:05:00Z"
    }
  ]
}
```
Returns up to 10 most recent RCA results for this incident, ordered by `created_at DESC`.

### `DELETE /incidents/{id}` → 204 (admin only)

---

## Dashboard Endpoint

### `GET /dashboard/summary` → `DashboardSummary`
```json
{
  "total_services": 5,
  "service_status": {
    "healthy": 3,
    "degraded": 1,
    "down": 1,
    "unknown": 0
  },
  "open_incidents": 2,
  "critical_incidents": 1,
  "firing_alerts": 3,
  "alert_severity": {
    "critical": 1,
    "high": 1,
    "medium": 1,
    "low": 0
  },
  "recent_anomalies_24h": 4,
  "mttr_seconds": 2700.0
}
```

---

## Metrics Endpoint

### `GET /metrics/current` → per-service Prometheus data
Proxies Prometheus queries for each configured service.

```json
{
  "timestamp": 1746000000.0,
  "services": [
    {
      "service": "backend",
      "cpu_rate": 0.023,
      "memory_mb": 128.4,
      "latency_p99_s": 0.087,
      "error_rate": 0.001
    },
    {
      "service": "demo-app",
      "cpu_rate": 0.041,
      "memory_mb": 94.2,
      "latency_p99_s": 0.312,
      "error_rate": 0.048
    }
  ],
  "aggregates": {
    "avg_cpu": 0.032,
    "avg_latency_p99_s": 0.199
  }
}
```

---

## Report Endpoints (`/reports`)

Write requires `admin` or `analyst`.

### `GET /reports` → `Page[ReportRead]`
### `POST /reports` → `ReportRead` (201)
```json
{
  "title": "Weekly Performance Report",
  "report_type": "weekly",
  "incident_id": null,
  "parameters": {"period": "2026-W18"}
}
```
### `GET /reports/{id}` → `ReportRead`
### `DELETE /reports/{id}` → 204

---

## System Endpoints

### `GET /health` → `{"status": "ok", "service": "backend"}`
Used by Docker healthcheck. No auth required.

### `GET /api/v1/ping` → `{"message": "pong"}`
Readiness check. No auth required.

### `GET /metrics`
Prometheus scrape endpoint (prometheus-fastapi-instrumentator). Returns raw text/plain metrics.

---

## HTTP Status Code Reference

| Code | Meaning |
|---|---|
| 200 | OK |
| 201 | Created (POST operations) |
| 204 | No Content (DELETE operations) |
| 400 | Bad Request (validation error) |
| 401 | Unauthorized (missing/expired token) |
| 403 | Forbidden (insufficient role) |
| 404 | Not Found |
| 409 | Conflict (e.g. resolving an already-resolved incident) |
| 422 | Unprocessable Entity (Pydantic validation failure) |
| 500 | Internal Server Error |
