import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select

from app.core.deps import DBSession, PaginationDep, get_current_user, require_roles
from app.models.service import Service
from app.schemas.common import Page
from app.schemas.service import ServiceCreate, ServiceRead, ServiceUpdate

router = APIRouter(prefix="/services", tags=["Services"])


@router.get("", response_model=Page[ServiceRead], summary="List services")
async def list_services(
    db: DBSession,
    pagination: PaginationDep,
    _=Depends(get_current_user),
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    type_filter: Annotated[str | None, Query(alias="type")] = None,
    environment: str | None = None,
):
    q = select(Service)
    if status_filter:
        q = q.where(Service.status == status_filter)
    if type_filter:
        q = q.where(Service.type == type_filter)
    if environment:
        q = q.where(Service.environment == environment)

    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar_one()
    rows = (
        await db.execute(q.order_by(Service.name).offset(pagination.skip).limit(pagination.limit))
    ).scalars().all()
    return Page(items=rows, total=total, skip=pagination.skip, limit=pagination.limit)


@router.get("/{service_id}", response_model=ServiceRead, summary="Get service by ID")
async def get_service(
    service_id: uuid.UUID, db: DBSession, _=Depends(get_current_user)
):
    svc = await db.get(Service, service_id)
    if svc is None:
        raise HTTPException(status_code=404, detail="Service not found")
    return svc


@router.post(
    "/",
    response_model=ServiceRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_roles("admin", "analyst"))],
    summary="Create service",
)
async def create_service(payload: ServiceCreate, db: DBSession):
    svc = Service(
        name=payload.name,
        type=payload.type,
        environment=payload.environment,
        description=payload.description,
        base_url=payload.base_url,
        status=payload.status,
        metadata_=payload.metadata_,
    )
    db.add(svc)
    await db.flush()
    await db.refresh(svc)
    return svc


@router.put(
    "/{service_id}",
    response_model=ServiceRead,
    dependencies=[Depends(require_roles("admin", "analyst"))],
    summary="Update service",
)
async def update_service(service_id: uuid.UUID, payload: ServiceUpdate, db: DBSession):
    svc = await db.get(Service, service_id)
    if svc is None:
        raise HTTPException(status_code=404, detail="Service not found")

    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(svc, field, value)

    await db.flush()
    await db.refresh(svc)
    return svc


@router.delete(
    "/{service_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_roles("admin"))],
    summary="Delete service (admin only)",
)
async def delete_service(service_id: uuid.UUID, db: DBSession):
    svc = await db.get(Service, service_id)
    if svc is None:
        raise HTTPException(status_code=404, detail="Service not found")
    await db.delete(svc)
