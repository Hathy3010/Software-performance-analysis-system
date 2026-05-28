import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func

from app.core.deps import DBSession, get_current_user, require_roles
from app.models.notification import NotificationSetting, NotificationLog
from app.models.user import User
from app.schemas.common import Page
from app.schemas.notification import NotificationSettingRead, NotificationSettingUpdate, NotificationLogRead

router = APIRouter(prefix="/notifications", tags=["Notifications"])
logger = logging.getLogger(__name__)


async def _get_or_create_settings(db, user_id) -> NotificationSetting:
    setting = (
        await db.execute(select(NotificationSetting).where(NotificationSetting.user_id == user_id))
    ).scalar_one_or_none()
    if setting is None:
        setting = NotificationSetting(user_id=user_id)
        db.add(setting)
        await db.flush()
        await db.refresh(setting)
    return setting


@router.get("/settings", response_model=NotificationSettingRead, summary="Get my notification settings")
async def get_my_settings(db: DBSession, current_user=Depends(get_current_user)):
    return await _get_or_create_settings(db, current_user.id)


@router.patch("/settings", response_model=NotificationSettingRead, summary="Update my notification settings")
async def update_my_settings(
    payload: NotificationSettingUpdate,
    db: DBSession,
    current_user=Depends(get_current_user),
):
    setting = await _get_or_create_settings(db, current_user.id)
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(setting, field, value)
    await db.flush()
    await db.refresh(setting)
    return setting


@router.get(
    "/logs",
    response_model=Page[NotificationLogRead],
    summary="My notification history",
)
async def get_my_logs(
    db: DBSession,
    current_user=Depends(get_current_user),
    skip: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
):
    total = (
        await db.execute(
            select(func.count(NotificationLog.id)).where(NotificationLog.user_id == current_user.id)
        )
    ).scalar_one()
    rows = (
        await db.execute(
            select(NotificationLog)
            .where(NotificationLog.user_id == current_user.id)
            .order_by(NotificationLog.sent_at.desc())
            .offset(skip)
            .limit(limit)
        )
    ).scalars().all()
    return Page(items=rows, total=total, skip=skip, limit=limit)


# ── Admin: view all users' notification settings ──────────────────────────────

@router.get(
    "/admin/settings",
    response_model=Page[NotificationSettingRead],
    dependencies=[Depends(require_roles("admin"))],
    summary="List all notification settings (admin only)",
)
async def admin_list_settings(
    db: DBSession,
    skip: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
):
    total = (await db.execute(select(func.count(NotificationSetting.id)))).scalar_one()
    rows = (
        await db.execute(
            select(NotificationSetting).offset(skip).limit(limit)
        )
    ).scalars().all()
    return Page(items=rows, total=total, skip=skip, limit=limit)


@router.patch(
    "/admin/settings/{user_id}",
    response_model=NotificationSettingRead,
    dependencies=[Depends(require_roles("admin"))],
    summary="Update any user's notification settings (admin only)",
)
async def admin_update_settings(user_id, payload: NotificationSettingUpdate, db: DBSession):
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    setting = await _get_or_create_settings(db, user_id)
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(setting, field, value)
    await db.flush()
    await db.refresh(setting)
    return setting
