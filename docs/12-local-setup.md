# 12 — Local Setup

## Prerequisites

| Tool | Minimum version | Check command |
|---|---|---|
| Docker Desktop (or Engine) | 24.x | `docker --version` |
| Docker Compose (plugin) | 2.x | `docker compose version` |
| GNU Make | 4.x | `make --version` |
| Git | 2.x | `git --version` |

> Docker Compose **plugin** (`docker compose`) is required, not the standalone `docker-compose` binary.  
> On Windows, Docker Desktop ships both — ensure you use the plugin form.

**Optional (for local development without Docker):**

| Tool | Minimum version |
|---|---|
| Python | 3.12 |
| Node.js | 20 LTS |
| npm | 10.x |
| PostgreSQL client (`psql`) | 16.x |

---

## Step 1: Get the Code

```bash
git clone <repository-url>
cd ISPAS
```

---

## Step 2: Configure Environment

```bash
make setup
```

This copies `.env.example` to `.env`. Open `.env` and fill in the three required values:

```dotenv
# Generate with: python -c "import secrets; print(secrets.token_hex(32))"
SECRET_KEY=<paste 64-char hex here>

# Any strong password — avoid @ and / characters
POSTGRES_PASSWORD=aiops_dev_password_2026

# Any password for Grafana admin
GRAFANA_ADMIN_PASSWORD=grafana_dev_2026
```

**All other values can stay at their defaults for local development.**

---

## Step 3: Build Images

```bash
make build
```

This builds four custom Docker images:
- `aiops-backend` (Python 3.12, multi-stage)
- `aiops-ai-engine` (Python 3.12 with scikit-learn)
- `aiops-demo-app` (Python 3.12, lightweight)
- `aiops-frontend` (Node build → Nginx Alpine)

First build takes 3–5 minutes. Subsequent builds are fast due to layer caching.

---

## Step 4: Start the Stack

```bash
make up
```

This runs `docker compose up -d --remove-orphans`. The startup sequence takes ~60 seconds for all 9 containers to reach healthy state.

Watch status:
```bash
make ps
# Run every few seconds until all show (healthy)
```

Expected final state:
```
NAME                    STATUS
aiops-postgres          Up (healthy)
aiops-jaeger            Up (healthy)
aiops-otel-collector    Up             ← no healthcheck (scratch image)
aiops-prometheus        Up (healthy)
aiops-backend           Up (healthy)
aiops-ai-engine         Up (healthy)
aiops-demo-app          Up (healthy)
aiops-grafana           Up (healthy)
aiops-frontend          Up (healthy)
```

---

## Step 5: Verify

```bash
# Dashboard
open http://localhost:3000
# Login: admin@aiops.local / Admin@123

# API documentation
open http://localhost:8000/docs

# AI engine logs (should show pipeline runs)
docker compose logs -f ai-engine

# Database
make db-shell
\dt        # should show: users, services, incidents, alerts, anomaly_results, rca_results, reports, audit_logs
SELECT COUNT(*) FROM users;  # should be 3
\q
```

---

## Option B: Local Development (no Docker for app services)

Useful when editing backend or frontend code and wanting hot-reload.

**Requires:** PostgreSQL, Prometheus, Jaeger, and OTel Collector running (run infra via Docker, code via local Python/Node).

```bash
# Start only infrastructure services
docker compose up -d postgres prometheus jaeger otel-collector grafana

# Wait for postgres to be healthy
docker compose ps postgres
```

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate     # Linux/Mac
.venv\Scripts\activate        # Windows PowerShell

pip install -r requirements.txt

# Set environment variables (or create backend/.env)
export DATABASE_URL="postgresql+asyncpg://aiops_user:aiops_dev_password_2026@localhost:5432/aiops"
export SECRET_KEY="your-secret-key"
export PROMETHEUS_URL="http://localhost:9090"
export OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:4317"
export OTEL_SERVICE_NAME="backend"

uvicorn app.main:app --reload --port 8000
```

### AI Engine

```bash
cd ai-engine
python -m venv .venv
source .venv/bin/activate

pip install -r requirements.txt

export DATABASE_URL="postgresql+psycopg2://aiops_user:aiops_dev_password_2026@localhost:5432/aiops"
export PROMETHEUS_URL="http://localhost:9090"
export JAEGER_URL="http://localhost:16686"
export OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:4317"
export OTEL_SERVICE_NAME="ai-engine"

uvicorn app.main:app --reload --port 8001
```

### Frontend

```bash
cd frontend
npm install

# Create frontend/.env.local
echo "VITE_API_BASE_URL=http://localhost:8000" > .env.local

npm run dev
# Vite dev server → http://localhost:5173
```

---

## Database Operations

### Open psql shell
```bash
make db-shell
# or: docker compose exec postgres psql -U aiops_user -d aiops
```

### Re-run seed data (empty tables first)
```bash
make seed
```

### Run an Alembic migration
```bash
make backend-shell
alembic revision --autogenerate -m "describe_your_change"
alembic upgrade head
```

### Full reset (wipes all data)
```bash
make reset    # type YES to confirm
make up       # fresh start with seed data
```

---

## Rebuild After Code Changes

```bash
# Rebuild a single service
docker compose build backend
docker compose up -d backend

# Rebuild all (force no cache)
make rebuild
make up
```

---

## Troubleshooting Setup

| Symptom | Fix |
|---|---|
| Port 3000 already in use | Change `FRONTEND_PORT=3001` in `.env` |
| Port 8000 already in use | Change `BACKEND_PORT=8001` in `.env` |
| `make: command not found` (Windows) | Install GNU Make via Chocolatey: `choco install make` |
| `docker compose` not found | Update Docker Desktop; ensure Compose plugin is enabled |
| `.env not found` error | Run `make setup` first |
| `POSTGRES_PASSWORD` validation error | Set a value in `.env` — the compose file uses `:?err` to require it |

See [17-troubleshooting](17-troubleshooting.md) for more.
