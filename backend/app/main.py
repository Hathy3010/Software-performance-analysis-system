import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from prometheus_fastapi_instrumentator import Instrumentator

from app.config import get_settings
from app.core.telemetry import init_telemetry

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_telemetry()
    logger.info("AIOps backend starting up")
    yield
    logger.info("AIOps backend shut down")


settings = get_settings()

app = FastAPI(
    title="AIOps API",
    description="AI-based Software Performance Analysis System — REST API",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
    redirect_slashes=False,
)

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Prometheus metrics ────────────────────────────────────────────────────────
Instrumentator(
    should_group_status_codes=True,
    should_ignore_untemplated=True,
    should_instrument_requests_inprogress=True,
).instrument(app).expose(app, include_in_schema=False)

# ── Routers ───────────────────────────────────────────────────────────────────
from app.routers import auth, alerts, analytics, dashboard, incidents, logs, metrics, notifications, reports, services, users  # noqa: E402
from app.routers.traces import router as traces_router, dep_map_router  # noqa: E402
from app.routers import global_settings  # noqa: E402
from app.routers.ws import router as ws_router  # noqa: E402

PREFIX = "/api/v1"

app.include_router(auth.router,            prefix=PREFIX)
app.include_router(users.router,           prefix=PREFIX)
app.include_router(dep_map_router,         prefix=PREFIX)
app.include_router(services.router,        prefix=PREFIX)
app.include_router(alerts.router,          prefix=PREFIX)
app.include_router(incidents.router,       prefix=PREFIX)
app.include_router(reports.router,         prefix=PREFIX)
app.include_router(dashboard.router,       prefix=PREFIX)
app.include_router(metrics.router,         prefix=PREFIX)
app.include_router(traces_router,          prefix=PREFIX)
app.include_router(analytics.router,       prefix=PREFIX)
app.include_router(logs.router,            prefix=PREFIX)
app.include_router(notifications.router,   prefix=PREFIX)
app.include_router(global_settings.router, prefix=PREFIX)
app.include_router(ws_router,              prefix=PREFIX)

# ── Health / utility ─────────────────────────────────────────────────────────

@app.get("/health", tags=["system"], include_in_schema=False)
async def health():
    return {"status": "ok", "service": "backend"}


@app.get("/api/v1/ping", tags=["system"])
async def ping():
    return {"message": "pong"}
