# =============================================================================
# AIOps Platform — Makefile
# Usage: make <target>
# =============================================================================

.DEFAULT_GOAL := help
COMPOSE        = docker compose
ENV_FILE       = .env

.PHONY: help setup up down restart logs ps build rebuild reset \
        db-shell backend-shell ai-shell demo-shell \
        seed reload-prometheus open

# ---------------------------------------------------------------------------
# Help
# ---------------------------------------------------------------------------
help:
	@echo ""
	@echo "  AIOps Platform — Available Commands"
	@echo "  ─────────────────────────────────────────────────────"
	@echo "  make setup             Copy .env.example → .env (first run)"
	@echo "  make up                Start all services (detached)"
	@echo "  make down              Stop and remove containers"
	@echo "  make restart           Restart all services"
	@echo "  make logs              Tail logs for all services"
	@echo "  make ps                Show running containers + health"
	@echo "  make build             Build all custom images"
	@echo "  make rebuild           Force rebuild (no cache)"
	@echo "  make reset             ⚠️  Stop + remove ALL volumes (data loss)"
	@echo "  make db-shell          Open psql shell in postgres container"
	@echo "  make backend-shell     Open bash in backend container"
	@echo "  make ai-shell          Open bash in ai-engine container"
	@echo "  make demo-shell        Open bash in demo-app container"
	@echo "  make seed              Re-run seed.sql against running postgres"
	@echo "  make reload-prometheus Hot-reload Prometheus config"
	@echo "  make open              Print service URLs"
	@echo ""

# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------
setup:
	@if [ ! -f $(ENV_FILE) ]; then \
		cp .env.example $(ENV_FILE); \
		echo "✓  .env created from .env.example — edit it before running 'make up'"; \
	else \
		echo "✓  .env already exists — skipping"; \
	fi

# ---------------------------------------------------------------------------
# Lifecycle
# ---------------------------------------------------------------------------
up: check-env
	$(COMPOSE) up -d --remove-orphans
	@echo ""
	@$(MAKE) open

down:
	$(COMPOSE) down

restart:
	$(COMPOSE) restart

logs:
	$(COMPOSE) logs -f --tail=100

ps:
	$(COMPOSE) ps

# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------
build: check-env
	$(COMPOSE) build

rebuild: check-env
	$(COMPOSE) build --no-cache

# ---------------------------------------------------------------------------
# Reset (destructive)
# ---------------------------------------------------------------------------
reset:
	@echo "⚠️  This will DELETE all volumes (database, Prometheus data, Grafana data, Jaeger traces)."
	@read -p "   Type YES to confirm: " confirm && [ "$$confirm" = "YES" ] || exit 1
	$(COMPOSE) down -v --remove-orphans
	@echo "✓  All containers and volumes removed."

# ---------------------------------------------------------------------------
# Shells
# ---------------------------------------------------------------------------
db-shell:
	$(COMPOSE) exec postgres psql -U $${POSTGRES_USER:-aiops_user} -d $${POSTGRES_DB:-aiops}

backend-shell:
	$(COMPOSE) exec backend bash

ai-shell:
	$(COMPOSE) exec ai-engine bash

demo-shell:
	$(COMPOSE) exec demo-app bash

# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------
seed:
	$(COMPOSE) exec -T postgres psql \
		-U $${POSTGRES_USER:-aiops_user} \
		-d $${POSTGRES_DB:-aiops} \
		-f /docker-entrypoint-initdb.d/02-seed.sql
	@echo "✓  Seed data applied."

# ---------------------------------------------------------------------------
# Prometheus hot-reload
# ---------------------------------------------------------------------------
reload-prometheus:
	curl -s -X POST http://localhost:$${PROMETHEUS_PORT:-9090}/-/reload
	@echo "✓  Prometheus config reloaded."

# ---------------------------------------------------------------------------
# URLs
# ---------------------------------------------------------------------------
open:
	@echo ""
	@echo "  ┌─────────────────────────────────────────────────────────────┐"
	@echo "  │  AIOps Services                                             │"
	@echo "  ├─────────────────────────────────────────────────────────────┤"
	@echo "  │  Frontend      →  http://localhost:$${FRONTEND_PORT:-3000}          │"
	@echo "  │  Backend API   →  http://localhost:$${BACKEND_PORT:-8000}/docs       │"
	@echo "  │  Grafana       →  http://localhost:$${GRAFANA_PORT:-3001}            │"
	@echo "  │  Prometheus    →  http://localhost:$${PROMETHEUS_PORT:-9090}         │"
	@echo "  │  Jaeger UI     →  http://localhost:$${JAEGER_UI_PORT:-16686}         │"
	@echo "  │  Demo App      →  http://localhost:$${DEMO_APP_PORT:-8080}           │"
	@echo "  └─────────────────────────────────────────────────────────────┘"
	@echo ""

# ---------------------------------------------------------------------------
# Guard
# ---------------------------------------------------------------------------
check-env:
	@if [ ! -f $(ENV_FILE) ]; then \
		echo "✗  .env not found. Run 'make setup' first."; \
		exit 1; \
	fi
