"""Live BTC price with a short in-memory cache.

CoinGecko's public endpoint is rate limited, so every call to the API would
throttle under demo load. The cache also keeps the price stable within a single
transaction lifecycle, which matters because the reward calculation and the
receipt shown to the user must agree.

Three rules govern what happens when the price cannot be fetched:

1. Try a second provider before giving up. CoinGecko throttles shared cloud
   egress IPs (which is what a free Render instance has) far more often than it
   throttles a laptop, so a single provider is a single point of failure.
2. After a failed attempt, wait before trying again. The original code retried
   on every call once the cache had expired, so an outage put a 6-second
   network timeout on every request that needed a price.
3. Say how old the price is. Every result carries its `source` and age, and
   `price_for_reward` refuses to pay a reward against a price that was never
   fetched (the configured fallback) or is older than the configured limit -
   in production. A reward is value; paying it at an invented price is worse
   than declining the transaction.
"""
import logging
import time

import requests
from fastapi import HTTPException, status

from app.config import settings
from app.reward_engine import SATS_PER_BTC

log = logging.getLogger("bitback.price")

COINGECKO = "https://api.coingecko.com/api/v3/simple/price"
COINBASE = "https://api.coinbase.com/v2/prices/BTC-USD/spot"
REQUEST_TIMEOUT = 4
RETRY_BACKOFF_SECONDS = 30

_cache: dict = {
    "price": None, "change_24h": 0.0,
    "fetched_at": 0.0,        # last successful live fetch
    "attempted_at": 0.0,      # last attempt, successful or not
    "source": None,           # "coingecko" | "coinbase" | "fallback"
}


def _from_coingecko() -> tuple[float, float]:
    r = requests.get(
        COINGECKO,
        params={"ids": "bitcoin", "vs_currencies": "usd", "include_24hr_change": "true"},
        timeout=REQUEST_TIMEOUT,
    )
    r.raise_for_status()
    data = r.json()["bitcoin"]
    return float(data["usd"]), round(float(data.get("usd_24h_change", 0.0)), 2)


def _from_coinbase() -> tuple[float, float]:
    """Spot price only. Coinbase's spot endpoint has no 24h change, so the
    previous value is kept rather than reporting a false 0%."""
    r = requests.get(COINBASE, timeout=REQUEST_TIMEOUT)
    r.raise_for_status()
    return float(r.json()["data"]["amount"]), _cache["change_24h"]


PROVIDERS = [("coingecko", _from_coingecko), ("coinbase", _from_coinbase)]


def _refresh(now: float) -> None:
    _cache["attempted_at"] = now
    for name, fetch in PROVIDERS:
        try:
            price, change = fetch()
        except Exception as exc:  # network, HTTP status, or an unexpected body
            log.warning("price provider %s failed: %s", name, exc)
            continue
        if price > 0:
            _cache.update(price=price, change_24h=change, fetched_at=now, source=name)
            return
    if _cache["price"] is None:
        # Nothing has ever been fetched. Keep the app usable for development,
        # but mark it so nothing of value is paid against it in production.
        _cache.update(price=settings.btc_price_fallback_usd, change_24h=0.0,
                      source="fallback")


def _snapshot(now: float, cached: bool) -> dict:
    age = int(now - _cache["fetched_at"]) if _cache["fetched_at"] else None
    stale = (_cache["source"] == "fallback" or age is None
             or age > settings.btc_price_max_age_seconds)
    return {"price": _cache["price"], "change_24h": _cache["change_24h"], "cached": cached,
            "source": _cache["source"], "age_seconds": age, "stale": stale}


def get_btc_price(force: bool = False) -> dict:
    now = time.time()
    fresh = (_cache["price"] is not None and _cache["source"] != "fallback"
             and now - _cache["fetched_at"] < settings.btc_price_cache_seconds)
    if fresh and not force:
        return _snapshot(now, cached=True)
    if force or now - _cache["attempted_at"] >= RETRY_BACKOFF_SECONDS:
        _refresh(now)
    return _snapshot(now, cached=False)


def price_for_reward() -> float:
    """The price to value a reward at, or 503 if there is no trustworthy one.

    Development allows the fallback so the app runs offline; production does
    not, because a reward paid at an invented price is a wrong payment.
    """
    snap = get_btc_price()
    if snap["stale"] and settings.environment == "production":
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "We can't get a live bitcoin price right now, so we can't work out your "
            "reward. Try again in a minute.",
        )
    return snap["price"]


def sats_to_usd(sats: int, price: float | None = None) -> float:
    price = price or get_btc_price()["price"]
    return round((int(sats) / SATS_PER_BTC) * price, 2)


def set_cached_price(price: float, change_24h: float = 0.0) -> None:
    """Test hook: pin the price so reward assertions are deterministic."""
    now = time.time()
    _cache.update(price=price, change_24h=change_24h, fetched_at=now, attempted_at=now,
                  source="coingecko")


def reset() -> None:
    """Test hook: forget everything, as a freshly started process would."""
    _cache.update(price=None, change_24h=0.0, fetched_at=0.0, attempted_at=0.0, source=None)
