"""
Analytics router — HTTP breakdown, DB queries, exceptions, request volume.
All data is sourced from Prometheus (time-series aggregates) and the
anomaly_results / rca_results tables (AI-engine computed signals).
"""
import logging
import time
from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text

from app.config import get_settings
from app.core.deps import DBSession, get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/analytics", tags=["Analytics"])
AuthDep = Annotated[object, Depends(get_current_user)]


def _prom_query(query: str) -> list[dict]:
    settings = get_settings()
    try:
        with httpx.Client(base_url=settings.prometheus_url, timeout=10.0) as client:
            resp = client.get("/api/v1/query", params={"query": query})
            resp.raise_for_status()
            return resp.json().get("data", {}).get("result", [])
    except Exception as exc:
        logger.warning("Prometheus query failed (%s): %s", query, exc)
        return []


def _prom_range(query: str, hours: int) -> list[dict]:
    settings = get_settings()
    end = time.time()
    start = end - hours * 3600
    try:
        with httpx.Client(base_url=settings.prometheus_url, timeout=15.0) as client:
            resp = client.get(
                "/api/v1/query_range",
                params={"query": query, "start": start, "end": end, "step": "300"},
            )
            resp.raise_for_status()
            return resp.json().get("data", {}).get("result", [])
    except Exception as exc:
        logger.warning("Prometheus range query failed (%s): %s", query, exc)
        return []


@router.get("/http-breakdown", summary="HTTP status code distribution per service")
async def http_breakdown(
    _: AuthDep,
    service: Annotated[str | None, Query()] = None,
    hours: Annotated[int, Query(ge=1, le=168)] = 24,
):
    svc_filter = f'job="{service}"' if service else 'job=~".+"'
    results = _prom_query(
        f'sum by (job, status) (increase(http_requests_total{{{svc_filter}}}[{hours}h]))'
    )

    breakdown: dict[str, dict[str, float]] = {}
    for r in results:
        svc = r["metric"].get("job", "unknown")
        status = r["metric"].get("status", "unknown")
        val = float(r["value"][1]) if r.get("value") else 0.0
        breakdown.setdefault(svc, {})[status] = round(val, 1)

    # Compute error rate per service
    output = []
    for svc, codes in breakdown.items():
        total = sum(codes.values())
        errors_5xx = sum(v for k, v in codes.items() if k.startswith("5"))
        errors_4xx = sum(v for k, v in codes.items() if k.startswith("4"))
        output.append({
            "service": svc,
            "status_codes": codes,
            "total_requests": round(total, 1),
            "error_rate_5xx": round(errors_5xx / total, 4) if total else 0.0,
            "error_rate_4xx": round(errors_4xx / total, 4) if total else 0.0,
        })

    return {"services": output, "window_hours": hours}


@router.get("/request-volume", summary="Request rate time-series per service")
async def request_volume(
    _: AuthDep,
    service: Annotated[str | None, Query()] = None,
    hours: Annotated[int, Query(ge=1, le=168)] = 6,
):
    svc_filter = f'job="{service}"' if service else 'job=~".+"'
    results = _prom_range(
        f'sum by (job) (rate(http_requests_total{{{svc_filter}}}[5m]))',
        hours,
    )

    series = []
    for r in results:
        svc = r["metric"].get("job", "unknown")
        points = [
            {"ts": int(ts), "rps": round(float(val), 4)}
            for ts, val in r.get("values", [])
            if val != "NaN"
        ]
        series.append({"service": svc, "points": points})

    return {"series": series, "window_hours": hours}


@router.get("/error-rate", summary="Error rate time-series per service")
async def error_rate(
    _: AuthDep,
    service: Annotated[str | None, Query()] = None,
    hours: Annotated[int, Query(ge=1, le=168)] = 6,
):
    svc_filter = f'job="{service}"' if service else 'job=~".+"'
    results = _prom_range(
        f'sum by (job) (rate(http_requests_total{{{svc_filter},status=~"5.."}}[5m])) '
        f'/ sum by (job) (rate(http_requests_total{{{svc_filter}}}[5m]))',
        hours,
    )

    series = []
    for r in results:
        svc = r["metric"].get("job", "unknown")
        points = [
            {"ts": int(ts), "rate": round(float(val), 6)}
            for ts, val in r.get("values", [])
            if val != "NaN"
        ]
        series.append({"service": svc, "points": points})

    return {"series": series, "window_hours": hours}


