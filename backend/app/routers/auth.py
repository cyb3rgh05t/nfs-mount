import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import (
    hash_password,
    verify_password,
    create_access_token,
    get_current_user,
    require_admin,
)
from ..database import get_db
from ..models.user import User
from ..schemas.user import (
    UserLogin,
    UserCreate,
    UserUpdate,
    UserResponse,
    TokenResponse,
    PasswordChange,
)

logger = logging.getLogger("nfs-manager")

router = APIRouter()


@router.post("/login", response_model=TokenResponse)
async def login(data: UserLogin, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(User).where(User.username == data.username.lower().strip())
    )
    user = result.scalar_one_or_none()

    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Ungültige Anmeldedaten")

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Benutzer deaktiviert")

    token = create_access_token({"sub": str(user.id)})
    return TokenResponse(
        access_token=token,
        user=UserResponse.model_validate(user),
    )


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.put("/me", response_model=UserResponse)
async def update_me(
    data: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if data.display_name is not None:
        current_user.display_name = data.display_name
    # Users can't change their own admin/active status via this endpoint
    await db.commit()
    await db.refresh(current_user)
    return current_user


@router.post("/change-password")
async def change_password(
    data: PasswordChange,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not verify_password(data.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Aktuelles Passwort ist falsch")

    current_user.hashed_password = hash_password(data.new_password)
    await db.commit()
    return {"detail": "Passwort geändert"}


# ── Admin: User Management ──


@router.get("/users", response_model=list[UserResponse])
async def list_users(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).order_by(User.id))
    return result.scalars().all()


@router.post("/users", response_model=UserResponse, status_code=201)
async def create_user(
    data: UserCreate,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    existing = await db.execute(
        select(User).where(User.username == data.username.lower().strip())
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Benutzername bereits vergeben")

    user = User(
        username=data.username.lower().strip(),
        display_name=data.display_name or data.username,
        hashed_password=hash_password(data.password),
        is_admin=data.is_admin,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@router.put("/users/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: int,
    data: UserUpdate,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Benutzer nicht gefunden")

    if data.display_name is not None:
        user.display_name = data.display_name
    if data.password is not None:
        user.hashed_password = hash_password(data.password)
    if data.is_active is not None:
        user.is_active = data.is_active
    if data.is_admin is not None:
        user.is_admin = data.is_admin

    await db.commit()
    await db.refresh(user)
    return user


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: int,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Benutzer nicht gefunden")
    if user.id == admin.id:
        raise HTTPException(
            status_code=400, detail="Du kannst dich nicht selbst löschen"
        )

    await db.delete(user)
    await db.commit()
    return {"detail": "Benutzer gelöscht"}


@router.get("/setup-required")
async def setup_required(db: AsyncSession = Depends(get_db)):
    """Check if initial setup is needed (no users exist)."""
    result = await db.execute(select(func.count(User.id)))
    count = result.scalar()
    return {"setup_required": count == 0}
