import hashlib
import logging
import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user
from ..database import get_db
from ..models.api_key import APIKey
from ..models.user import User
from ..schemas.api_key import APIKeyCreate, APIKeyResponse, APIKeyCreated

logger = logging.getLogger("nfs-manager.router.api_keys")

router = APIRouter()


def _hash_key(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()


@router.get("/", response_model=list[APIKeyResponse])
async def list_api_keys(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(APIKey)
        .where(APIKey.user_id == current_user.id)
        .order_by(APIKey.created_at.desc())
    )
    return result.scalars().all()


@router.post("/", response_model=APIKeyCreated, status_code=201)
async def create_api_key(
    data: APIKeyCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    name = data.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")

    raw_key = secrets.token_hex(32)  # 64-char hex key
    key_hash = _hash_key(raw_key)

    api_key = APIKey(
        name=name,
        key_hash=key_hash,
        key_prefix=raw_key[:8],
        key_suffix=raw_key[-5:],
        user_id=current_user.id,
    )
    db.add(api_key)
    await db.commit()
    await db.refresh(api_key)

    logger.info(
        "API key '%s' created by user %s (id=%d)",
        name,
        current_user.username,
        current_user.id,
    )

    return APIKeyCreated(
        id=api_key.id,
        name=api_key.name,
        key_prefix=api_key.key_prefix,
        key_suffix=api_key.key_suffix,
        is_active=api_key.is_active,
        created_at=api_key.created_at,
        last_used_at=api_key.last_used_at,
        key=raw_key,
    )


@router.patch("/{key_id}/toggle", response_model=APIKeyResponse)
async def toggle_api_key(
    key_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    api_key = await db.get(APIKey, key_id)
    if not api_key or api_key.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="API key not found")

    api_key.is_active = not api_key.is_active
    await db.commit()
    await db.refresh(api_key)

    state = "activated" if api_key.is_active else "deactivated"
    logger.info(
        "API key '%s' %s by user %s", api_key.name, state, current_user.username
    )
    return api_key


@router.delete("/{key_id}", status_code=204)
async def delete_api_key(
    key_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    api_key = await db.get(APIKey, key_id)
    if not api_key or api_key.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="API key not found")

    logger.info("API key '%s' deleted by user %s", api_key.name, current_user.username)
    await db.delete(api_key)
    await db.commit()
