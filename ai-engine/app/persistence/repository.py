import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.database import get_db_session
from app.detection.anomaly import AnomalyResult
from app.rca.engine import RCAResult
from app.forecasting.cpu_forecast import ForecastResult

logger = logging.getLogger(__name__)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _json(obj: dict[str, Any]) -> str:
    import json
    return json.dumps(obj, default=str)


def _get_service_id(session: Session, service_name: str) -> str | None:
    row = session.execute(
        text("SELECT id FROM services WHERE name = :name LIMIT 1"),
        {"name": service_name},
    ).fetchone()
    return str(row[0]) if row else None


# ---------------------------------------------------------------------------
# Incident / alert lifecycle helpers
# ---------------------------------------------------------------------------

def _severity_from_score(score: float) -> str:
    if score >= 0.85:
        return "critical"
    if score >= 0.70:
        return "high"
    if score >= 0.50:
        return "medium"
    return "low"


def _get_open_incident(session: Session, service_id: str) -> str | None:
    row = session.execute(
        text("""
            SELECT id FROM incidents
            WHERE service_id = :sid AND status IN ('open', 'investigating')
            ORDER BY started_at DESC LIMIT 1
        """),
        {"sid": service_id},
    ).fetchone()
    return str(row[0]) if row else None


def _create_incident(session: Session, service_id: str, service_name: str, score: float) -> str:
    incident_id = str(uuid.uuid4())
    severity = _severity_from_score(score)
    session.execute(
        text("""
            INSERT INTO incidents
                (id, service_id, title, description, severity, status, started_at, tags)
            VALUES
                (:id, :sid, :title, :desc, :sev, 'open', :started_at, :tags)
        """),
        {
            "id": incident_id,
            "sid": service_id,
            "title": f"Anomaly detected on {service_name}",
            "desc": (
                f"AI engine detected anomaly (score {score:.3f}). "
                "Automated incident opened by AI engine."
            ),
            "sev": severity,
            "started_at": _now(),
            "tags": _json({"source": "ai-engine", "auto": True}),
        },
    )
    logger.info("Auto-created incident for %s (score=%.3f severity=%s)", service_name, score, severity)
    return incident_id


def _upsert_alert(session: Session, service_id: str, incident_id: str, service_name: str, score: float) -> None:
    fingerprint = f"ai-engine-anomaly-{service_name}"
    severity = _severity_from_score(score)

    existing = session.execute(
        text("SELECT id, status FROM alerts WHERE fingerprint = :fp LIMIT 1"),
        {"fp": fingerprint},
    ).fetchone()

    if existing:
        session.execute(
            text("""
                UPDATE alerts
                SET status = 'firing', severity = :sev,
                    incident_id = :iid,
                    message = :msg, fired_at = :now, updated_at = :now
                WHERE fingerprint = :fp
            """),
            {
                "sev": severity, "iid": incident_id,
                "msg": f"Anomaly score {score:.3f} — AI engine composite detector",
                "now": _now(), "fp": fingerprint,
            },
        )
    else:
        session.execute(
            text("""
                INSERT INTO alerts
                    (id, service_id, incident_id, name, severity, status,
                     message, fingerprint, fired_at)
                VALUES
                    (:id, :sid, :iid, :name, :sev, 'firing',
                     :msg, :fp, :now)
            """),
            {
                "id": str(uuid.uuid4()),
                "sid": service_id, "iid": incident_id,
                "name": "AnomalyDetected",
                "sev": severity,
                "msg": f"Anomaly score {score:.3f} — AI engine composite detector",
                "fp": fingerprint,
                "now": _now(),
            },
        )


def _resolve_incident_and_alert(session: Session, service_id: str, service_name: str) -> None:
    now = _now()
    result = session.execute(
        text("""
            UPDATE incidents
            SET status = 'resolved', resolved_at = :now, updated_at = :now
            WHERE service_id = :sid AND status IN ('open', 'investigating')
        """),
        {"sid": service_id, "now": now},
    )
    if result.rowcount:
        logger.info("Auto-resolved incident for %s (anomaly cleared)", service_name)

    fingerprint = f"ai-engine-anomaly-{service_name}"
    session.execute(
        text("""
            UPDATE alerts
            SET status = 'resolved', resolved_at = :now, updated_at = :now
            WHERE fingerprint = :fp AND status = 'firing'
        """),
        {"fp": fingerprint, "now": now},
    )


# ---------------------------------------------------------------------------
# Anomaly results
# ---------------------------------------------------------------------------

