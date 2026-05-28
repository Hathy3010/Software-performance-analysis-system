"""
Traces router — proxies Jaeger API so the frontend only talks to one backend.

Endpoints:
  GET /traces                     — list recent traces (filterable)
  GET /traces/{trace_id}          — full trace with enriched span attributes
  GET /services/dependency-map    — service call graph derived from Jaeger
"""
import logging
import time
from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query

from app.config import get_settings
from app.core.deps import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/traces", tags=["Traces"])
AuthDep = Annotated[object, Depends(get_current_user)]

_JAEGER_UNREACHABLE = "Jaeger unreachable"
_HTTP_STATUS_CODE = "http.status_code"
_502 = {502: {"description": _JAEGER_UNREACHABLE}}


def _jaeger_base_url() -> str:
    return get_settings().jaeger_url


def _enrich_span(raw: dict, processes: dict) -> dict:
    """Flatten Jaeger span into a frontend-friendly dict with OTel tag extraction."""
    tags = {t["key"]: t.get("value") for t in raw.get("tags", []) if "key" in t}
    refs = raw.get("references", [])
    parent_id = next((r["spanID"] for r in refs if r.get("refType") == "CHILD_OF"), None)

    raw_status = tags.get(_HTTP_STATUS_CODE)
    http_status = None
    if raw_status is not None:
        try:
            http_status = int(raw_status)
        except (TypeError, ValueError):
            pass

    return {
        "trace_id": raw.get("traceID"),
        "span_id": raw.get("spanID"),
        "parent_span_id": parent_id,
        "operation_name": raw.get("operationName"),
        "service_name": processes.get(raw.get("processID", ""), "unknown"),
        "start_time_us": raw.get("startTime"),
        "duration_us": raw.get("duration"),
        "has_error": bool(tags.get("error", False)),
        "http_status_code": http_status,
        "http_method": tags.get("http.method"),
        "http_route": tags.get("http.route") or tags.get("http.target"),
        "db_system": tags.get("db.system"),
        "db_operation": tags.get("db.operation"),
        "db_statement": (tags.get("db.statement") or "")[:200],
        "exception_type": tags.get("exception.type") or tags.get("error.type"),
        "exception_message": tags.get("exception.message") or tags.get("error.message"),
        "peer_service": tags.get("peer.service"),
        "tags": tags,
    }


async def _jaeger_services(client: httpx.AsyncClient) -> list[str]:
    try:
        r = await client.get("/api/services", timeout=5.0)
        return r.json().get("data", []) if r.is_success else []
    except Exception:
        return []


async def _fetch_raw_traces(
    client: httpx.AsyncClient, services: list[str], base_params: dict, limit: int
) -> list:
    raw: list = []
    for svc in services[:10]:
        try:
            r = await client.get(
                "/api/traces",
                params={**base_params, "service": svc, "limit": min(limit, 20)},
            )
            if r.is_success:
                raw.extend(r.json().get("data", []))
        except Exception:
            pass
    return raw


def _span_has_error(span: dict) -> bool:
    tags = {t["key"]: t.get("value") for t in span.get("tags", []) if "key" in t}
    return bool(tags.get("error", False))


def _summarise_trace(trace: dict) -> dict:
    processes = {pid: p.get("serviceName", "?") for pid, p in trace.get("processes", {}).items()}
    spans = trace.get("spans", [])
    root_spans = [s for s in spans if not any(r.get("refType") == "CHILD_OF" for r in s.get("references", []))]
    fallback = spans[0] if spans else {}
    root = root_spans[0] if root_spans else fallback
    root_tags = {t["key"]: t.get("value") for t in root.get("tags", []) if "key" in t}
    http_status = int(root_tags[_HTTP_STATUS_CODE]) if _HTTP_STATUS_CODE in root_tags else None
    return {
        "trace_id": trace.get("traceID"),
        "root_service": processes.get(root.get("processID", ""), "?"),
        "root_operation": root.get("operationName"),
        "services": list({processes.get(s.get("processID", ""), "?") for s in spans}),
        "span_count": len(spans),
        "duration_ms": round((root.get("duration", 0)) / 1000, 2),
        "start_time_ms": (root.get("startTime", 0)) // 1000,
        "has_error": any(_span_has_error(s) for s in spans),
        "http_status_code": http_status,
    }


@router.get("", summary="List recent traces", responses=_502)
async def list_traces(
    _: AuthDep,
    service: Annotated[str | None, Query()] = None,
    lookback_minutes: Annotated[int, Query(ge=1, le=1440)] = 60,
    limit: Annotated[int, Query(ge=1, le=500)] = 50,
    min_duration_ms: Annotated[int | None, Query(ge=0)] = None,
    error_only: Annotated[bool, Query()] = False,
):
    end_us = int(time.time() * 1_000_000)
    start_us = end_us - lookback_minutes * 60 * 1_000_000

    base_params: dict = {"start": start_us, "end": end_us, "limit": limit}
    if min_duration_ms is not None:
        base_params["minDuration"] = f"{min_duration_ms}ms"
    if error_only:
        base_params["tags"] = '{"error":"true"}'

    try:
        async with httpx.AsyncClient(base_url=_jaeger_base_url(), timeout=15.0) as client:
            services_to_query = [service] if service else await _jaeger_services(client)
            raw_traces = await _fetch_raw_traces(client, services_to_query, base_params, limit)
    except Exception as exc:
        logger.warning("Jaeger list_traces failed: %s", exc)
        raise HTTPException(status_code=502, detail=_JAEGER_UNREACHABLE)

    summaries = [_summarise_trace(t) for t in raw_traces]
    return {"traces": summaries, "total": len(summaries)}


