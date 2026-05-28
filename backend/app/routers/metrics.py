import logging
import time
from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, Query
from sqlalchemy import text

from app.config import get_settings
from app.core.deps import DBSession, get_current_user

router = APIRouter(prefix="/metrics", tags=["Metrics"])
logger = logging.getLogger(__name__)

_SERVICES = ["aiops-platform", "storefront-service"]


def _instant(results: list) -> float | None:
    if not results:
        return None
    try:
        v = float(results[0]["value"][1])
        return None if v != v else v
    except (IndexError, KeyError, ValueError):
        return None


async def _query(client: httpx.AsyncClient, promql: str) -> float | None:
    try:
        resp = await client.get("/api/v1/query", params={"query": promql}, timeout=8.0)
        resp.raise_for_status()
        return _instant(resp.json().get("data", {}).get("result", []))
    except Exception:
        return None


async def _range_query(
    client: httpx.AsyncClient, promql: str, start: float, end: float, step: int
) -> list[dict]:
    try:
        resp = await client.get(
            "/api/v1/query_range",
            params={"query": promql, "start": start, "end": end, "step": step},
            timeout=15.0,
        )
        resp.raise_for_status()
        results = resp.json().get("data", {}).get("result", [])
        if not results:
            return []
        return [
            {"ts": int(ts), "value": round(float(val), 6)}
            for ts, val in results[0].get("values", [])
            if val != "NaN"
        ]
    except Exception:
        return []


@router.get("/current", summary="Current per-service metrics from Prometheus")
async def get_current_metrics(_=Depends(get_current_user)):
    settings = get_settings()
    services_data = []

    async with httpx.AsyncClient(base_url=settings.prometheus_url) as client:
        for svc in _SERVICES:
            cpu = await _query(client, f'rate(process_cpu_seconds_total{{job="{svc}"}}[5m])')
            mem = await _query(client, f'process_resident_memory_bytes{{job="{svc}"}}')
            lat = await _query(
                client,
                f'histogram_quantile(0.99, sum by (le) '
                f'(rate(http_request_duration_seconds_bucket{{job="{svc}"}}[5m])))',
            )
            err_n = await _query(client, f'sum(rate(http_requests_total{{job="{svc}",status="5xx"}}[5m]))')
            err_d = await _query(client, f'sum(rate(http_requests_total{{job="{svc}"}}[5m]))')

            error_rate = 0.0
            if err_n and err_d and err_d > 0:
                error_rate = min(1.0, err_n / err_d)

            services_data.append({
                "service": svc,
                "cpu_rate": cpu or 0.0,
                "memory_mb": (mem or 0.0) / (1024 * 1024),
                "latency_p99_s": lat or 0.0,
                "error_rate": error_rate,
            })

    avg_cpu = sum(s["cpu_rate"] for s in services_data) / max(len(services_data), 1)
    avg_lat = sum(s["latency_p99_s"] for s in services_data) / max(len(services_data), 1)

    return {
        "timestamp": time.time(),
        "services": services_data,
        "aggregates": {"avg_cpu": avg_cpu, "avg_latency_p99_s": avg_lat},
    }


@router.get("/history", summary="Per-service metric time-series from Prometheus")
async def get_metric_history(
    _=Depends(get_current_user),
    service: Annotated[str | None, Query()] = None,
    hours: Annotated[int, Query(ge=1, le=168)] = 6,
    step: Annotated[int, Query(ge=10, le=3600)] = 60,
    quantile: Annotated[float, Query(ge=0.1, le=0.999)] = 0.99,
):
    """
    Returns time-series for cpu_rate, memory_mb, latency_s, error_rate, rps.
    latency_s uses the requested quantile (default P99). rps = requests/sec.
    """
    settings = get_settings()
    end = time.time()
    start = end - hours * 3600
    targets = [service] if service else _SERVICES
    result = []

    async with httpx.AsyncClient(base_url=settings.prometheus_url) as client:
        for svc in targets:
            cpu = await _range_query(
                client,
                f'rate(process_cpu_seconds_total{{job="{svc}"}}[5m])',
                start, end, step,
            )
            mem_raw = await _range_query(
                client,
                f'process_resident_memory_bytes{{job="{svc}"}}',
                start, end, step,
            )
            mem = [{"ts": p["ts"], "value": round(p["value"] / (1024 * 1024), 2)} for p in mem_raw]

            lat = await _range_query(
                client,
                f'histogram_quantile({quantile}, sum by (le) '
                f'(rate(http_request_duration_seconds_bucket{{job="{svc}"}}[5m])))',
                start, end, step,
            )
            err_n_pts = await _range_query(
                client,
                f'sum(rate(http_requests_total{{job="{svc}",status="5xx"}}[5m]))',
                start, end, step,
            )
            err_d_pts = await _range_query(
                client,
                f'sum(rate(http_requests_total{{job="{svc}"}}[5m]))',
                start, end, step,
            )
            err_n_map = {p["ts"]: p["value"] for p in err_n_pts}
            err_rate = [
                {
                    "ts": p["ts"],
                    "value": round(min(1.0, err_n_map[p["ts"]] / p["value"]), 6)
                    if err_n_map.get(p["ts"]) and p["value"] > 0 else 0.0,
                }
                for p in err_d_pts
            ]
            rps = await _range_query(
                client,
                f'sum(rate(http_requests_total{{job="{svc}"}}[5m]))',
                start, end, step,
            )

            result.append({
                "service": svc,
                "cpu_rate": cpu,
                "memory_mb": mem,
                "latency_s": lat,
                "error_rate": err_rate,
                "rps": rps,
            })

    return {"series": result, "window_hours": hours, "step_seconds": step, "quantile": quantile}


@router.get("/forecast", summary="Latest CPU forecast per service from AI engine")
async def get_cpu_forecast(
    db: DBSession,
    _=Depends(get_current_user),
    service: Annotated[str | None, Query()] = None,
):
    """Returns the most recent CPU forecast produced by the AI engine for each service."""
    svc_clause = "AND s.name = :svc" if service else ""
    rows = (
        await db.execute(
            text(f"""
                SELECT DISTINCT ON (s.name)
                    s.name AS service,
                    ar.detected_at,
                    ar.metadata
                FROM anomaly_results ar
                JOIN services s ON s.id = ar.service_id
                WHERE ar.metric_name = 'cpu_forecast'
                  {svc_clause}
                ORDER BY s.name, ar.detected_at DESC
            """),
            {"svc": service},
        )
    ).mappings().all()

    import json
    forecasts = []
    for row in rows:
        meta = json.loads(row["metadata"]) if isinstance(row["metadata"], str) else row["metadata"] or {}
        forecasts.append({
            "service": row["service"],
            "generated_at": row["detected_at"].isoformat()
                if hasattr(row["detected_at"], "isoformat") else str(row["detected_at"]),
            "trend": meta.get("trend"),
            "peak_cpu": meta.get("peak_cpu"),
            "confidence_note": meta.get("confidence_note"),
            "predictions": meta.get("predictions", []),
            "history_actual": meta.get("history_actual", []),
            "history_fitted": meta.get("history_fitted", []),
            "history_timestamps": meta.get("history_timestamps", []),
        })

    return {"forecasts": forecasts}
