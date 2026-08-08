"""Cashback calculation.

sats = (spend * base_rate / btc_price) * 1e8, then scaled by the user's level
multiplier and any active category boost. Kept pure and free of DB access so it
can be unit tested directly.
"""
import math

SATS_PER_BTC = 100_000_000

LEVELS = [
    {"key": "bronze", "name": "Bronze", "icon": "award", "min_sats": 0, "multiplier": 1.0},
    {"key": "silver", "name": "Silver", "icon": "award", "min_sats": 10_000, "multiplier": 1.1},
    {"key": "gold", "name": "Gold", "icon": "award", "min_sats": 50_000, "multiplier": 1.2},
    {"key": "platinum", "name": "Platinum", "icon": "gem", "min_sats": 200_000, "multiplier": 1.3},
    {"key": "diamond", "name": "Diamond", "icon": "crown", "min_sats": 1_000_000, "multiplier": 1.5},
]

DEFAULT_RATES = {
    "dining": 0.03, "transport": 0.015, "shopping": 0.02, "entertainment": 0.02,
    "groceries": 0.02, "travel": 0.03, "health": 0.015, "education": 0.01,
    "bills": 0.01, "general": 0.015,
}


def get_level(total_sats: int) -> dict:
    current = LEVELS[0]
    for lvl in LEVELS:
        if total_sats >= lvl["min_sats"]:
            current = lvl
    idx = LEVELS.index(current)
    nxt = LEVELS[idx + 1] if idx + 1 < len(LEVELS) else None
    if nxt:
        span = nxt["min_sats"] - current["min_sats"]
        progress = min(1.0, (total_sats - current["min_sats"]) / span) if span else 1.0
        remaining = max(0, nxt["min_sats"] - total_sats)
    else:
        progress, remaining = 1.0, 0
    return {
        **current,
        "next_level": nxt["name"] if nxt else None,
        "next_level_sats": nxt["min_sats"] if nxt else None,
        "progress": round(progress, 4),
        "sats_to_next": remaining,
    }


def calculate_reward(
    amount_fiat: float,
    category: str,
    btc_price: float,
    base_rate: float | None = None,
    user_level_multiplier: float = 1.0,
    boost_multiplier: float = 1.0,
) -> dict:
    rate = base_rate if base_rate is not None else DEFAULT_RATES.get(category, 0.015)
    base_sats = (amount_fiat * rate / btc_price) * SATS_PER_BTC
    with_level = base_sats * user_level_multiplier
    total = with_level * boost_multiplier

    base_i = int(round(base_sats))
    total_i = int(round(total))
    level_bonus = int(round(with_level - base_sats))
    boost_bonus = total_i - base_i - level_bonus
    effective = rate * user_level_multiplier * boost_multiplier

    return {
        "base_sats": base_i,
        "level_bonus": level_bonus,
        "boost_bonus": boost_bonus,
        "total_sats": total_i,
        "cashback_rate": rate,
        "effective_rate": round(effective, 5),
        "level_multiplier": user_level_multiplier,
        "boost_multiplier": boost_multiplier,
        "usd_value": round((total_i / SATS_PER_BTC) * btc_price, 4),
    }


def round_up_sats(amount_fiat: float, multiplier: float, btc_price: float) -> tuple[float, int]:
    """Spare change to the next dollar, scaled, converted to sats."""
    spare = math.ceil(amount_fiat) - amount_fiat
    if spare <= 0:
        return 0.0, 0
    spare *= multiplier
    return round(spare, 2), int(round((spare / btc_price) * SATS_PER_BTC))
