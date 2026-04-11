"""
Simple TTL cache for expensive system calls.

Avoids re-computing stats on every frontend poll (every 15-30s).
Thread-safe via a simple lock.
"""

import threading
import time
from typing import Any, Callable

_cache: dict[str, tuple[float, Any]] = {}
_lock = threading.Lock()


def cached(key: str, ttl: float, fn: Callable[[], Any]) -> Any:
    """Return cached value if fresh, otherwise call fn() and cache result."""
    now = time.monotonic()
    with _lock:
        if key in _cache:
            ts, val = _cache[key]
            if now - ts < ttl:
                return val
    # Compute outside lock to avoid blocking other cache reads
    result = fn()
    with _lock:
        _cache[key] = (time.monotonic(), result)
    return result


def invalidate(key: str) -> None:
    """Remove a specific cache entry."""
    with _lock:
        _cache.pop(key, None)


def invalidate_prefix(prefix: str) -> None:
    """Remove all cache entries starting with prefix."""
    with _lock:
        keys = [k for k in _cache if k.startswith(prefix)]
        for k in keys:
            del _cache[k]


def clear() -> None:
    """Clear entire cache."""
    with _lock:
        _cache.clear()
