"""Fixed-window rate limiting.

In-process and therefore per-worker: running `uvicorn --workers 4` gives a
caller four times the limit. That is acceptable for a prototype but is the
reason production deployments put this in Redis, where the counter is shared.

The bucket store is swept on write so idle keys are reclaimed. The original
implementation trimmed timestamps within a key but never removed the key
itself, so the dict grew by one entry per distinct client IP for the lifetime
of the process.
"""
import time
from collections import defaultdict

from fastapi import HTTPException, Request, status

_hits: dict[str, list[float]] = defaultdict(list)
_last_sweep = 0.0
SWEEP_INTERVAL = 300


def _sweep(now: float, window: int) -> None:
    """Drop keys whose most recent hit has aged out of the window."""
    global _last_sweep
    if now - _last_sweep < SWEEP_INTERVAL:
        return
    _last_sweep = now
    for key in [k for k, v in _hits.items() if not v or now - v[-1] >= window]:
        del _hits[key]


def rate_limit(key: str, limit: int, window: int = 60) -> None:
    now = time.time()
    _sweep(now, window)
    _hits[key] = [t for t in _hits[key] if now - t < window]
    if len(_hits[key]) >= limit:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "Too many attempts. Wait a minute and try again.",
        )
    _hits[key].append(now)


def client_ip(request: Request) -> str:
    """Client address, honouring one layer of reverse proxy.

    Behind a proxy `request.client.host` is the proxy, which would rate limit
    every user as one caller. X-Forwarded-For is client-controlled and must not
    be trusted without a proxy in front that overwrites it.
    """
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def reset() -> None:
    """Test hook: clears all buckets."""
    _hits.clear()
