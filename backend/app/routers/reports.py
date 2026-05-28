import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select

from app.core.deps import DBSession, PaginationDep, get_current_user, require_roles
from app.models.report import Report
from app.schemas.common import Page
from app.schemas.report import ReportCreate, ReportRead

router = APIRouter(prefix="/reports", tags=["Reports"])


@router.get("", response_model=Page[ReportRead], summary="List reports")
async def list_reports(
    db: DBSession,
    pagination: PaginationDep,
    current_user=Depends(get_current_user),
    report_type: Annotated[str | None, Query()] = None,
    status_filter: Annotated[str | None, Query(alias="status")] = None,
):
    q = select(Report)
    if report_type:
        q = q.where(Report.report_type == report_type)
    if status_filter:
        q = q.where(Report.status == status_filter)

    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar_one()
    rows = (
        await db.execute(
            q.order_by(Report.created_at.desc()).offset(pagination.skip).limit(pagination.limit)
        )
    ).scalars().all()
    return Page(items=rows, total=total, skip=pagination.skip, limit=pagination.limit)


@router.get("/{report_id}", response_model=ReportRead, summary="Get report by ID")
async def get_report(report_id: uuid.UUID, db: DBSession, _=Depends(get_current_user)):
    report = await db.get(Report, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")
    return report


@router.post(
    "/",
    response_model=ReportRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_roles("admin", "analyst"))],
    summary="Create report",
)
async def create_report(
    payload: ReportCreate,
    db: DBSession,
    current_user=Depends(get_current_user),
):
    report = Report(
        generated_by=current_user.id,
        title=payload.title,
        report_type=payload.report_type,
        format=payload.format,
        parameters=payload.parameters,
        status="pending",
    )
    db.add(report)
    await db.flush()
    await db.refresh(report)
    return report


@router.delete(
    "/{report_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_roles("admin"))],
    summary="Delete report (admin only)",
)
async def delete_report(report_id: uuid.UUID, db: DBSession):
    report = await db.get(Report, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")
    await db.delete(report)
