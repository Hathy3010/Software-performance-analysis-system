---
name: design
description: Impeccable design assistant for the AIOps platform. Use when designing UI components, API endpoints, database schema changes, new services, or observability features for the AIOps – AI-based Software Performance Analysis System.
---

# AIOps Design Skill

## Overview

This skill guides every design decision in the AIOps platform — from pixel-level UI choices to distributed systems architecture. It enforces consistency across the full stack: React 18 + Vite + TailwindCSS → FastAPI → PostgreSQL, with Prometheus / Grafana / Jaeger / OpenTelemetry as the observability layer.

---

## Step 1: Identify Design Domain

Determine which domain the request falls into — then jump to the matching section.

| Domain | Trigger keywords |
|---|---|
| **UI Component** | page, view, dashboard, table, chart, form, modal, button, layout |
| **API Endpoint** | route, endpoint, REST, request, response, schema, DTO |
| **Database** | table, column, index, migration, relation, FK, enum |
| **New Service** | microservice, worker, container, Dockerfile, compose service |
| **Observability** | metric, trace, span, alert, anomaly, OTel, Prometheus, Grafana |

---

## Step 2: UI Component Design

### Visual Language (non-negotiable)

```
Background   bg-gray-900          #111827
Surface      bg-gray-800          #1F2937
Border       border-gray-700      #374151
Text primary text-white
Text muted   text-gray-400
Accent       text-blue-400        #60A5FA
Success      text-green-400
Warning      text-yellow-400
Danger       text-red-400 / text-red-500
```

### Layout Skeleton

Every full page follows this structure:

```jsx
// Sidebar (fixed, w-64) + Main content area
<div className="min-h-screen bg-gray-900 text-white flex">
  <Sidebar />                          {/* bg-gray-800 border-r border-gray-700 */}
  <main className="flex-1 p-6 overflow-auto">
    <PageHeader title="..." subtitle="..." />
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
      {/* Stat cards */}
    </div>
    <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
      {/* Primary content */}
    </div>
  </main>
</div>
```

### Component Patterns

**Stat card** (KPI tiles at top of dashboards):
```jsx
<div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
  <p className="text-gray-400 text-sm">{label}</p>
  <p className="text-2xl font-bold text-white mt-1">{value}</p>
  <p className="text-xs text-green-400 mt-1">{delta}</p>
</div>
```

**Status badge**:
```jsx
const colors = {
  firing:   'bg-red-900 text-red-300 border border-red-700',
  resolved: 'bg-green-900 text-green-300 border border-green-700',
  pending:  'bg-yellow-900 text-yellow-300 border border-yellow-700',
  open:     'bg-orange-900 text-orange-300 border border-orange-700',
  closed:   'bg-gray-700 text-gray-400',
}
<span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[status]}`}>
  {status}
</span>
```

**Data table**:
```jsx
<table className="w-full text-sm">
  <thead>
    <tr className="border-b border-gray-700 text-gray-400">
      <th className="text-left py-3 px-4 font-medium">{col}</th>
    </tr>
  </thead>
  <tbody>
    <tr className="border-b border-gray-700/50 hover:bg-gray-700/30 transition-colors">
      <td className="py-3 px-4 text-white">{cell}</td>
    </tr>
  </tbody>
</table>
```

**Timeline item** (incidents / audit log):
```jsx
<div className="flex gap-3">
  <div className="flex flex-col items-center">
    <div className="w-2 h-2 rounded-full bg-blue-400 mt-1.5" />
    <div className="w-px flex-1 bg-gray-700 mt-1" />
  </div>
  <div className="pb-4">
    <p className="text-sm text-white font-medium">{event}</p>
    <p className="text-xs text-gray-400 mt-0.5">{timestamp}</p>
  </div>
</div>
```

### Page Checklist

- [ ] Dark theme: all surfaces from the palette above — no white or light backgrounds
- [ ] Loading state: skeleton or spinner for async data
- [ ] Empty state: message + CTA when list is empty
- [ ] Error state: red-400 banner, human-readable message
- [ ] Responsive: mobile-first, collapse sidebar on small screens
- [ ] React Router: add route to `App.jsx`, link from sidebar nav

---

## Step 3: API Endpoint Design

### URL Convention

```
GET    /api/v1/{resource}           list (paginated)
POST   /api/v1/{resource}           create
GET    /api/v1/{resource}/{id}      retrieve
PATCH  /api/v1/{resource}/{id}      partial update
DELETE /api/v1/{resource}/{id}      delete

# Nested / actions
GET    /api/v1/services/{id}/alerts
POST   /api/v1/incidents/{id}/resolve
```

### FastAPI Router Template

```python
# backend/app/routers/{resource}.py
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db

router = APIRouter(prefix="/{resource}s", tags=["{Resource}s"])

@router.get("/", response_model={Resource}List)
async def list_{resource}s(
    skip: int = 0,
    limit: int = Query(default=50, le=200),
    db: AsyncSession = Depends(get_db),
):
    ...

@router.get("/{id}", response_model={Resource}Read)
async def get_{resource}(id: UUID, db: AsyncSession = Depends(get_db)):
    obj = await db.get({Model}, id)
    if not obj:
        raise HTTPException(status_code=404, detail="{Resource} not found")
    return obj
```

### Pydantic Schema Pattern

```python
class {Resource}Base(BaseModel):
    model_config = ConfigDict(from_attributes=True)

class {Resource}Create({Resource}Base):
    pass  # write-only fields

class {Resource}Read({Resource}Base):
    id: UUID
    created_at: datetime
    updated_at: datetime
