from fastapi.security import APIKeyHeader
from fastapi import Security, HTTPException

from .config import settings

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


async def verify_api_key(api_key: str = Security(api_key_header)):
    if not settings.api_key:
        return  # Auth disabled when no key configured
    if api_key != settings.api_key:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")
