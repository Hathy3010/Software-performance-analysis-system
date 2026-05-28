import uuid
from collections.abc import AsyncGenerator
from typing import Annotated

from fastapi import Depends, HTTPException, Query, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import decode_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


# ---------------------------------------------------------------------------
# DB dependency alias
# ---------------------------------------------------------------------------

DBSession = Annotated[AsyncSession, Depends(get_db)]


# ---------------------------------------------------------------------------
# Auth dependencies
# ---------------------------------------------------------------------------

async def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    db: DBSession,
):
    """Validate JWT and return the active User ORM object."""
    from app.models.user import User  # local import avoids circular

    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            raise credentials_exc
        user_id: str | None = payload.get("sub")
        if user_id is None:
            raise credentials_exc
    except JWTError:
        raise credentials_exc

    user = await db.get(User, uuid.UUID(user_id))
    if user is None or not user.is_active:
        raise credentials_exc
    return user


CurrentUser = Annotated[object, Depends(get_current_user)]


def require_roles(*roles: str):
    """Factory that returns a dependency enforcing role membership."""

    async def _check(current_user=Depends(get_current_user)):
        if str(current_user.role) not in roles and current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        return current_user

    return _check


AdminUser = Depends(require_roles("admin"))
AnalystOrAdmin = Depends(require_roles("admin", "analyst"))


# ---------------------------------------------------------------------------
# Pagination dependency
# ---------------------------------------------------------------------------

class Pagination:
    def __init__(
        self,
        skip: int = Query(default=0, ge=0),
        limit: int = Query(default=50, ge=1, le=200),
    ):
        self.skip = skip
        self.limit = limit


PaginationDep = Annotated[Pagination, Depends(Pagination)]
