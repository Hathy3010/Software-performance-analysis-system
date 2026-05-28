import asyncio
import os
import random
import time

from fastapi import FastAPI, HTTPException
from opentelemetry import trace
from prometheus_fastapi_instrumentator import Instrumentator

from app.telemetry import init_telemetry
from app.controller import DemoController
from app.router_demo import router as demo_router

init_telemetry()

app = FastAPI(title="AIOps Demo App", version="2.0.0", docs_url=None)
app.include_router(demo_router)
Instrumentator().instrument(app).expose(app, include_in_schema=False)

tracer = trace.get_tracer("demo-app")
SIMULATE_ANOMALIES = os.getenv("SIMULATE_ANOMALIES", "true").lower() == "true"


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/health", include_in_schema=False)
def health():
    s = DemoController.get().active
    return {
        "status": "ok",
        "service": "demo-app",
        "scenario": s.name if s else None,
        "phase": s.phase_label if s else None,
    }


@app.get("/api/orders")
async def list_orders():
    await _latency("order")
    _error("order")
    return {"orders": [{"id": i, "status": "completed"} for i in range(1, 6)]}


@app.get("/api/orders/{order_id}")
async def get_order(order_id: int):
    await _latency("order")
    _error("order")
    if order_id > 100:
        raise HTTPException(status_code=404, detail="Order not found")
    return {"id": order_id, "status": "completed", "total": round(random.uniform(10, 500), 2)}


@app.post("/api/orders")
async def create_order():
    # Span makes payment dependency visible in Jaeger for RCA scenarios
    with tracer.start_as_current_span("order.validate_payment") as span:
        s = DemoController.get().active
        if s and s.name in ("wow_rca", "dependency_failure", "cascading_failure"):
            span.set_attribute("scenario.name", s.name)
            span.set_attribute("scenario.phase", s.phase_label)
            span.set_attribute("payment.latency_ms", int(s.effect.payment_extra_latency * 1000))
            if s.effect.payment_error_prob > 0.1:
                span.set_attribute("error", True)
                span.set_attribute("error.cause", "payment_service_degraded")
        await _latency("order")
        _error("order")
    return {"id": random.randint(1000, 9999), "status": "created"}


@app.get("/api/payments")
async def list_payments():
    # Span exposes DB-level root cause in Jaeger for wow_rca scenario
    with tracer.start_as_current_span("payment.db.query") as span:
        s = DemoController.get().active
        if s and s.name in ("wow_rca", "dependency_failure", "cascading_failure"):
            span.set_attribute("db.system", "postgresql")
            span.set_attribute("db.operation", "SELECT payments")
            span.set_attribute("scenario.name", s.name)
            span.set_attribute("scenario.phase", s.phase_label)
        if s and s.name == "wow_rca":
            pool_left = max(0, 10 - s.phase * 3)
            span.set_attribute("db.connection_pool.available", pool_left)
            span.set_attribute("db.connection_pool.max", 10)
            if s.phase >= 2:
                span.set_attribute("error", True)
                span.set_attribute("error.cause", "connection_pool_exhausted")
        await _latency("payment")
        _error("payment")
    return {"payments": []}


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

async def _latency(endpoint: str) -> None:
    """Base jitter + scenario extra latency + optional CPU burn."""
    base = random.uniform(0.01, 0.1)
    s = DemoController.get().active

    if s:
        _burn_cpu(s.effect.cpu_burn_seconds)
        base += (
            s.effect.payment_extra_latency
            if endpoint == "payment"
            else s.effect.order_extra_latency
        )
    elif SIMULATE_ANOMALIES and endpoint == "payment" and random.random() < 0.1:
        base += random.uniform(1.5, 3.0)

    await asyncio.sleep(base)


def _error(endpoint: str) -> None:
    """Inject HTTP error according to active scenario probability."""
    s = DemoController.get().active

    if s:
        prob = s.effect.payment_error_prob if endpoint == "payment" else s.effect.order_error_prob
        code = s.effect.payment_error_code if endpoint == "payment" else s.effect.order_error_code
        if prob > 0 and random.random() < prob:
            raise HTTPException(
                status_code=code,
                detail=f"[{s.name}:{s.phase_label}] simulated {endpoint} failure",
            )
        return

    if SIMULATE_ANOMALIES and endpoint == "order" and random.random() < 0.05:
        raise HTTPException(500, "Simulated internal error")


def _burn_cpu(seconds: float) -> None:
    """Real CPU busy-loop — shows up in process_cpu_seconds_total metric."""
    if seconds <= 0:
        return
    deadline = time.perf_counter() + seconds
    while time.perf_counter() < deadline:
        _ = 1 + 1  # intentional busy-loop for CPU load simulation
