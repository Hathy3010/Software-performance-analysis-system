import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select

from app.core.deps import DBSession, PaginationDep, get_current_user, require_roles
from app.core.security import hash_password
from app.models.user import User
from app.schemas.common import Page
from app.schemas.user import UserCreate, UserRead, UserUpdate

router = APIRouter(prefix="/users", tags=["Users"])


@router.get("/me", response_model=UserRead, summary="Current user profile")
async def get_me(current_user=Depends(get_current_user)):
    return current_user


@router.get(
    "/",
    response_model=Page[UserRead],
    dependencies=[Depends(require_roles("admin"))],
    summary="List all users (admin only)",
)
async def list_users(db: DBSession, pagination: PaginationDep):
    total = (await db.execute(select(func.count(User.id)))).scalar_one()
    rows = (
        await db.execute(select(User).offset(pagination.skip).limit(pagination.limit))
    ).scalars().all()
    return Page(items=rows, total=total, skip=pagination.skip, limit=pagination.limit)


@router.post(
    "/",
    response_model=UserRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_roles("admin"))],
    summary="Create user (admin only)",
)
async def create_user(payload: UserCreate, db: DBSession):
    exists = (
        await db.execute(select(User).where(User.email == payload.email))
    ).scalar_one_or_none()
    if exists:
        raise HTTPException(status_code=409, detail="Email already registered")

    user = User(
        email=payload.email,
        username=payload.username,
        hashed_password=hash_password(payload.password),
        role=payload.role,
        is_active=payload.is_active,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return user


@router.patch(
    "/{user_id}",
    response_model=UserRead,
    dependencies=[Depends(require_roles("admin"))],
    summary="Update user (admin only)",
)
async def update_user(user_id: uuid.UUID, payload: UserUpdate, db: DBSession):
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    for field, value in payload.model_dump(exclude_none=True).items():
        if field == "password":
            user.hashed_password = hash_password(value)
        else:
            setattr(user, field, value)

    await db.flush()
    await db.refresh(user)
    return user


@router.delete(
    "/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_roles("admin"))],
    summary="Delete user (admin only)",
)
async def delete_user(user_id: uuid.UUID, db: DBSession):
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    await db.delete(user)
