from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import case, func, select

from app.core.deps import DBSession, get_current_user
from app.models.alert import Alert
from app.models.incident import Incident
from app.models.service import Service
from app.schemas.dashboard import AlertSeverityCount, DashboardSummary, ServiceStatusCount

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/summary", response_model=DashboardSummary, summary="Platform-wide summary")
async def get_summary(db: DBSession, _=Depends(get_current_user)):
    # ── Services ──────────────────────────────────────────────────────────────
    svc_counts = (
        await db.execute(
            select(Service.status, func.count(Service.id).label("n"))
            .group_by(Service.status)
        )
    ).all()
    svc_map = {row.status: row.n for row in svc_counts}
    total_services = sum(svc_map.values())
    service_status = ServiceStatusCount(
        healthy=svc_map.get("healthy", 0),
        degraded=svc_map.get("degraded", 0),
        down=svc_map.get("down", 0),
        unknown=svc_map.get("unknown", 0),
    )

    # ── Incidents ─────────────────────────────────────────────────────────────
    open_incidents = (
        await db.execute(
            select(func.count(Incident.id)).where(Incident.status.in_(["open", "investigating"]))
        )
    ).scalar_one()

    critical_incidents = (
        await db.execute(
            select(func.count(Incident.id)).where(
                Incident.status.in_(["open", "investigating"]),
                Incident.severity == "critical",
            )
        )
    ).scalar_one()

    # ── Alerts ────────────────────────────────────────────────────────────────
    firing_alerts = (
        await db.execute(
            select(func.count(Alert.id)).where(Alert.status == "firing")
        )
    ).scalar_one()

    alert_sev_rows = (
        await db.execute(
            select(Alert.severity, func.count(Alert.id).label("n"))
            .where(Alert.status == "firing")
            .group_by(Alert.severity)
        )
    ).all()
    sev_map = {row.severity: row.n for row in alert_sev_rows}
    alert_severity = AlertSeverityCount(
        critical=sev_map.get("critical", 0),
        high=sev_map.get("high", 0),
        medium=sev_map.get("medium", 0),
        low=sev_map.get("low", 0),
    )

    # ── Anomalies (last 24h via anomaly_results table) ───────────────────────
    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
    try:
        from sqlalchemy import text

        anomaly_count = (
            await db.execute(
                text(
                    "SELECT COUNT(*) FROM anomaly_results "
                    "WHERE is_anomaly = true AND detected_at >= :cutoff"
                ),
                {"cutoff": cutoff},
            )
        ).scalar_one()
    except Exception:
        anomaly_count = 0

    # ── MTTR (mean time to resolve) ───────────────────────────────────────────
    mttr_row = (
        await db.execute(
            select(func.avg(Incident.duration_seconds)).where(
                Incident.status.in_(["resolved", "closed"]),
                Incident.duration_seconds.isnot(None),
            )
        )
    ).scalar_one()
    mttr = float(mttr_row) if mttr_row is not None else None

    return DashboardSummary(
        total_services=total_services,
        service_status=service_status,
        open_incidents=open_incidents,
        critical_incidents=critical_incidents,
        firing_alerts=firing_alerts,
        alert_severity=alert_severity,
        recent_anomalies_24h=anomaly_count,
        mttr_seconds=mttr,
    )