```

### Response Envelope (list endpoints)

```json
{ "items": [...], "total": 120, "skip": 0, "limit": 50 }
```

### API Checklist

- [ ] Router registered in `backend/app/main.py` under `/api/v1/`
- [ ] 404 raised for missing resources, not 500
- [ ] Pagination on every list endpoint
- [ ] No secrets in response schemas
- [ ] OTel span attributes added for business-critical paths

---

## Step 4: Database Schema Design

### Table Template

```sql
CREATE TABLE {table_name} (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_id  UUID REFERENCES services(id) ON DELETE CASCADE,
    name        VARCHAR(255) NOT NULL,
    status      {enum_type}  NOT NULL DEFAULT '{default}',
    metadata    JSONB        NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_{table_name}_updated_at
    BEFORE UPDATE ON {table_name}
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE INDEX idx_{table_name}_{col}      ON {table_name}({col});
CREATE INDEX idx_{table_name}_metadata   ON {table_name} USING GIN (metadata);
```

### Design Rules

1. **UUID PKs** — `DEFAULT gen_random_uuid()`, never serial
2. **Explicit FKs** — always include `ON DELETE` policy
3. **JSONB + GIN** — for dynamic/label columns
4. **Enums** — `CREATE TYPE … AS ENUM` for status fields
5. **Partial indexes** — `WHERE status = 'firing'`, `WHERE deleted_at IS NULL`
6. **Audit tables append-only** — no `updated_at`, no soft-delete on `audit_logs`
7. **Alembic migrations** — never edit schema.sql directly in production

### Schema Checklist

- [ ] UUID PK with `gen_random_uuid()`
- [ ] `updated_at` trigger attached
- [ ] FK with explicit ON DELETE policy
- [ ] GIN index if JSONB column present
- [ ] Enum type created before table
- [ ] Alembic migration written

---

## Step 5: New Service Design

### Dockerfile Template

```dockerfile
FROM python:3.12-slim AS builder
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

FROM python:3.12-slim AS production
COPY --from=builder /install /usr/local
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY . .
EXPOSE {PORT}
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -f http://localhost:{PORT}/health || exit 1
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "{PORT}"]
```

### Compose Service Block

```yaml
{service-name}:
  build:
    context: ./{service-name}
    dockerfile: Dockerfile
    target: production
  container_name: aiops-{service-name}
  restart: unless-stopped
  environment:
    OTEL_EXPORTER_OTLP_ENDPOINT: http://otel-collector:4317
    OTEL_SERVICE_NAME:           {service-name}
    OTEL_RESOURCE_ATTRIBUTES:    service.namespace=prod,service.version=1.0.0
  networks:
    - monitoring-net
  depends_on:
    otel-collector:
      condition: service_started
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:{PORT}/health"]
    interval: 15s
    timeout: 5s
    retries: 3
    start_period: 20s
  logging: *default-logging
```

### Service Checklist

- [ ] `GET /health` returns `{"status": "ok", "service": "{name}"}`
- [ ] OTel initialized in lifespan / startup
- [ ] Prometheus metrics exposed at `/metrics`
- [ ] Added to `infra/prometheus/prometheus.yml` scrape_configs
- [ ] Network assignments match data-flow

---

## Step 6: Observability Design

### OTel Instrumentation (every new service)

```python
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
import os

def init_telemetry() -> None:
    exporter = OTLPSpanExporter(
        endpoint=os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://otel-collector:4317"),
        insecure=True,
    )
    provider = TracerProvider()
    provider.add_span_processor(BatchSpanProcessor(exporter))
    trace.set_tracer_provider(provider)
    FastAPIInstrumentor().instrument()
```

### Custom Span Attributes

```python
tracer = trace.get_tracer(__name__)

with tracer.start_as_current_span("anomaly.detection.cycle") as span:
    span.set_attribute("service.id", str(service_id))
    span.set_attribute("anomaly.score", score)
    span.set_attribute("threshold", threshold)
    span.set_attribute("detected", score > threshold)
```

### Prometheus Metric Naming

```
aiops_{service}_{noun}_total               # counters
aiops_{service}_{noun}_errors_total        # error counters
aiops_{service}_{noun}_active              # gauges
aiops_{service}_{noun}_duration_seconds    # histograms
```

### Grafana Panel Types

| Data | Panel | Query pattern |
|---|---|---|
| Rates | timeseries | `rate($metric[5m])` |
| Current state | stat | threshold coloring |
| Comparison | table | transform: merge |
| Latency | histogram | heatmap renderer |

### Observability Checklist

- [ ] OTel `init_telemetry()` called in FastAPI `lifespan`
- [ ] SQLAlchemy instrumented if service touches DB
- [ ] Custom spans on anomaly detection, RCA, report generation
- [ ] Prometheus scrape target added
- [ ] Grafana panel added or updated
- [ ] Alert rule defined for new failure modes

---

## Quick-Reference: Project Invariants

| Rule | Detail |
|---|---|
| Theme | `bg-gray-900` base, `bg-gray-800` surface, `blue-400` accent |
| API prefix | Always `/api/v1/` |
| UUIDs | All PKs — never integer IDs in public API |
| Async | SQLAlchemy must use `async`/`await` with `asyncpg` driver |
| OTel | Every service sends to `otel-collector:4317`, never directly to Jaeger |
| Networks | `db-net` internal — never expose postgres port to host |
| Healthcheck | HTTP `/health` JSON on every service; scratch images use `service_started` |
| Secrets | All via `.env` — never hardcoded |