def save_anomaly_result(result: AnomalyResult) -> None:
    try:
        with get_db_session() as session:
            service_id = _get_service_id(session, result.service)
            if service_id is None:
                logger.debug("Service '%s' not in DB — skipping", result.service)
                return

            session.execute(
                text("""
                    INSERT INTO anomaly_results
                        (id, service_id, metric_name, anomaly_score, is_anomaly,
                         detected_at, raw_value, metadata)
                    VALUES
                        (:id, :service_id, :metric_name, :score, :is_anomaly,
                         :detected_at, :raw_value, :metadata)
                """),
                {
                    "id": str(uuid.uuid4()),
                    "service_id": service_id,
                    "metric_name": "composite",
                    "score": result.anomaly_score,
                    "is_anomaly": result.is_anomaly,
                    "detected_at": _now(),
                    "raw_value": result.features.get("cpu_rate", 0.0),
                    "metadata": _json({
                        "features": result.features,
                        "method": result.method,
                        "detail": result.detail,
                        "spike": result.spike_detected,
                    }),
                },
            )

            if result.is_anomaly:
                # Open or reuse incident, fire alert
                incident_id = _get_open_incident(session, service_id)
                if incident_id is None:
                    incident_id = _create_incident(session, service_id, result.service, result.anomaly_score)
                _upsert_alert(session, service_id, incident_id, result.service, result.anomaly_score)

                from app.core.email import send_anomaly_emails
                send_anomaly_emails(
                    service=result.service,
                    score=result.anomaly_score,
                    detail=result.detail or f"Anomaly score {result.anomaly_score:.3f} via {result.method}",
                    session=session,
                )
            else:
                # Anomaly cleared — resolve any open incident + alert for this service
                _resolve_incident_and_alert(session, service_id, result.service)

        logger.debug("Saved anomaly result for %s (score=%.4f)", result.service, result.anomaly_score)
    except Exception:
        logger.warning("Failed to save anomaly result for %s", result.service, exc_info=True)


# ---------------------------------------------------------------------------
# RCA results
# ---------------------------------------------------------------------------

def save_rca_result(result: RCAResult) -> None:
    try:
        with get_db_session() as session:
            service_id = _get_service_id(session, result.source_service)
            if service_id is None:
                logger.debug("Service '%s' not in DB — skipping RCA persist", result.source_service)
                return

            incident_id = _get_open_incident(session, service_id)

            top = result.candidates[0]
            session.execute(
                text("""
                    INSERT INTO rca_results
                        (id, incident_id, service_id, root_cause_description,
                         confidence_score, evidence, created_at)
                    VALUES
                        (:id, :incident_id, :service_id, :description,
                         :confidence, :evidence, :created_at)
                """),
                {
                    "id": str(uuid.uuid4()),
                    "incident_id": incident_id,
                    "service_id": service_id,
                    "description": result.summary,
                    "confidence": top.confidence,
                    "evidence": _json({
                        "dependency_chain": result.chain,
                        "candidates": [
                            {
                                "service": c.service,
                                "confidence": c.confidence,
                                "reason": c.reason,
                                "evidence": c.evidence,
                            }
                            for c in result.candidates
                        ],
                    }),
                    "created_at": _now(),
                },
            )
        logger.debug("Saved RCA result for %s", result.source_service)
    except Exception:
        logger.warning("Failed to save RCA result for %s", result.source_service, exc_info=True)


# ---------------------------------------------------------------------------
# Forecast (stored in anomaly_results with metric_name = "cpu_forecast")
# ---------------------------------------------------------------------------

def save_forecast(result: ForecastResult) -> None:
    try:
        with get_db_session() as session:
            service_id = _get_service_id(session, result.service)
            if service_id is None:
                return

            session.execute(
                text("""
                    INSERT INTO anomaly_results
                        (id, service_id, metric_name, anomaly_score, is_anomaly,
                         detected_at, raw_value, metadata)
                    VALUES
                        (:id, :service_id, 'cpu_forecast', 0, false,
                         :detected_at, :peak, :metadata)
                """),
                {
                    "id": str(uuid.uuid4()),
                    "service_id": service_id,
                    "detected_at": _now(),
                    "peak": result.peak_cpu,
                    "metadata": _json({
                        "trend": result.trend,
                        "peak_cpu": result.peak_cpu,
                        "confidence_note": result.confidence_note,
                        "predictions": result.predictions,
                        "history_actual": result.history_actual or [],
                        "history_fitted": result.history_fitted or [],
                        "history_timestamps": result.history_timestamps or [],
                    }),
                },
            )
        logger.debug("Saved CPU forecast for %s (trend=%s)", result.service, result.trend)
    except Exception:
        logger.warning("Failed to save forecast for %s", result.service, exc_info=True)
