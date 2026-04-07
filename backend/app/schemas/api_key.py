from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class APIKeyCreate(BaseModel):
    name: str


class APIKeyResponse(BaseModel):
    id: int
    name: str
    key_prefix: str
    key_suffix: str
    is_active: bool
    created_at: Optional[datetime] = None
    last_used_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class APIKeyCreated(APIKeyResponse):
    """Returned only on creation – includes the full plaintext key."""

    key: str
