"""Property checks of the reward engine over random purchases.

The reward engine is arithmetic, so it is evaluated against properties that
must hold for every input rather than against a dataset: each property is
checked on a large random sample of purchases spanning one cent to the $1M
purchase cap, bitcoin at $10k-$500k, every category rate, level and boost.
A property that holds on all of them is strong evidence; one counterexample
is a bug.

"Exact" means computed with Python's Decimal at 50 significant digits,
independent of the floating-point path the engine uses.

The first run of this suite found two, both since fixed:

  * the breakdown shown on the purchase screen (base / level bonus / boost
    bonus) rounded each part separately, so rounding error leaked into the
    last part - a "+1 sat boost" on receipts with no boost;
  * the round-up's spare change showed the wrong cent at half-cent ties.

`v1_breakdown` and `v1_round_up_usd` reproduce the original formulas so the
before/after counts come from the same inputs.
"""
import math
import random
from decimal import ROUND_HALF_UP, Decimal, getcontext

from app.reward_engine import (
    DEFAULT_RATES,
    LEVELS,
    SATS_PER_BTC,
    calculate_reward,
    get_level,
    round_up_sats,
)

getcontext().prec = 50
RATES = sorted(set(DEFAULT_RATES.values()))
MULTIPLIERS = [lvl["multiplier"] for lvl in LEVELS]
TYPICAL_PRICE = 60_000.0


def _purchase(rng: random.Random) -> tuple[float, float, float, float, float]:
    amount = max(0.01, round(10 ** rng.uniform(-2, 6), 2))       # $0.01 - $1M
    price = 10 ** rng.uniform(4, math.log10(500_000))            # $10k - $500k
    return (amount, price, rng.choice(RATES), rng.choice(MULTIPLIERS),
            rng.choice([1.0, 2.0]))


def v1_breakdown(amount, price, rate, level, boost) -> tuple[int, int, int, int]:
    """The original breakdown: each part rounded on its own."""
    base = amount * rate / price * SATS_PER_BTC
    with_level = base * level
    total = with_level * boost
    base_i, total_i = int(round(base)), int(round(total))
    level_bonus = int(round(with_level - base))
    return base_i, level_bonus, total_i - base_i - level_bonus, total_i


def _exact_sats(amount, price, rate, level, boost) -> Decimal:
    return (Decimal(str(amount)) * Decimal(str(rate)) / Decimal(repr(price))
            * SATS_PER_BTC * Decimal(str(level)) * Decimal(str(boost)))


def _breakdown_violations(parts, level, boost) -> dict[str, bool]:
    base, level_bonus, boost_bonus, total = parts
    return {
        "parts_do_not_sum_to_total": base + level_bonus + boost_bonus != total,
        "negative_part": level_bonus < 0 or boost_bonus < 0,
        "boost_bonus_without_a_boost": boost == 1.0 and boost_bonus != 0,
        "level_bonus_at_base_level": level == 1.0 and level_bonus != 0,
    }


