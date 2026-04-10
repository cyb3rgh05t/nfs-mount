"""
Request / response logging middleware.

Logs API requests with method, path, status, duration, and user info.
Polling endpoints (status checks every 5 s) are logged at DEBUG to reduce noise.
"""

import logging
import time

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger("nfs-manager.middleware")

# Paths polled frequently by the frontend — log only at DEBUG
_POLLING_PATHS: set[str] = {
    "/api/system/health",
    "/api/system/status",
    "/api/system/stats",
    "/api/nfs/status",
    "/api/nfs/exports",
    "/api/nfs/exports-status",
    "/api/nfs/exports-system",
    "/api/mergerfs/status",
    "/api/vpn/status",
    "/api/firewall/status",
    "/api/system/kernel-params",
    "/api/system/rps-xps",
    "/api/server-monitor/metrics",
}


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

        # Polling GETs → DEBUG only
        is_polling = method == "GET" and path in _POLLING_PATHS

        if status >= 500:
            logger.error(msg)
        elif status >= 400:
            logger.warning(msg)
        elif is_polling:
            logger.debug(msg)
        else:
            logger.info(msg)

        return response
        else:
            logger.info(msg)

        return response
