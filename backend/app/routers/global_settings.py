"""
Global settings — singleton row (id=1).
Admin-only read + update.  GET is also accessible to analyst/viewer
so the UI can display sound/push preferences that affect all users.
"""
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select

from app.core.deps import DBSession, get_current_user, require_roles
from app.models.global_settings import GlobalSettings
from app.schemas.global_settings import GlobalSettingsRead, GlobalSettingsUpdate

router = APIRouter(prefix="/global-settings", tags=["Global Settings"])

AuthDep = Annotated[object, Depends(get_current_user)]
_SINGLETON_ID = 1


async def _get_or_create(db: DBSession) -> GlobalSettings:
    row = await db.get(GlobalSettings, _SINGLETON_ID)
    if row is None:
        row = GlobalSettings(id=_SINGLETON_ID)
        db.add(row)
        await db.flush()
        await db.refresh(row)
    return row


@router.get("", response_model=GlobalSettingsRead, summary="Get global platform settings")
async def get_global_settings(db: DBSession, _: AuthDep):
    return await _get_or_create(db)


@router.patch(
    "/",
    response_model=GlobalSettingsRead,
    dependencies=[Depends(require_roles("admin"))],
    summary="Update global platform settings (admin only)",
)
async def update_global_settings(
    payload: GlobalSettingsUpdate,
    db: DBSession,
    current_user: Annotated[object, Depends(get_current_user)],
):
    row = await _get_or_create(db)

    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(row, field, value)

    row.updated_by = getattr(current_user, "username", None) or str(getattr(current_user, "id", ""))
    await db.flush()
    await db.refresh(row)
    return row


@router.get(
    "/notification-logs",
    summary="System-wide notification log (admin only)",
    dependencies=[Depends(require_roles("admin"))],
)
async def system_notification_logs(
    db: DBSession,
    limit: int = 100,
):
    """Returns all notification_logs joined with the recipient user's info."""
    from sqlalchemy import text
    rows = (
        await db.execute(
            text(
                "SELECT nl.id, nl.subject, nl.service_name, nl.anomaly_score, "
                "nl.sent_at, nl.status, u.username, u.email "
                "FROM notification_logs nl "
                "JOIN users u ON u.id = nl.user_id "
                "ORDER BY nl.sent_at DESC LIMIT :limit"
            ),
            {"limit": limit},
        )
    ).mappings().all()

    return {"items": [dict(r) for r in rows], "total": len(rows)}
