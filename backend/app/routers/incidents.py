import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select, text
from sqlalchemy.orm import selectinload

from app.core.deps import DBSession, PaginationDep, get_current_user, require_roles
from app.models.incident import Incident
from app.schemas.common import Page
from app.schemas.incident import IncidentCreate, IncidentRead, IncidentUpdate

router = APIRouter(prefix="/incidents", tags=["Incidents"])

_NOT_FOUND = "Incident not found"
_404 = {404: {"description": _NOT_FOUND}}
_404_409 = {404: {"description": _NOT_FOUND}, 409: {"description": "Incident already resolved/closed"}}

AuthDep = Annotated[object, Depends(get_current_user)]


@router.get("", response_model=Page[IncidentRead], summary="List incidents")
async def list_incidents(
    db: DBSession,
    pagination: PaginationDep,
    _: AuthDep,
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    severity: Annotated[str | None, Query()] = None,
    service_id: Annotated[uuid.UUID | None, Query()] = None,
):
    q = select(Incident)
    if status_filter:
        q = q.where(Incident.status == status_filter)
    if severity:
        q = q.where(Incident.severity == severity)
    if service_id:
        q = q.where(Incident.service_id == service_id)

    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar_one()
    rows = (
        await db.execute(
            q.options(selectinload(Incident.service))
            .order_by(Incident.started_at.desc())
            .offset(pagination.skip)
            .limit(pagination.limit)
        )
    ).scalars().all()
    return Page(items=rows, total=total, skip=pagination.skip, limit=pagination.limit)


@router.get(
    "/{incident_id}",
    response_model=IncidentRead,
    responses=_404,
    summary="Get incident by ID",
)
async def get_incident(incident_id: uuid.UUID, db: DBSession, _: AuthDep):
    incident = await db.get(Incident, incident_id)
    if incident is None:
        raise HTTPException(status_code=404, detail=_NOT_FOUND)
    return incident


@router.post(
    "/",
    response_model=IncidentRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_roles("admin", "analyst"))],
    summary="Create incident",
)
async def create_incident(payload: IncidentCreate, db: DBSession):
    incident = Incident(
        service_id=payload.service_id,
        title=payload.title,
        description=payload.description,
        severity=payload.severity,
        status=payload.status,
        started_at=payload.started_at or datetime.now(timezone.utc),
        tags=payload.tags,
    )
    db.add(incident)
    await db.flush()
    await db.refresh(incident)
    return incident


@router.patch(
    "/{incident_id}",
    response_model=IncidentRead,
    responses=_404,
    dependencies=[Depends(require_roles("admin", "analyst"))],
    summary="Update incident",
)
async def update_incident(
    incident_id: uuid.UUID, payload: IncidentUpdate, db: DBSession
):
    incident = await db.get(Incident, incident_id)
    if incident is None:
        raise HTTPException(status_code=404, detail=_NOT_FOUND)

    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(incident, field, value)

    await db.flush()
    await db.refresh(incident)
    return incident


@router.post(
    "/{incident_id}/resolve",
    response_model=IncidentRead,
    responses=_404_409,
    dependencies=[Depends(require_roles("admin", "analyst"))],
    summary="Mark incident as resolved",
)
async def resolve_incident(incident_id: uuid.UUID, db: DBSession):
    incident = await db.get(Incident, incident_id)
    if incident is None:
        raise HTTPException(status_code=404, detail=_NOT_FOUND)
    if incident.status in ("resolved", "closed"):
        raise HTTPException(status_code=409, detail=f"Incident already {incident.status}")

    incident.status = "resolved"
    incident.resolved_at = datetime.now(timezone.utc)
    await db.flush()
    await db.refresh(incident)
    return incident


@router.get(
    "/{incident_id}/rca",
    responses=_404,
    summary="Get RCA results for an incident",
)
async def get_incident_rca(incident_id: uuid.UUID, db: DBSession, _: AuthDep):
    rows = (
        await db.execute(
            text(
                "SELECT id, root_cause_description, confidence_score, evidence, created_at "
                "FROM rca_results WHERE incident_id = :id ORDER BY created_at DESC LIMIT 10"
            ),
            {"id": str(incident_id)},
        )
    ).mappings().all()

    return {
        "incident_id": str(incident_id),
        "results": [dict(r) for r in rows],
    }


@router.delete(
    "/{incident_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=_404,
    dependencies=[Depends(require_roles("admin"))],
    summary="Delete incident (admin only)",
)
async def delete_incident(incident_id: uuid.UUID, db: DBSession):
    incident = await db.get(Incident, incident_id)
    if incident is None:
        raise HTTPException(status_code=404, detail=_NOT_FOUND)
    await db.delete(incident)