def evaluate(_db=None, *, purchases: int = 200_000, seed: int = 31) -> dict:
    rng = random.Random(seed)
    counts = {"current": {}, "v1": {}}
    for k in ("parts_do_not_sum_to_total", "negative_part", "boost_bonus_without_a_boost",
              "level_bonus_at_base_level"):
        counts["current"][k] = counts["v1"][k] = 0
    no_boost = 0
    total_off_by_more_than_half = 0
    max_abs_error = Decimal(0)
    loss_by_size: dict[str, list[float]] = {"<$1": [], "$1-10": [], "$10-100": [], ">=$100": []}
    effective_rate_mismatch = 0

    for _ in range(purchases):
        amount, price, rate, level, boost = _purchase(rng)
        no_boost += boost == 1.0
        r = calculate_reward(amount, "general", price, rate, level, boost)
        current = (r["base_sats"], r["level_bonus"], r["boost_bonus"], r["total_sats"])
        for name, hit in _breakdown_violations(current, level, boost).items():
            counts["current"][name] += hit
        for name, hit in _breakdown_violations(v1_breakdown(amount, price, rate, level, boost),
                                                level, boost).items():
            counts["v1"][name] += hit

        exact = _exact_sats(amount, price, rate, level, boost)
        error = abs(Decimal(r["total_sats"]) - exact)
        max_abs_error = max(max_abs_error, error)
        total_off_by_more_than_half += error > Decimal("0.5000001")
        if exact > 0:
            # Share of the promised reward lost to whole-sat rounding.
            loss = float(max(Decimal(0), exact - r["total_sats"]) / exact)
            bucket = ("<$1" if amount < 1 else "$1-10" if amount < 10
                      else "$10-100" if amount < 100 else ">=$100")
            loss_by_size[bucket].append(loss)
        effective_rate_mismatch += not math.isclose(
            r["effective_rate"], round(rate * level * boost, 5), abs_tol=1e-9)

    return {
        "design": {"purchases": purchases, "seed": seed, "amount_usd": "0.01 - 1,000,000 (log-uniform)",
                   "btc_price_usd": "10,000 - 500,000 (log-uniform)", "rates": RATES,
                   "level_multipliers": MULTIPLIERS, "boost_multipliers": [1.0, 2.0]},
        "breakdown_violations": {
            "current": counts["current"],
            "v1_before_fix": counts["v1"],
            "purchases_without_a_boost": no_boost,
        },
        "total_vs_exact": {
            "max_abs_error_sats": float(round(max_abs_error, 6)),
            "cases_off_by_more_than_half_a_sat": total_off_by_more_than_half,
        },
        "reward_lost_to_rounding": {
            bucket: {"purchases": len(v),
                     "mean_pct": round(100 * sum(v) / len(v), 4) if v else None,
                     "max_pct": round(100 * max(v), 2) if v else None}
            for bucket, v in loss_by_size.items()
        },
        "smallest_purchase_earning_a_sat": _smallest_earning_purchase(),
        "effective_rate_field_mismatches": effective_rate_mismatch,
        "monotonicity": _monotonicity(rng, purchases // 4),
        "levels": _levels(),
        "round_up": _round_up(rng, purchases // 4),
    }


def _smallest_earning_purchase() -> dict:
    """At a typical price, the cheapest purchase that earns at least 1 sat."""
    out = {}
    for rate in RATES:
        cents = 1
        while calculate_reward(cents / 100, "general", TYPICAL_PRICE, rate)["total_sats"] < 1:
            cents += 1
        out[f"rate_{rate}"] = cents / 100
    return {"btc_price_usd": TYPICAL_PRICE, "usd": out}


def _monotonicity(rng: random.Random, n: int) -> dict:
    """More spend never earns fewer sats; a higher price never earns more."""
    more_spend_fewer_sats = higher_price_more_sats = higher_level_fewer_sats = 0
    for _ in range(n):
        amount, price, rate, level, boost = _purchase(rng)
        base = calculate_reward(amount, "general", price, rate, level, boost)["total_sats"]
        bigger = calculate_reward(amount + rng.choice([0.01, 1.0, 10.0]), "general", price,
                                  rate, level, boost)["total_sats"]
        dearer = calculate_reward(amount, "general", price * rng.uniform(1.0, 2.0), rate,
                                  level, boost)["total_sats"]
        idx = MULTIPLIERS.index(level)
        if idx + 1 < len(MULTIPLIERS):
            higher = calculate_reward(amount, "general", price, rate, MULTIPLIERS[idx + 1],
                                      boost)["total_sats"]
            higher_level_fewer_sats += higher < base
        more_spend_fewer_sats += bigger < base
        higher_price_more_sats += dearer > base
    return {"checked": n, "more_spend_fewer_sats": more_spend_fewer_sats,
            "higher_price_more_sats": higher_price_more_sats,
            "higher_level_fewer_sats": higher_level_fewer_sats}


def _levels() -> dict:
    """Every boundary, either side of it, and progress always within [0, 1]."""
    problems = []
    for i, lvl in enumerate(LEVELS):
        at = get_level(lvl["min_sats"])
        if at["key"] != lvl["key"]:
            problems.append(f"{lvl['min_sats']} sats should be {lvl['key']}, got {at['key']}")
        if i and get_level(lvl["min_sats"] - 1)["key"] != LEVELS[i - 1]["key"]:
            problems.append(f"{lvl['min_sats'] - 1} sats should still be {LEVELS[i - 1]['key']}")
    for sats in range(0, 2_000_001, 997):
        p = get_level(sats)["progress"]
        if not 0.0 <= p <= 1.0:
            problems.append(f"progress {p} at {sats} sats")
    return {"boundaries_checked": len(LEVELS), "problems": problems}


def v1_round_up_usd(amount: float, multiplier: float) -> float:
    """The original spare-change figure: float arithmetic, then round()."""
    spare = math.ceil(amount) - amount
    return round(spare * multiplier, 2) if spare > 0 else 0.0


def _round_up(rng: random.Random, n: int) -> dict:
    """Spare change matches exact decimal arithmetic (half-up) for 2-decimal amounts."""
    mismatches = v1_mismatches = whole_dollar_nonzero = 0
    for _ in range(n):
        cents = rng.randint(1, 100_000_00)
        amount = cents / 100
        multiplier = rng.choice([1.0, 1.5, 2.0, 3.0])
        spare, _ = round_up_sats(amount, multiplier, TYPICAL_PRICE)
        exact = (Decimal(-cents % 100) / 100 * Decimal(str(multiplier))).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP)
        mismatches += Decimal(str(spare)) != exact
        v1_mismatches += Decimal(str(v1_round_up_usd(amount, multiplier))) != exact
        if cents % 100 == 0:
            whole_dollar_nonzero += spare != 0
    return {"checked": n, "spare_change_mismatches_vs_exact": mismatches,
            "v1_before_fix_mismatches": v1_mismatches,
            "whole_dollar_with_spare_change": whole_dollar_nonzero}
