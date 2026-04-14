"""
Request / response logging middleware.

Logs API requests with method, path, status, duration, and user info.
All successful (2xx/3xx) requests are logged at DEBUG to reduce noise.
Errors (4xx) at WARNING, server errors (5xx) at ERROR.
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

        response: Response = await call_next(request)

        duration_ms = (time.perf_counter() - start) * 1000
        status = response.status_code

        msg = f"{method} {path} → {status} ({duration_ms:.0f}ms) [client={client}]"

        if status >= 500:
            logger.error(msg)
        elif status >= 400:
            logger.warning(msg)
        else:
            logger.debug(msg)

        return response
