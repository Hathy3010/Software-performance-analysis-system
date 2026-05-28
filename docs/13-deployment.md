# 13 — Deployment

## Deployment Model

The system is deployed as a **Docker Compose stack** on a single host. All 9 services share a Docker network. There is no Kubernetes, no load balancer, and no external cloud dependencies.

This is appropriate for:
- Local development
- Thesis/demo environments
- Single-server staging

---

## Container Summary

| Container | Image | Build | Restarts |
|---|---|---|---|
| `aiops-postgres` | `postgres:16-alpine` | Pull | unless-stopped |
| `aiops-jaeger` | `jaegertracing/all-in-one:1.57` | Pull | unless-stopped |
| `aiops-otel-collector` | `otel/opentelemetry-collector-contrib:0.102.0` | Pull | unless-stopped |
| `aiops-prometheus` | `prom/prometheus:v2.52.0` | Pull | unless-stopped |
| `aiops-grafana` | `grafana/grafana:10.4.3` | Pull | unless-stopped |
| `aiops-backend` | Custom (Python 3.12) | `backend/Dockerfile` | unless-stopped |
| `aiops-ai-engine` | Custom (Python 3.12) | `ai-engine/Dockerfile` | unless-stopped |
| `aiops-demo-app` | Custom (Python 3.12) | `demo-app/Dockerfile` | unless-stopped |
| `aiops-frontend` | Custom (Node → Nginx) | `frontend/Dockerfile` | unless-stopped |

---

## Startup Dependency Order

Docker Compose resolves this automatically via `depends_on`:

```
jaeger              (no deps)  → starts immediately
otel-collector      depends on jaeger (healthy)
postgres            (no deps)  → starts immediately
prometheus          (no deps)  → starts immediately
backend             depends on postgres (healthy) + otel-collector (started)
ai-engine           depends on postgres (healthy) + prometheus (healthy) + otel-collector (started)
demo-app            depends on otel-collector (started)
grafana             depends on prometheus (healthy)
frontend            depends on backend (healthy)
```

**Note on otel-collector:** Uses `service_started` (not `service_healthy`) because the otelcol-contrib image is built FROM scratch — no shell utilities available for a healthcheck command. See [18-decision-log](18-decision-log.md) ADR-004.

---

## Volume Persistence

| Volume | Stores | Backup priority |
|---|---|---|
| `postgres-data` | All application data | High |
| `prometheus-data` | Metric time-series (15d retention) | Medium |
| `grafana-data` | Dashboard configs, user settings | Low |

Data survives `make down` and `docker compose restart`. Only `make reset` (which runs `docker compose down -v`) destroys volumes.

---

## Network Isolation

```
db-net (internal bridge):
  postgres ↔ backend ↔ ai-engine
  No internet route — database is not accessible from outside

monitoring-net (internal bridge):
  otel-collector ↔ prometheus ↔ grafana ↔ jaeger
  backend ↔ ai-engine ↔ demo-app (for telemetry)

frontend-net (bridge, internet-accessible):
  frontend ↔ backend
  This is the only network with external exposure
```

---

## Port Exposure (Host Binding)

Only these ports are bound to the host machine:

| Host Port | Container | Notes |
|---|---|---|
| 3000 | frontend (Nginx) | Main user interface |
| 8000 | backend | API + Swagger docs |
| 8001 | ai-engine | Health endpoint only |
| 8080 | demo-app | Synthetic traffic source |
| 9090 | prometheus | Raw metric queries |
| 3001 | grafana | Operational dashboards |
| 16686 | jaeger | Trace viewer |
| 4317 | otel-collector | OTLP gRPC (for external services) |
| 4318 | otel-collector | OTLP HTTP (alternative) |

Jaeger's 4317/4318 ports are intentionally **not** host-bound — all OTLP traffic routes through the OTel Collector.

---

## Deploying Code Changes

```bash
# 1. Stop affected service
docker compose stop backend

# 2. Rebuild image
docker compose build backend

# 3. Restart with new image
docker compose up -d backend

# 4. Verify health
docker compose ps backend
docker compose logs -f backend
```

For frontend changes (Vite bakes env vars at build time):
```bash
docker compose build frontend
docker compose up -d frontend
```

---

## Database Migration in Deployment

After a schema change:
```bash
# Run migration against the running postgres container
docker compose exec backend alembic upgrade head

# Verify
docker compose exec backend alembic current
```

Never apply raw DDL directly to the database. All schema changes must go through Alembic.

---

## Health Monitoring

All custom services expose a `/health` endpoint returning `{"status": "ok"}`. Docker healthchecks poll these automatically.

Infrastructure services use their built-in health probes:
- `postgres`: `pg_isready`
- `prometheus`: `wget /-/healthy`
- `grafana`: `wget /api/health`
- `jaeger`: `wget :14269/`

Check all at once:
```bash
make ps
```

---

## Logging

All containers use the `json-file` logging driver:
```yaml
logging:
  driver: "json-file"
  options:
    max-size: "10m"
    max-file: "3"
```

Max log footprint per service: 30MB (10MB × 3 rotated files).

View logs:
```bash
make logs                          # all services
docker compose logs -f backend     # single service, follow
docker compose logs --tail=100 ai-engine  # last 100 lines
```

---

## Production Hardening Checklist

If deploying to a real server (beyond the thesis scope):

```
□ Set ENVIRONMENT=production in .env
□ Use a secrets manager (Vault, AWS Secrets Manager) — not .env file
□ Put Nginx/Traefik in front with HTTPS (TLS termination)
□ Restrict host port binding — only expose 443
□ Replace Jaeger in-memory storage with persistent backend (Elasticsearch/Cassandra)
□ Configure Alertmanager for alert routing (PagerDuty, Slack)
□ Set up automated PostgreSQL backups (pg_dump + S3)
□ Rotate JWT secret key and restart backend
□ Enable Grafana auth (OAuth or LDAP) — disable anonymous access
□ Set GF_SECURITY_ALLOW_EMBEDDING=false if not embedding dashboards
□ Review CORS_ORIGINS — set to exact production domain
```
