import logging
import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy import func, select

from app.core.deps import DBSession, PaginationDep, get_current_user, require_roles
from app.models.alert import Alert
from app.schemas.alert import AcknowledgePayload, AlertCreate, AlertRead, AlertUpdate
from app.schemas.common import Page

router = APIRouter(prefix="/alerts", tags=["Alerts"])
logger = logging.getLogger(__name__)

_NOT_FOUND = "Alert not found"
_404 = {404: {"description": _NOT_FOUND}}
_404_409 = {404: {"description": _NOT_FOUND}, 409: {"description": "Alert already in terminal state"}}

AuthDep = Annotated[object, Depends(get_current_user)]


def _notify_critical_alert(alert_id: str, alert_name: str, service_id: str) -> None:
    logger.critical(
        "🚨 CRITICAL ALERT | id=%s name='%s' service=%s",
        alert_id, alert_name, service_id,
    )


@router.get("", response_model=Page[AlertRead], summary="List alerts")
async def list_alerts(
    db: DBSession,
    pagination: PaginationDep,
    background_tasks: BackgroundTasks,
    _: AuthDep,
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    severity: Annotated[str | None, Query()] = None,
    service_id: Annotated[uuid.UUID | None, Query()] = None,
    incident_id: Annotated[uuid.UUID | None, Query()] = None,
):
    q = select(Alert)
    if status_filter:
        q = q.where(Alert.status == status_filter)
    if severity:
        q = q.where(Alert.severity == severity)
    if service_id:
        q = q.where(Alert.service_id == service_id)
    if incident_id:
        q = q.where(Alert.incident_id == incident_id)

    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar_one()
    rows = (
        await db.execute(
            q.order_by(Alert.created_at.desc()).offset(pagination.skip).limit(pagination.limit)
        )
    ).scalars().all()

    for alert in rows:
        if alert.severity == "critical" and alert.status == "firing":
            background_tasks.add_task(
                _notify_critical_alert, str(alert.id), alert.name, str(alert.service_id),
            )

    return Page(items=rows, total=total, skip=pagination.skip, limit=pagination.limit)


@router.get("/{alert_id}", response_model=AlertRead, responses=_404, summary="Get alert by ID")
async def get_alert(alert_id: uuid.UUID, db: DBSession, _: AuthDep):
    alert = await db.get(Alert, alert_id)
    if alert is None:
        raise HTTPException(status_code=404, detail=_NOT_FOUND)
    return alert


@router.post(
    "/",
    response_model=AlertRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_roles("admin", "analyst"))],
    summary="Create alert",
)
async def create_alert(payload: AlertCreate, db: DBSession, background_tasks: BackgroundTasks):
    alert = Alert(**payload.model_dump())
    db.add(alert)
    await db.flush()
    await db.refresh(alert)

    if alert.severity == "critical" and alert.status == "firing":
        background_tasks.add_task(
            _notify_critical_alert, str(alert.id), alert.name, str(alert.service_id),
        )

    return alert


@router.patch(
    "/{alert_id}",
    response_model=AlertRead,
    responses=_404,
    dependencies=[Depends(require_roles("admin", "analyst"))],
    summary="Update alert status / severity",
)
async def update_alert(alert_id: uuid.UUID, payload: AlertUpdate, db: DBSession):
    alert = await db.get(Alert, alert_id)
    if alert is None:
        raise HTTPException(status_code=404, detail=_NOT_FOUND)

    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(alert, field, value)

    await db.flush()
    await db.refresh(alert)
    return alert


@router.post(
    "/{alert_id}/acknowledge",
    response_model=AlertRead,
    responses=_404_409,
    dependencies=[Depends(require_roles("admin", "analyst"))],
    summary="Acknowledge alert with mandatory comment",
)
async def acknowledge_alert(
    alert_id: uuid.UUID,
    payload: AcknowledgePayload,
    db: DBSession,
    current_user: Annotated[object, Depends(get_current_user)],
):
    alert = await db.get(Alert, alert_id)
    if alert is None:
        raise HTTPException(status_code=404, detail=_NOT_FOUND)
    if alert.status not in ("firing", "pending"):
        raise HTTPException(status_code=409, detail=f"Alert already {alert.status}")

    alert.status = "acknowledged"
    alert.acknowledged_at = datetime.now(timezone.utc)
    alert.acknowledged_by = getattr(current_user, "username", str(getattr(current_user, "id", "")))
    alert.acknowledge_comment = payload.comment
    await db.flush()
    await db.refresh(alert)
    return alert


@router.delete(
    "/{alert_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=_404,
    dependencies=[Depends(require_roles("admin"))],
    summary="Delete alert (admin only)",
)
async def delete_alert(alert_id: uuid.UUID, db: DBSession):
    alert = await db.get(Alert, alert_id)
    if alert is None:
        raise HTTPException(status_code=404, detail=_NOT_FOUND)
    await db.delete(alert)
