import logging
import time
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Request
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

logger = logging.getLogger("nfs-manager.router.auth")

router = APIRouter()

# Simple in-memory rate limiter for login attempts
_login_attempts: dict[str, list[float]] = defaultdict(list)
_MAX_ATTEMPTS = 5  # max attempts per window
_WINDOW_SECONDS = 300  # 5 minute window


def _check_rate_limit(ip: str):
    """Raise 429 if too many login attempts from this IP."""
    now = time.monotonic()
    # Purge old entries
    _login_attempts[ip] = [t for t in _login_attempts[ip] if now - t < _WINDOW_SECONDS]
    if len(_login_attempts[ip]) >= _MAX_ATTEMPTS:
        logger.warning("Rate limit exceeded for IP: %s", ip)
        raise HTTPException(
            status_code=429,
            detail="Too many login attempts. Try again later.",
        )
    _login_attempts[ip].append(now)


@router.post("/login", response_model=TokenResponse)
async def login(data: UserLogin, request: Request, db: AsyncSession = Depends(get_db)):
    client_ip = request.client.host if request.client else "unknown"
    _check_rate_limit(client_ip)

    result = await db.execute(
        select(User).where(User.username == data.username.lower().strip())
    )
    user = result.scalar_one_or_none()

    if not user or not verify_password(data.password, user.hashed_password):
        logger.warning("Failed login attempt for username: %s", data.username)
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if not user.is_active:
        logger.warning("Login attempt for disabled user: %s", data.username)
        raise HTTPException(status_code=403, detail="User disabled")

    token = create_access_token({"sub": str(user.id)})
    logger.info("User logged in: %s (id=%d)", user.username, user.id)
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
    if data.username is not None:
        # Check uniqueness
        existing = await db.execute(
            select(User).where(
                User.username == data.username, User.id != current_user.id
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=409, detail="Username already taken")
        current_user.username = data.username
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
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    current_user.hashed_password = hash_password(data.new_password)
    await db.commit()
    logger.info(
        "Password changed for user: %s (id=%d)", current_user.username, current_user.id
    )
    return {"detail": "Password changed"}


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
        raise HTTPException(status_code=409, detail="Username already taken")

    user = User(
        username=data.username.lower().strip(),
        display_name=data.display_name or data.username,
        hashed_password=hash_password(data.password),
        is_admin=data.is_admin,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    logger.info(
        "User created: %s (id=%d, admin=%s) by %s",
        user.username,
        user.id,
        user.is_admin,
        admin.username,
    )
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
        raise HTTPException(status_code=404, detail="User not found")

    if data.username is not None:
        existing = await db.execute(
            select(User).where(User.username == data.username, User.id != user_id)
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=409, detail="Username already taken")
        user.username = data.username
    if data.display_name is not None:
        user.display_name = data.display_name
    if data.password is not None:
        user.hashed_password = hash_password(data.password)
    if data.is_active is not None:
        if not data.is_active and user_id == admin.id:
            raise HTTPException(status_code=400, detail="Cannot deactivate yourself")
        user.is_active = data.is_active
    if data.is_admin is not None:
        if not data.is_admin and user_id == admin.id:
            raise HTTPException(
                status_code=400, detail="Cannot remove your own admin privileges"
            )
        user.is_admin = data.is_admin

    await db.commit()
    await db.refresh(user)
    logger.info(
        "User updated: %s (id=%d) by %s", user.username, user.id, admin.username
    )
    return user


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: int,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="You cannot delete yourself")

    await db.delete(user)
    await db.commit()
    logger.info(
        "User deleted: %s (id=%d) by %s", user.username, user_id, admin.username
    )
    return {"detail": "User deleted"}


@router.get("/setup-required")
async def setup_required(db: AsyncSession = Depends(get_db)):
    """Check if initial setup is needed (no users exist)."""
    result = await db.execute(select(func.count(User.id)))
    count = result.scalar()
    return {"setup_required": count == 0}
