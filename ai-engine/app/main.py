import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI
from prometheus_client import make_asgi_app

from app.config import get_settings
from app.core.database import init_db
from app.core.logging_setup import configure_logging
from app.core.telemetry import init_telemetry
from app.worker import start_worker


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    configure_logging("DEBUG" if settings.environment == "development" else "INFO")
    init_telemetry()
    init_db()   # blocks with retries until Postgres is ready

    t = threading.Thread(target=start_worker, daemon=True, name="ai-engine-worker")
    t.start()

    yield


app = FastAPI(
    title="AIOps AI Engine",
    version="1.0.0",
    docs_url="/docs",
    lifespan=lifespan,
)

# Prometheus metrics endpoint
app.mount("/metrics", make_asgi_app())


@app.get("/health", include_in_schema=False)
def health():
    return {"status": "ok", "service": "ai-engine"}
