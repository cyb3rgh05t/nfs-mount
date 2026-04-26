"""
Request / response logging middleware.

Logs API requests with method, path, status, duration, and user info.
Successful (2xx/3xx) requests log at DEBUG.
Expected client noise (401/403/404/405) also logs at DEBUG – it is produced
by background polling of expired sessions and by random internet bot scans,
so it would otherwise drown out real signal at every visible level.
Other 4xx (400, 409, 422, ...) at WARNING – those usually indicate real bugs.
Server errors (5xx) at ERROR.
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
        elif status in (401, 403, 404, 405):
            # Expected polling / bot-scan noise – DEBUG only.
            logger.debug(msg)
        elif status >= 400:
            logger.warning(msg)
        else:
            logger.debug(msg)

        return response
