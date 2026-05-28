import logging
import time
from dataclasses import dataclass, field
from typing import Any

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential, before_sleep_log

from app.config import get_settings

logger = logging.getLogger(__name__)


@dataclass
class Span:
    trace_id: str
    span_id: str
    operation_name: str
    service_name: str
    duration_us: int        # microseconds
    start_time_us: int      # Unix microseconds
    has_error: bool
    parent_span_id: str | None
    tags: dict[str, Any]

    # Level-1 enriched fields — extracted from OTel semantic convention tags
    http_status_code: int | None = None     # http.status_code
    http_method: str | None = None          # http.method
    http_route: str | None = None           # http.route
    db_system: str | None = None            # db.system  ("postgresql", "redis", …)
    db_statement: str | None = None         # db.statement
    db_operation: str | None = None         # db.operation ("SELECT", "INSERT", …)
    exception_type: str | None = None       # exception.type
    exception_message: str | None = None    # exception.message
    peer_service: str | None = None         # peer.service


@dataclass
class TraceMetrics:
    service: str
    trace_count: int
    avg_duration_ms: float
    p99_duration_ms: float
    error_count: int
    spans: list[Span] = field(default_factory=list)

    # Aggregated from enriched span fields
    http_status_counts: dict[int, int] = field(default_factory=dict)
    db_slow_queries: list[dict] = field(default_factory=list)   # top slow DB spans
    exception_counts: dict[str, int] = field(default_factory=dict)


def _parse_tags(raw_tags: list[dict[str, Any]]) -> dict[str, Any]:
    return {t["key"]: t.get("value") for t in raw_tags if "key" in t}


def _enrich_span(span: Span) -> None:
    """Populate Level-1 fields from the raw tags dict (OTel semantic conventions)."""
    t = span.tags

    raw_status = t.get("http.status_code")
    if raw_status is not None:
        try:
            span.http_status_code = int(raw_status)
        except (TypeError, ValueError):
            pass

    span.http_method = t.get("http.method") or t.get("http_method")
    span.http_route = t.get("http.route") or t.get("http.target") or t.get("http.url")
    span.db_system = t.get("db.system")
    span.db_statement = t.get("db.statement")
    span.db_operation = t.get("db.operation")
    span.exception_type = t.get("exception.type") or t.get("error.type")
    span.exception_message = t.get("exception.message") or t.get("error.message")
    span.peer_service = t.get("peer.service")


def _parse_spans(trace: dict[str, Any]) -> list[Span]:
    processes: dict[str, str] = {
        pid: p.get("serviceName", "unknown")
        for pid, p in trace.get("processes", {}).items()
    }
    spans: list[Span] = []
    for raw in trace.get("spans", []):
        tags = _parse_tags(raw.get("tags", []))
        has_error = bool(tags.get("error", False))

        refs = raw.get("references", [])
        parent_id = next(
            (r["spanID"] for r in refs if r.get("refType") == "CHILD_OF"), None
        )

        span = Span(
            trace_id=raw.get("traceID", ""),
            span_id=raw.get("spanID", ""),
            operation_name=raw.get("operationName", ""),
            service_name=processes.get(raw.get("processID", ""), "unknown"),
            duration_us=int(raw.get("duration", 0)),
            start_time_us=int(raw.get("startTime", 0)),
            has_error=has_error,
            parent_span_id=parent_id,
            tags=tags,
        )
        _enrich_span(span)
        spans.append(span)
    return spans


def _aggregate_enriched(service: str, spans: list[Span]) -> tuple[dict, list, dict]:
    """
    Returns (http_status_counts, db_slow_queries, exception_counts) from enriched spans.
    db_slow_queries: top-5 slowest DB spans (duration_ms, operation, statement fragment).
    """
    http_status_counts: dict[int, int] = {}
    db_spans: list[Span] = []
    exception_counts: dict[str, int] = {}

    for s in spans:
        if s.service_name != service:
            continue

        if s.http_status_code is not None:
            http_status_counts[s.http_status_code] = (
                http_status_counts.get(s.http_status_code, 0) + 1
            )

        if s.db_system:
            db_spans.append(s)

        if s.exception_type:
            exception_counts[s.exception_type] = (
                exception_counts.get(s.exception_type, 0) + 1
            )

    db_slow = sorted(db_spans, key=lambda s: s.duration_us, reverse=True)[:5]
    db_slow_queries = [
        {
            "duration_ms": round(s.duration_us / 1000, 2),
            "db_system": s.db_system,
            "operation": s.db_operation,
            "statement": (s.db_statement or "")[:120],
        }
        for s in db_slow
    ]

    return http_status_counts, db_slow_queries, exception_counts


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    before_sleep=before_sleep_log(logger, logging.WARNING),
)
def fetch_trace_metrics(
    services: list[str], lookback_minutes: int = 15
) -> dict[str, TraceMetrics]:
    """
    Query Jaeger for recent traces of each service.
    Returns a mapping of service name → TraceMetrics (with enriched span data).
    """
    settings = get_settings()
    end_us = int(time.time() * 1_000_000)
    start_us = end_us - lookback_minutes * 60 * 1_000_000
    results: dict[str, TraceMetrics] = {}

    with httpx.Client(base_url=settings.jaeger_url, timeout=15.0) as client:
        for svc in services:
            try:
                resp = client.get(
                    "/api/traces",
                    params={
                        "service": svc,
                        "start": start_us,
                        "end": end_us,
                        "limit": 200,
                    },
                )
                resp.raise_for_status()
                traces = resp.json().get("data", [])
            except httpx.HTTPStatusError as exc:
                if exc.response.status_code == 404:
                    logger.debug("No traces found for service %s in Jaeger", svc)
                else:
                    logger.warning("Jaeger request failed for %s: %s", svc, exc)
                continue
            except Exception:
                logger.warning("Failed to fetch Jaeger traces for %s", svc, exc_info=True)
                continue

            all_spans: list[Span] = []
            for trace in traces:
                all_spans.extend(_parse_spans(trace))

            if not all_spans:
                results[svc] = TraceMetrics(
                    service=svc, trace_count=0, avg_duration_ms=0.0,
                    p99_duration_ms=0.0, error_count=0,
                )
                continue

            trace_durations = [
                s.duration_us for s in all_spans if s.parent_span_id is None
            ] or [s.duration_us for s in all_spans]

            trace_durations_sorted = sorted(trace_durations)
            n = len(trace_durations_sorted)
            avg_us = sum(trace_durations_sorted) / n
            p99_us = trace_durations_sorted[int(n * 0.99)]
            error_count = sum(1 for s in all_spans if s.has_error)

            http_status_counts, db_slow_queries, exception_counts = _aggregate_enriched(
                svc, all_spans
            )

            results[svc] = TraceMetrics(
                service=svc,
                trace_count=len(traces),
                avg_duration_ms=round(avg_us / 1000, 3),
                p99_duration_ms=round(p99_us / 1000, 3),
                error_count=error_count,
                spans=all_spans,
                http_status_counts=http_status_counts,
                db_slow_queries=db_slow_queries,
                exception_counts=exception_counts,
            )
            logger.debug(
                "Traces [%s] count=%d avg=%.1fms p99=%.1fms errors=%d http=%s",
                svc, len(traces), avg_us / 1000, p99_us / 1000, error_count,
                http_status_counts,
            )

    return results
