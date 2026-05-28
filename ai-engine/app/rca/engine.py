import logging
from dataclasses import dataclass, field
from typing import Any

from app.ingestion.jaeger import TraceMetrics, Span

logger = logging.getLogger(__name__)

_DB_SLOW_THRESHOLD_MS = 200
_SERVER_ERROR_CODES = {500, 502, 503, 504}
_CLIENT_ERROR_CODES = set(range(400, 500))
_INFRA_EXCEPTION_KEYWORDS = ("connection", "timeout", "unavailable", "refused")


@dataclass
class RootCauseCandidate:
    service: str
    confidence: float
    reason: str
    evidence: dict[str, Any]


@dataclass
class RCAResult:
    source_service: str
    candidates: list[RootCauseCandidate]
    summary: str
    chain: list[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Span grouping helpers (pure functions, no branching depth)
# ---------------------------------------------------------------------------

def _group_by_service(spans: list[Span]) -> tuple[
    dict[str, list[int]],   # durations
    dict[str, int],          # server errors
    dict[str, int],          # client errors
    dict[str, list[str]],    # exception types
    list[Span],              # db spans
]:
    durations: dict[str, list[int]] = {}
    server_errors: dict[str, int] = {}
    client_errors: dict[str, int] = {}
    exceptions: dict[str, list[str]] = {}
    db_spans: list[Span] = []

    for s in spans:
        name = s.service_name
        durations.setdefault(name, []).append(s.duration_us)

        if s.has_error or (s.http_status_code in _SERVER_ERROR_CODES):
            server_errors[name] = server_errors.get(name, 0) + 1

        if s.http_status_code in _CLIENT_ERROR_CODES:
            client_errors[name] = client_errors.get(name, 0) + 1

        if s.exception_type:
            exceptions.setdefault(name, []).append(s.exception_type)

        if s.db_system:
            db_spans.append(s)

    return durations, server_errors, client_errors, exceptions, db_spans


def _build_children_map(spans: list[Span]) -> dict[str, list[str]]:
    children: dict[str, list[str]] = {}
    for s in spans:
        if s.parent_span_id:
            children.setdefault(s.parent_span_id, []).append(s.span_id)
    return children


# ---------------------------------------------------------------------------
# Individual rule functions — each returns 0 or 1 candidate
# ---------------------------------------------------------------------------

def _rule_a(durations: dict[str, list[int]], chain: list[str]) -> RootCauseCandidate | None:
    if not durations:
        return None
    worst = max(durations, key=lambda s: sum(durations[s]) / len(durations[s]))
    avg_us = sum(durations[worst]) / len(durations[worst])
    confidence = min(0.95, 0.3 + avg_us / 2_500_000)
    return RootCauseCandidate(
        service=worst,
        confidence=round(confidence, 3),
        reason="highest_child_latency",
        evidence={
            "avg_duration_ms": round(avg_us / 1000, 2),
            "call_count": len(durations[worst]),
            "hop_depth": chain.index(worst) if worst in chain else None,
        },
    )


def _rule_b(server_errors: dict[str, int], durations: dict[str, list[int]]) -> list[RootCauseCandidate]:
    candidates = []
    for svc, err_count in server_errors.items():
        total = len(durations.get(svc, [1]))
        err_rate = err_count / total
        confidence = min(0.95, 0.5 + err_rate * 0.45)
        candidates.append(RootCauseCandidate(
            service=svc,
            confidence=round(confidence, 3),
            reason="server_error_propagation",
            evidence={"error_count": err_count, "error_rate": round(err_rate, 4),
                      "total_calls": total, "error_type": "5xx"},
        ))
    return candidates


def _rule_d(client_errors: dict[str, int], durations: dict[str, list[int]]) -> list[RootCauseCandidate]:
    candidates = []
    for svc, err_count in client_errors.items():
        total = len(durations.get(svc, [1]))
        err_rate = err_count / total
        confidence = min(0.80, 0.35 + err_rate * 0.40)
        candidates.append(RootCauseCandidate(
            service=svc,
            confidence=round(confidence, 3),
            reason="client_error_4xx",
            evidence={"error_count": err_count, "error_rate": round(err_rate, 4),
                      "total_calls": total, "error_type": "4xx",
                      "note": "Caller sending invalid requests to this service"},
        ))
    return candidates


def _rule_e(db_spans: list[Span]) -> RootCauseCandidate | None:
    slow = [s for s in db_spans if s.duration_us > _DB_SLOW_THRESHOLD_MS * 1000]
    if not slow:
        return None
    worst = max(slow, key=lambda s: s.duration_us)  # type: ignore[arg-type]
    db_ms = round(worst.duration_us / 1000, 2)
    confidence = min(0.95, 0.45 + worst.duration_us / 10_000_000)
    return RootCauseCandidate(
        service=worst.service_name,
        confidence=round(confidence, 3),
        reason="db_slow_query",
        evidence={
            "db_system": worst.db_system,
            "duration_ms": db_ms,
            "operation": worst.db_operation,
            "statement_fragment": (worst.db_statement or "")[:80],
            "slow_span_count": len(slow),
        },
    )


def _rule_f(exceptions: dict[str, list[str]]) -> list[RootCauseCandidate]:
    candidates = []
    for svc, exc_types in exceptions.items():
        top_exc = max(set(exc_types), key=exc_types.count)
        is_infra = any(kw in top_exc.lower() for kw in _INFRA_EXCEPTION_KEYWORDS)
        candidates.append(RootCauseCandidate(
            service=svc,
            confidence=0.75 if is_infra else 0.55,
            reason="exception_detected",
            evidence={
                "exception_type": top_exc,
                "occurrence_count": exc_types.count(top_exc),
                "all_types": list(set(exc_types)),
                "category": "infrastructure" if is_infra else "application",
            },
        ))
    return candidates


def _rule_c_fallback(service: str, tm: TraceMetrics) -> RootCauseCandidate:
    return RootCauseCandidate(
        service=service,
        confidence=0.50,
        reason="self_anomaly",
        evidence={
            "p99_duration_ms": tm.p99_duration_ms,
            "error_count": tm.error_count,
            "trace_count": tm.trace_count,
            "note": "No downstream evidence — anomaly is internal to this service",
        },
    )


def _dedup_top3(candidates: list[RootCauseCandidate]) -> list[RootCauseCandidate]:
    seen: dict[str, RootCauseCandidate] = {}
    for c in candidates:
        if c.service not in seen or c.confidence > seen[c.service].confidence:
            seen[c.service] = c
    return sorted(seen.values(), key=lambda c: c.confidence, reverse=True)[:3]  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# Multi-hop chain builder
# ---------------------------------------------------------------------------

def _bfs_longest_chain(
    root_span_ids: list[str],
    root_service: str,
    span_index: dict[str, Span],
    children: dict[str, list[str]],
) -> list[str]:
    best: list[str] = [root_service]
    queue: list[tuple[str, list[str]]] = [(sid, [root_service]) for sid in root_span_ids]
    while queue:
        span_id, chain = queue.pop(0)
        for child_id in children.get(span_id, []):
            child = span_index.get(child_id)
            if child is None:
                continue
            new_chain = chain if child.service_name == chain[-1] else [*chain, child.service_name]
            queue.append((child_id, new_chain))
            if len(new_chain) > len(best):
                best = new_chain
    return best


# ---------------------------------------------------------------------------
# RCA Engine
# ---------------------------------------------------------------------------

class RCAEngine:
    """
    Rule-based RCA over enriched Jaeger trace data.

    Rules:
      A — Highest average child latency → latency bottleneck
      B — Child 5xx errors → server error propagation
      C — Self-anomaly fallback (no child evidence)
      D — Child 4xx errors → caller sending bad requests downstream
      E — DB span exceeds slow threshold → database bottleneck
      F — Exception type in child spans → error classification

    Multi-hop: full span tree traversal, not just direct children.
    """

    def analyze(
        self,
        anomalous_services: list[str],
        trace_data: dict[str, TraceMetrics],
    ) -> list[RCAResult]:
        results = []
        for svc in anomalous_services:
            tm = trace_data.get(svc)
            if tm is None or tm.trace_count == 0:
                logger.debug("RCA skipped for %s — no trace data", svc)
                continue
            result = self._analyze_service(svc, tm)
            results.append(result)
            logger.info("RCA [%s] → %s (chain=%s)", svc, result.summary, result.chain)
        return results

    def _analyze_service(self, service: str, tm: TraceMetrics) -> RCAResult:
        span_index = {s.span_id: s for s in tm.spans}
        children = _build_children_map(tm.spans)

        chain = self._dependency_chain(service, tm.spans, span_index, children)
        descendants = [s for s in tm.spans if s.service_name != service]

        durations, server_errors, client_errors, exceptions, db_spans = _group_by_service(descendants)

        candidates: list[RootCauseCandidate] = []

        if (c := _rule_a(durations, chain)):
            candidates.append(c)
        candidates.extend(_rule_b(server_errors, durations))
        candidates.extend(_rule_d(client_errors, durations))
        if (c := _rule_e(db_spans)):
            candidates.append(c)
        candidates.extend(_rule_f(exceptions))

        if not candidates:
            candidates.append(_rule_c_fallback(service, tm))

        top3 = _dedup_top3(candidates)
        top = top3[0]
        summary = (
            f"'{service}' is anomalous. "
            f"Top candidate: '{top.service}' via {top.reason} "
            f"(confidence {top.confidence:.0%})."
        )
        return RCAResult(source_service=service, candidates=top3, summary=summary, chain=chain)

    def _dependency_chain(
        self,
        root_service: str,
        spans: list[Span],
        span_index: dict[str, Span],
        children: dict[str, list[str]],
    ) -> list[str]:
        roots = [s.span_id for s in spans
                 if s.service_name == root_service and s.parent_span_id is None]
        if not roots:
            return [root_service]
        return _bfs_longest_chain(roots, root_service, span_index, children)