@router.get("/{trace_id}", summary="Get full trace with enriched span attributes", responses=_502)
async def get_trace(trace_id: str, _: AuthDep):
    try:
        async with httpx.AsyncClient(base_url=_jaeger_base_url(), timeout=15.0) as client:
            resp = await client.get(f"/api/traces/{trace_id}")
            resp.raise_for_status()
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 404:
            raise HTTPException(status_code=404, detail="Trace not found")
        raise HTTPException(status_code=502, detail=f"Jaeger error: {exc.response.status_code}")
    except Exception as exc:
        logger.warning("Jaeger get_trace failed: %s", exc)
        raise HTTPException(status_code=502, detail=_JAEGER_UNREACHABLE)

    data = resp.json().get("data", [])
    if not data:
        raise HTTPException(status_code=404, detail="Trace not found")

    trace = data[0]
    processes = {
        pid: p.get("serviceName", "unknown")
        for pid, p in trace.get("processes", {}).items()
    }
    enriched_spans = [_enrich_span(s, processes) for s in trace.get("spans", [])]

    enriched_spans.sort(key=lambda s: s["start_time_us"] or 0)
    trace_start = enriched_spans[0]["start_time_us"] if enriched_spans else 0
    trace_duration = max((s["start_time_us"] or 0) + (s["duration_us"] or 0) for s in enriched_spans) - trace_start

    for s in enriched_spans:
        s["offset_us"] = (s["start_time_us"] or 0) - trace_start
        s["width_pct"] = round(((s["duration_us"] or 0) / max(trace_duration, 1)) * 100, 3)

    return {
        "trace_id": trace_id,
        "services": list({s["service_name"] for s in enriched_spans}),
        "span_count": len(enriched_spans),
        "duration_us": trace_duration,
        "has_error": any(s["has_error"] for s in enriched_spans),
        "spans": enriched_spans,
    }


# Dependency map lives under /services but is implemented here for co-location
dep_map_router = APIRouter(prefix="/services", tags=["Traces"])


def _extract_span_services(trace: dict) -> dict[str, str]:
    processes = {
        pid: p.get("serviceName", "?")
        for pid, p in trace.get("processes", {}).items()
    }
    return {
        span.get("spanID", ""): processes.get(span.get("processID", ""), "?")
        for span in trace.get("spans", [])
    }


def _collect_edges(trace: dict, span_svc: dict[str, str], call_counts: dict) -> None:
    for span in trace.get("spans", []):
        child_svc = span_svc.get(span.get("spanID", ""), "?")
        for ref in span.get("references", []):
            if ref.get("refType") != "CHILD_OF":
                continue
            parent_svc = span_svc.get(ref.get("spanID", ""), "")
            if parent_svc and parent_svc != child_svc:
                key = (parent_svc, child_svc)
                call_counts[key] = call_counts.get(key, 0) + 1


async def _fetch_service_traces(
    client: httpx.AsyncClient, svc: str, start_us: int, end_us: int
) -> list:
    try:
        r = await client.get(
            "/api/traces",
            params={"service": svc, "start": start_us, "end": end_us, "limit": 100},
            timeout=10.0,
        )
        return r.json().get("data", []) if r.is_success else []
    except Exception:
        return []


@dep_map_router.get("/dependency-map", summary="Service call graph from Jaeger")
async def dependency_map(
    _: AuthDep,
    lookback_hours: Annotated[float, Query(ge=0.25, le=72)] = 1,
):
    end_us = int(time.time() * 1_000_000)
    start_us = end_us - int(lookback_hours * 3600 * 1_000_000)

    call_counts: dict[tuple[str, str], int] = {}
    nodes: set[str] = set()

    try:
        async with httpx.AsyncClient(base_url=_jaeger_base_url(), timeout=20.0) as client:
            services = await _jaeger_services(client)
            for svc in services[:15]:
                for trace in await _fetch_service_traces(client, svc, start_us, end_us):
                    span_svc = _extract_span_services(trace)
                    nodes.update(span_svc.values())
                    _collect_edges(trace, span_svc, call_counts)
    except Exception as exc:
        logger.warning("Jaeger dependency-map failed: %s", exc)

    return {
        "nodes": [{"id": n} for n in sorted(nodes)],
        "edges": [
            {"source": src, "target": tgt, "call_count": cnt}
            for (src, tgt), cnt in call_counts.items()
        ],
        "lookback_hours": lookback_hours,
    }
