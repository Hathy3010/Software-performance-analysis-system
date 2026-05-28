"""
WebSocket endpoint: /api/v1/ws/metrics

Authenticates via ?token= query parameter (browsers cannot send custom
headers on WebSocket upgrade).  Pushes a metric snapshot every 5 seconds
by querying Prometheus directly — same queries as the AI engine uses.
"""
import asyncio
import logging
import time
from typing import Any

import httpx
from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from jose import JWTError

from app.config import get_settings
from app.core.security import decode_token

router = APIRouter()
logger = logging.getLogger(__name__)

_INTERVAL = 5  # seconds between pushes

# Prometheus instant queries — one per metric, parameterised by {svc}
_Q_CPU  = 'rate(process_cpu_seconds_total{{job="{svc}"}}[5m])'
_Q_MEM  = 'process_resident_memory_bytes{{job="{svc}"}}'
_Q_LAT  = (
    'histogram_quantile(0.99, sum by (le) '
    '(rate(http_request_duration_seconds_bucket{{job="{svc}"}}[5m])))'
)
_Q_ERR_N = 'sum(rate(http_requests_total{{job="{svc}",status=~"5.."}}[5m]))'
_Q_ERR_D = 'sum(rate(http_requests_total{{job="{svc}"}}[5m]))'


async def _instant(client: httpx.AsyncClient, prom_url: str, query: str) -> float | None:
    try:
        r = await client.get(
            f"{prom_url}/api/v1/query",
            params={"query": query},
            timeout=5.0,
        )
        r.raise_for_status()
        results = r.json().get("data", {}).get("result", [])
        if not results:
            return None
        v = float(results[0]["value"][1])
        return None if v != v else v          # NaN guard
    except Exception:
        return None


async def _snapshot(prom_url: str, services: list[str]) -> list[dict[str, Any]]:
    async with httpx.AsyncClient() as client:
        rows = []
        for svc in services:
            cpu   = await _instant(client, prom_url, _Q_CPU.format(svc=svc))
            mem_b = await _instant(client, prom_url, _Q_MEM.format(svc=svc))
            lat   = await _instant(client, prom_url, _Q_LAT.format(svc=svc))
            err_n = await _instant(client, prom_url, _Q_ERR_N.format(svc=svc))
            err_d = await _instant(client, prom_url, _Q_ERR_D.format(svc=svc))

            err = 0.0
            if err_n is not None and err_d and err_d > 0:
                err = min(1.0, err_n / err_d)

            rows.append({
                "service":       svc,
                "cpu_rate":      round(cpu   or 0.0, 6),
                "memory_mb":     round((mem_b or 0.0) / 1_048_576, 2),
                "latency_p99_s": round(lat   or 0.0, 6),
                "error_rate":    round(err,           6),
            })
        return rows


@router.websocket("/ws/metrics")
async def ws_metrics(websocket: WebSocket, token: str = Query(default="")):
    # ── Auth ──────────────────────────────────────────────────────────────────
    try:
        payload = decode_token(token)
    except (JWTError, Exception):
        await websocket.close(code=4001, reason="Unauthorized")
        return

    await websocket.accept()
    settings = get_settings()
    logger.info("WS /metrics connected  user=%s", payload.get("sub"))

    try:
        while True:
            data = await _snapshot(settings.prometheus_url, settings.monitored_services_list)
            await websocket.send_json({"type": "metrics", "data": data, "ts": time.time()})
            await asyncio.sleep(_INTERVAL)
    except WebSocketDisconnect:
        logger.info("WS /metrics disconnected  user=%s", payload.get("sub"))
    except Exception as exc:
        logger.warning("WS /metrics error: %s", exc)
