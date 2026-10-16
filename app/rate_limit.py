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

from app.config import settings

_hits: dict[str, list[float]] = defaultdict(list)
_windows: dict[str, int] = {}
_last_sweep = 0.0
SWEEP_INTERVAL = 300


def _sweep(now: float) -> None:
    """Drop keys whose most recent hit has aged out of *that key's* window.

    The sweep used to apply the window of whichever call happened to trigger
    it. A one-minute login check could then delete a signup key that was
    still inside its one-hour window, quietly resetting the signup limit.
    """
    global _last_sweep
    if now - _last_sweep < SWEEP_INTERVAL:
        return
    _last_sweep = now
    expired = [k for k, v in _hits.items() if not v or now - v[-1] >= _windows.get(k, 0)]
    for key in expired:
        del _hits[key]
        _windows.pop(key, None)


def rate_limit(key: str, limit: int, window: int = 60) -> None:
    now = time.time()
    _sweep(now)
    _windows[key] = window
    _hits[key] = [t for t in _hits[key] if now - t < window]
    if len(_hits[key]) >= limit:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "Too many attempts. Wait a minute and try again.",
        )
    _hits[key].append(now)


def client_ip(request: Request) -> str:
    """The caller's address, from the source `settings.client_ip_source` names.

    Behind a proxy `request.client.host` is the proxy, which would rate limit
    every user as one caller. The forwarding headers fix that, but differ in
    how far they can be trusted: X-Forwarded-For is appended to, not reset, by
    Render's edge, so a client can put any value it likes in the first slot and
    get a fresh bucket per request. CF-Connecting-IP is overwritten by
    Cloudflare. Which one is correct depends on the deployment, so it is
    configuration rather than a guess baked in here.
    """
    source = settings.client_ip_source
    if source == "cf-connecting-ip":
        value = request.headers.get("cf-connecting-ip")
        if value:
            return value.strip()
    elif source == "x-forwarded-for":
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def reset() -> None:
    """Test hook: clears all buckets."""
    global _last_sweep
    _hits.clear()
    _windows.clear()
    _last_sweep = 0.0
