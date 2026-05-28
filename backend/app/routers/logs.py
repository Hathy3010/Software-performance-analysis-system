import logging
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text

from app.core.deps import DBSession, get_current_user

router = APIRouter(prefix="/logs", tags=["Logs"])
logger = logging.getLogger(__name__)

_NOT_FOUND_SVC = "AND s.name = :svc"


@router.get("", summary="Unified log stream aggregated from system events")
async def list_logs(
    db: DBSession,
    _=Depends(get_current_user),
    service: Annotated[str | None, Query()] = None,
    level: Annotated[str | None, Query()] = None,
    search: Annotated[str | None, Query()] = None,
    hours: Annotated[float, Query(ge=0.1, le=168)] = 1.0,
    limit: Annotated[int, Query(ge=1, le=500)] = 200,
):
    """
    Returns a unified log stream built from anomaly detections, alert firings,
    and incident lifecycle events. Entries are sorted newest-first.
    """
    since = datetime.now(timezone.utc) - timedelta(hours=hours)
    svc_clause = _NOT_FOUND_SVC if service else ""
    entries: list[dict] = []

    # ── Anomaly detections → log entries ──────────────────────────────────────
    anomaly_rows = (
        await db.execute(
            text(f"""
                SELECT ar.detected_at, s.name AS service,
                       ar.metric_name, ar.anomaly_score AS score, ar.metadata
                FROM anomaly_results ar
                JOIN services s ON s.id = ar.service_id
                WHERE ar.detected_at >= :since {svc_clause}
                ORDER BY ar.detected_at DESC
                LIMIT 400
            """),
            {"since": since, "svc": service},
        )
    ).mappings().all()

    for row in anomaly_rows:
        score = float(row["score"] or 0)
        if score >= 0.9:
            lvl = "critical"
        elif score >= 0.7:
            lvl = "error"
        elif score >= 0.5:
            lvl = "warn"
        else:
            lvl = "info"
        meta = row["metadata"] or {}
        trace_id = meta.get("trace_id") if isinstance(meta, dict) else None
        entries.append({
            "timestamp": row["detected_at"].isoformat(),
            "level": lvl,
            "service": row["service"],
            "component": "anomaly-detector",
            "message": f"Anomaly detected on {row['metric_name']} (score={score:.3f})",
            "trace_id": trace_id,
        })

    # ── Alert firings → log entries ───────────────────────────────────────────
    _sev_level = {"critical": "critical", "high": "error", "medium": "warn", "low": "info"}
    alert_rows = (
        await db.execute(
            text(f"""
                SELECT al.fired_at, al.created_at, s.name AS service,
                       al.name AS alert_name, al.severity, al.message, al.status
                FROM alerts al
                JOIN services s ON s.id = al.service_id
                WHERE COALESCE(al.fired_at, al.created_at) >= :since {svc_clause}
                ORDER BY COALESCE(al.fired_at, al.created_at) DESC
                LIMIT 200
            """),
            {"since": since, "svc": service},
        )
    ).mappings().all()

    for row in alert_rows:
        ts = row["fired_at"] or row["created_at"]
        entries.append({
            "timestamp": ts.isoformat() if ts else None,
            "level": _sev_level.get(row["severity"], "warn"),
            "service": row["service"],
            "component": "alertmanager",
            "message": row["message"] or f"Alert {row['status']}: {row['alert_name']}",
            "trace_id": None,
        })

    # ── Incident lifecycle → log entries ──────────────────────────────────────
    _inc_level = {"critical": "critical", "high": "error", "medium": "warn", "low": "info"}
    incident_rows = (
        await db.execute(
            text(f"""
                SELECT i.started_at, i.resolved_at, s.name AS service,
                       i.title, i.severity, i.status
                FROM incidents i
                JOIN services s ON s.id = i.service_id
                WHERE i.started_at >= :since {svc_clause}
                ORDER BY i.started_at DESC
                LIMIT 100
            """),
            {"since": since, "svc": service},
        )
    ).mappings().all()

    for row in incident_rows:
        entries.append({
            "timestamp": row["started_at"].isoformat(),
            "level": _inc_level.get(row["severity"], "error"),
            "service": row["service"],
            "component": "incident-manager",
            "message": f"Incident opened: {row['title']}",
            "trace_id": None,
        })
        if row["resolved_at"]:
            entries.append({
                "timestamp": row["resolved_at"].isoformat(),
                "level": "info",
                "service": row["service"],
                "component": "incident-manager",
                "message": f"Incident resolved: {row['title']}",
                "trace_id": None,
            })

    # ── Filter ────────────────────────────────────────────────────────────────
    if level:
        entries = [e for e in entries if e["level"] == level]

    if search:
        sl = search.lower()
        entries = [
            e for e in entries
            if sl in e["message"].lower() or sl in e["service"].lower()
        ]

    entries = [e for e in entries if e.get("timestamp")]
    entries.sort(key=lambda e: e["timestamp"], reverse=True)

    return {"logs": entries[:limit], "total": len(entries)}
