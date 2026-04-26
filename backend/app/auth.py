import hashlib
from datetime import datetime, timedelta, timezone
import logging
import secrets
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import APIKeyHeader, OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .config import settings
from .database import get_db

logger = logging.getLogger("nfs-manager.auth")

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(hours=settings.jwt_expire_hours)
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.jwt_secret, algorithm=settings.jwt_algorithm)


async def get_current_user(
    token: Optional[str] = Depends(oauth2_scheme),
    api_key: Optional[str] = Depends(api_key_header),
    db: AsyncSession = Depends(get_db),
):
    from .models.user import User
    from .models.api_key import APIKey

    # Try API key first – check database keys
    if api_key:
        key_hash = hashlib.sha256(api_key.encode()).hexdigest()
        result = await db.execute(
            select(APIKey).where(APIKey.key_hash == key_hash, APIKey.is_active == True)
        )
        db_key = result.scalar_one_or_none()
        if db_key:
            user = await db.get(User, db_key.user_id)
            if user and user.is_active:
                # Update last_used_at
                db_key.last_used_at = datetime.now(timezone.utc)
                await db.commit()
                logger.debug(
                    "Authenticated via DB API key '%s' as user: %s",
                    db_key.name,
                    user.username,
                )
                return user

        # Fallback: legacy env-var API key
        if settings.api_key and secrets.compare_digest(api_key, settings.api_key):
            result = await db.execute(
                select(User).where(User.is_admin == True).limit(1)
            )
            user = result.scalar_one_or_none()
            if user:
                logger.debug(
                    "Authenticated via legacy API key as user: %s", user.username
                )
                return user

    # Try JWT token
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = jwt.decode(
            token, settings.jwt_secret, algorithms=[settings.jwt_algorithm]
        )
        sub = payload.get("sub")
        if sub is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        user_id = int(sub)
    except (JWTError, ValueError):
        # Expired / malformed tokens are extremely common (background polling
        # after logout, browser tabs left open, bot scans). DEBUG only – the
        # 401 response itself is enough signal for the client.
        logger.debug("Invalid JWT token presented")
        raise HTTPException(status_code=401, detail="Invalid token")

    user = await db.get(User, user_id)
    if not user or not user.is_active:
        logger.debug("JWT token for missing/disabled user id=%d", user_id)
        raise HTTPException(status_code=401, detail="User not found or disabled")
    logger.debug("Authenticated via JWT: %s (id=%d)", user.username, user.id)
    return user


async def require_admin(current_user=Depends(get_current_user)):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin privileges required")
    return current_user


async def verify_api_key(current_user=Depends(get_current_user)):
    """Backward compatible - now requires JWT or API key auth."""
    return current_user
