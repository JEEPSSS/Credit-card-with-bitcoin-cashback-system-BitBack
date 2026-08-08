"""Live BTC price with a 60-second in-memory cache.

CoinGecko's public endpoint is rate limited, so every call to the API would
throttle under demo load. The cache also keeps the price stable within a single
transaction lifecycle, which matters because the reward calculation and the
receipt shown to the user must agree.
"""
import time
import requests

COINGECKO = "https://api.coingecko.com/api/v3/simple/price"
CACHE_TTL = 60
FALLBACK_PRICE = 65000.0

_cache: dict = {"price": None, "change_24h": 0.0, "timestamp": 0.0}


def get_btc_price(force: bool = False) -> dict:
    now = time.time()
    if not force and _cache["price"] and now - _cache["timestamp"] < CACHE_TTL:
        return {"price": _cache["price"], "change_24h": _cache["change_24h"], "cached": True}
    try:
        r = requests.get(
            COINGECKO,
            params={
                "ids": "bitcoin",
                "vs_currencies": "usd",
                "include_24hr_change": "true",
            },
            timeout=6,
        )
        r.raise_for_status()
        data = r.json()["bitcoin"]
        _cache.update(
            price=float(data["usd"]),
            change_24h=round(float(data.get("usd_24h_change", 0.0)), 2),
            timestamp=now,
        )
    except Exception:
        # Degrade to the last good price rather than failing the transaction.
        if _cache["price"] is None:
            _cache.update(price=FALLBACK_PRICE, change_24h=0.0, timestamp=now)
    return {"price": _cache["price"], "change_24h": _cache["change_24h"], "cached": False}


def sats_to_usd(sats: int, price: float | None = None) -> float:
    price = price or get_btc_price()["price"]
    return round((sats / 100_000_000) * price, 2)