@router.get("/db-queries", summary="Slow DB queries detected by AI engine")
async def db_queries(
    db: DBSession,
    _: AuthDep,
    service: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
):
    svc_clause = "AND s.name = :svc" if service else ""
    rows = (
        await db.execute(
            text(f"""
                SELECT
                    ar.detected_at,
                    s.name AS service,
                    ar.metadata
                FROM anomaly_results ar
                JOIN services s ON s.id = ar.service_id
                WHERE ar.metric_name = 'composite'
                  AND ar.metadata::jsonb ? 'features'
                  {svc_clause}
                ORDER BY ar.detected_at DESC
                LIMIT :limit
            """),
            {"svc": service, "limit": limit},
        )
    ).mappings().all()

    # Extract DB slow query data from RCA results
    rca_rows = (
        await db.execute(
            text(f"""
                SELECT
                    rr.created_at,
                    s.name AS service,
                    rr.evidence
                FROM rca_results rr
                JOIN services s ON s.id = rr.service_id
                WHERE rr.evidence::jsonb @> '{{"candidates": [{{"reason": "db_slow_query"}}]}}'
                  {svc_clause}
                ORDER BY rr.created_at DESC
                LIMIT :limit
            """),
            {"svc": service, "limit": limit},
        )
    ).mappings().all()

    import json
    slow_queries = []
    for row in rca_rows:
        evidence = json.loads(row["evidence"]) if isinstance(row["evidence"], str) else row["evidence"] or {}
        for c in evidence.get("candidates", []):
            if c.get("reason") == "db_slow_query":
                slow_queries.append({
                    "service": row["service"],
                    "detected_at": row["created_at"],
                    **c.get("evidence", {}),
                })

    return {"slow_queries": slow_queries, "total": len(slow_queries)}


@router.get("/exceptions", summary="Exception distribution detected by AI engine")
async def exceptions(
    db: DBSession,
    _: AuthDep,
    service: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
):
    svc_clause = "AND s.name = :svc" if service else ""

    import json
    rca_rows = (
        await db.execute(
            text(f"""
                SELECT
                    rr.created_at,
                    s.name AS service,
                    rr.evidence
                FROM rca_results rr
                JOIN services s ON s.id = rr.service_id
                WHERE rr.evidence::jsonb @> '{{"candidates": [{{"reason": "exception_detected"}}]}}'
                  {svc_clause}
                ORDER BY rr.created_at DESC
                LIMIT :limit
            """),
            {"svc": service, "limit": limit},
        )
    ).mappings().all()

    exc_events = []
    for row in rca_rows:
        evidence = json.loads(row["evidence"]) if isinstance(row["evidence"], str) else row["evidence"] or {}
        for c in evidence.get("candidates", []):
            if c.get("reason") == "exception_detected":
                exc_events.append({
                    "service": row["service"],
                    "detected_at": row["created_at"],
                    **c.get("evidence", {}),
                })

    # Aggregate counts by exception_type
    counts: dict[str, int] = {}
    for e in exc_events:
        exc_type = e.get("exception_type", "unknown")
        counts[exc_type] = counts.get(exc_type, 0) + e.get("occurrence_count", 1)

    return {
        "events": exc_events,
        "summary": [
            {"exception_type": k, "total_occurrences": v}
            for k, v in sorted(counts.items(), key=lambda x: -x[1])
        ],
        "total": len(exc_events),
    }


@router.get("/anomaly-history", summary="Anomaly score history per service")
async def anomaly_history(
    db: DBSession,
    _: AuthDep,
    service: Annotated[str | None, Query()] = None,
    hours: Annotated[int, Query(ge=1, le=168)] = 24,
):
    svc_clause = "AND s.name = :svc" if service else ""
    rows = (
        await db.execute(
            text(f"""
                SELECT
                    ar.detected_at,
                    s.name AS service,
                    ar.anomaly_score,
                    ar.is_anomaly,
                    ar.metadata
                FROM anomaly_results ar
                JOIN services s ON s.id = ar.service_id
                WHERE ar.metric_name = 'composite'
                  AND ar.detected_at >= NOW() - INTERVAL '{hours} hours'
                  {svc_clause}
                ORDER BY ar.detected_at ASC
            """),
            {"svc": service},
        )
    ).mappings().all()

    import json
    series: dict[str, list] = {}
    for row in rows:
        svc = row["service"]
        meta = json.loads(row["metadata"]) if isinstance(row["metadata"], str) else row["metadata"] or {}
        series.setdefault(svc, []).append({
            "ts": row["detected_at"].isoformat() if hasattr(row["detected_at"], "isoformat") else str(row["detected_at"]),
            "score": float(row["anomaly_score"]),
            "is_anomaly": bool(row["is_anomaly"]),
            "method": meta.get("method"),
            "spike": meta.get("spike", False),
        })

    return {
        "series": [{"service": svc, "points": pts} for svc, pts in series.items()],
        "window_hours": hours,
    }
