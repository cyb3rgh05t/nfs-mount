"""
Request / response logging middleware.

Logs every API request with method, path, status, duration, and user info.
"""

import logging
import time

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger("nfs-manager.middleware")


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        start = time.perf_counter()
        method = request.method
        path = request.url.path
        client = request.client.host if request.client else "unknown"

        # Skip noisy health checks at DEBUG level
        is_health = path == "/api/system/health"

        response: Response = await call_next(request)

        duration_ms = (time.perf_counter() - start) * 1000
        status = response.status_code

        msg = f"{method} {path} → {status} ({duration_ms:.0f}ms) [client={client}]"

        if is_health:
            logger.debug(msg)
        elif status >= 500:
            logger.error(msg)
        elif status >= 400:
            logger.warning(msg)
        else:
            logger.info(msg)

        return response
