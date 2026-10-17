"""Backtest of the boost recommender against what actually happened next.

A boost doubles cashback in one category for 30 days, so the right boost is
knowable in hindsight: the category that would have paid the most extra sats
over the following 30 days. The recommender only ever sees the 60 days before
the decision (`as_of`), so it can be scored against that hindsight optimum -
the "oracle" - for every simulated cardholder.

Two scores per method:

  hit rate  - how often its top pick was the oracle's pick.
  capture   - the share of the oracle's extra sats its pick actually earned.
              A near-miss (second-best category) still captures most of the
              value, so capture is the number a cardholder would feel; hit
              rate is the stricter one.

History of this suite, because it changed the product: the first shipped
ranking (v1, reproduced below as `v1_rank`) was a weighted sum of five
factors. On a validation population (seed 101) it lost to the simplest rule
here - boost whatever earned the most in the last 60 days, which is exactly
the quantity a boost multiplies - so the app now ranks by that expected value.
Both are reported on a separate test population (the default seed), along
with v1's ablations, so the before/after comparison is not scored on the
draw that motivated it.

Three populations, because each factor is only useful in some of them:

  stable    - habits do not change; the past 60 days are the best guide.
  drifting  - each cardholder's category mix moves gradually towards a new one.
  emerging  - one category (often a new one) grows sharply - a new hobby,
              a move, a trip being booked. The trend and recency factors exist
              for this case.

Limits, stated rather than hidden: spending is generated, not observed, and a
cardholder who changes behaviour *because* of a boost is not modelled.
"""
import random
from collections import defaultdict
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app import smart_recommender
from app.auth import hash_password
from app.models import CategoryCashback, Transaction, User
from app.reward_engine import DEFAULT_RATES
from evaluation.stats import summary

CATEGORIES = list(DEFAULT_RATES)
AMOUNTS = {
    "dining": (8, 45), "transport": (3, 30), "shopping": (20, 120),
    "entertainment": (10, 40), "groceries": (25, 120), "travel": (60, 400),
    "health": (15, 80), "education": (20, 150), "bills": (40, 200), "general": (5, 60),
}
HISTORY_DAYS = 60          # what the recommender may see (its LOOKBACK_DAYS)
FUTURE_DAYS = 30           # the boost's lifetime, over which the oracle is scored
POPULATIONS = ("stable", "drifting", "emerging")
START = datetime(2026, 1, 1)

# The first shipped ranking (v1): five normalised factors added with fixed
# weights. Reproduced here verbatim so the before/after comparison stays
# runnable after the app moved to ranking by expected boost value; the check
# in tests/test_evaluation.py pins it to the original behaviour.
V1_WEIGHTS = {"spend_volume": 0.30, "frequency": 0.25, "base_rate": 0.15,
              "trend": 0.15, "recency": 0.15}


def _v1_slope(pairs: list[tuple[float, float]]) -> float:
    if len(pairs) < 2:
        return 0.0
    n = len(pairs)
    mx = sum(p[0] for p in pairs) / n
    my = sum(p[1] for p in pairs) / n
    denom = sum((p[0] - mx) ** 2 for p in pairs)
    return sum((p[0] - mx) * (p[1] - my) for p in pairs) / denom if denom else 0.0


def v1_rank(history: list[Transaction], as_of: datetime, weights: dict | None = None) -> list[str]:
    """Categories in the order the v1 weighted score ranked them."""
    import math
    w = weights or V1_WEIGHTS
    volume, count, days = defaultdict(float), defaultdict(int), defaultdict(list)
    for t in history:
        volume[t.category] += t.amount_fiat
        count[t.category] += 1
        days[t.category].append(((as_of - t.created_at).days, t.amount_fiat))
    if not volume:
        return []
    max_vol, max_cnt = max(volume.values()) or 1.0, max(count.values()) or 1
    max_rate = max(DEFAULT_RATES.values())
    scored = []
    for cat in volume:
        trend = 1 / (1 + math.exp(-max(-60.0, min(60.0, _v1_slope([(-d, a) for d, a in days[cat]]) / 10))))
        recency = math.exp(-min(d for d, _ in days[cat]) / 30)
        score = (w["spend_volume"] * volume[cat] / max_vol + w["frequency"] * count[cat] / max_cnt
                 + w["base_rate"] * DEFAULT_RATES[cat] / max_rate + w["trend"] * trend
                 + w["recency"] * recency)
        scored.append((round(score * 100, 1), cat))   # the app sorted the rounded score
    # Python's sort is stable and the app iterated categories in first-seen
    # order, so ties resolve the same way here.
    return [c for _, c in sorted(scored, key=lambda x: x[0], reverse=True)]


# Each factor removed in turn (its weight shared out proportionally among the
# rest), plus volume alone. Shows whether each factor helps, hurts or is idle.
FACTORS = ("spend_volume", "frequency", "base_rate", "trend", "recency")


def _without(factor: str) -> dict:
    rest = {k: v for k, v in V1_WEIGHTS.items() if k != factor}
    total = sum(rest.values())
    return {**{k: v / total for k, v in rest.items()}, factor: 0.0}


ABLATIONS = {f"without_{f}": _without(f) for f in FACTORS}
ABLATIONS["volume_only"] = {f: (1.0 if f == "spend_volume" else 0.0) for f in FACTORS}


def _dirichlet(rng: random.Random, keys: list[str], alpha: float = 1.0) -> dict[str, float]:
    draws = {k: rng.gammavariate(alpha, 1.0) for k in keys}
    total = sum(draws.values())
    return {k: v / total for k, v in draws.items()}


def _habits(rng: random.Random, population: str) -> tuple[dict, dict]:
    """Start and end category mixes for one cardholder."""
    used = rng.sample(CATEGORIES, rng.randint(4, 7))
    start = _dirichlet(rng, used)
    if population == "stable":
        return start, start
    if population == "drifting":
        return start, _dirichlet(rng, used)
    # emerging: a category that is minor or unused today becomes 40% of spend.
    minor = sorted(used, key=start.get)[:2]
    unused = [c for c in CATEGORIES if c not in used]
    rising = rng.choice(unused if unused and rng.random() < 0.5 else minor)
    end = {c: 0.6 * start.get(c, 0.0) for c in set(start) | {rising}}
    end[rising] += 0.4
    return start, end


def _simulate(db: Session, rng: random.Random, population: str, idx: int) -> tuple[int, dict]:
    """Insert one cardholder; return (user id, future value per category)."""
    user = User(email=f"rec-{population}-{idx}@evaluation.local",
                password_hash=hash_password("evaluation-only"),
                display_name="Evaluation Subject", created_at=START)
    db.add(user)
    db.flush()

    start, end = _habits(rng, population)
    cats = sorted(set(start) | set(end))
    total_days = HISTORY_DAYS + FUTURE_DAYS
    future_value: dict[str, float] = defaultdict(float)
    rows = []
    for day in range(total_days):
        t = day / (total_days - 1)
        weights = [start.get(c, 0.0) + (end.get(c, 0.0) - start.get(c, 0.0)) * t for c in cats]
        for _ in range(rng.choices([0, 1, 2, 3], weights=[20, 40, 28, 12])[0]):
            cat = rng.choices(cats, weights=weights)[0]
            amount = round(rng.uniform(*AMOUNTS[cat]), 2)
            when = START + timedelta(days=day, hours=rng.randint(8, 21), minutes=rng.randint(0, 59))
            rows.append(Transaction(user_id=user.id, amount_fiat=amount, category=cat,
                                    merchant=f"{cat}-{rng.randint(1, 5)}",
                                    btc_price_at_time=60_000.0, sats_earned=0, created_at=when))
            if day >= HISTORY_DAYS:
                # A boost adds one extra multiple of the base reward, so the
                # value of boosting a category is proportional to amount x rate.
                future_value[cat] += amount * DEFAULT_RATES[cat]
    db.add_all(rows)
    db.commit()
    return user.id, dict(future_value)


def _history(db: Session, user_id: int, as_of: datetime, days: int) -> list[Transaction]:
    return (db.query(Transaction)
            .filter(Transaction.user_id == user_id,
                    Transaction.created_at >= as_of - timedelta(days=days),
                    Transaction.created_at < as_of)
            .all())


def _argmax(scores: dict[str, float]) -> str | None:
    return max(sorted(scores), key=scores.get) if scores else None


# Candidate replacement: the boost's expected value, with older spending
# discounted exponentially. Half-life is chosen on a validation population and
# reported on a separate test population, never both on the same draw.
HALF_LIVES = (10, 20, 30, 45)


def _decayed_value(history: list[Transaction], as_of: datetime, half_life: float) -> dict:
    value: dict[str, float] = defaultdict(float)
    for t in history:
        age = (as_of - t.created_at).total_seconds() / 86_400
        value[t.category] += t.amount_fiat * DEFAULT_RATES[t.category] * 0.5 ** (age / half_life)
    return value


def _baselines(history: list[Transaction], recent: list[Transaction],
               as_of: datetime) -> dict[str, str | None]:
    value, spend, count, recent_value = (defaultdict(float) for _ in range(4))
    for t in history:
        value[t.category] += t.amount_fiat * DEFAULT_RATES[t.category]
        spend[t.category] += t.amount_fiat
        count[t.category] += 1
    for t in recent:
        recent_value[t.category] += t.amount_fiat * DEFAULT_RATES[t.category]
    picks = {
        "top_value_60d": _argmax(value),        # what a boost multiplies, over the window
        "top_value_30d": _argmax(recent_value),  # the same, recency-weighted by truncation
        "top_spend_60d": _argmax(spend),         # ignores that rates differ by category
        "most_frequent_60d": _argmax(count),
    }
    for hl in HALF_LIVES:
        picks[f"decayed_value_hl{hl}"] = _argmax(_decayed_value(history, as_of, hl))
    return picks


def evaluate(db: Session, *, users_per_population: int = 200, seed: int = 2027) -> dict:
    rng = random.Random(seed)
    db.add_all([CategoryCashback(category=c, base_rate=r, icon="x", description=c)
                for c, r in DEFAULT_RATES.items()])
    db.commit()
    as_of = START + timedelta(days=HISTORY_DAYS)

    # outcomes[method][population] -> list of (hit, capture)
    outcomes: dict[str, dict[str, list[tuple[float, float]]]] = defaultdict(lambda: defaultdict(list))
    top3: dict[str, list[float]] = defaultdict(list)
    v1_top3: dict[str, list[float]] = defaultdict(list)

    def score(method: str, population: str, pick: str | None, value: dict, oracle: str) -> None:
        got = value.get(pick, 0.0) if pick else 0.0
        outcomes[method][population].append((float(pick == oracle), got / value[oracle]))

    for population in POPULATIONS:
        for i in range(users_per_population):
            user_id, value = _simulate(db, rng, population, i)
            if not value or max(value.values()) <= 0:
                continue
            oracle = _argmax(value)

            shipped = smart_recommender.recommend_boost(db, user_id, as_of=as_of)
            if not shipped["has_enough_data"]:
                continue
            ranked = [r["category"] for r in shipped["recommendations"]]
            score("shipped", population, ranked[0], value, oracle)
            top3[population].append(float(oracle in ranked[:3]))

            history = _history(db, user_id, as_of, HISTORY_DAYS)
            recent = _history(db, user_id, as_of, 30)
            for name, pick in _baselines(history, recent, as_of).items():
                score(name, population, pick, value, oracle)

            # Random choice among categories the cardholder has used: scored
            # by its expectation rather than one noisy draw.
            used = sorted({t.category for t in history})
            outcomes["random_used_category"][population].append((
                sum(c == oracle for c in used) / len(used),
                sum(value.get(c, 0.0) for c in used) / len(used) / value[oracle],
            ))

            v1 = v1_rank(history, as_of)
            score("v1_weighted_score", population, v1[0], value, oracle)
            v1_top3[population].append(float(oracle in v1[:3]))
            for name, weights in ABLATIONS.items():
                score(f"v1_{name}", population, v1_rank(history, as_of, weights)[0], value, oracle)

    def collect(rows: list[tuple[float, float]], s: int) -> dict:
        return {"hit_rate": summary([h for h, _ in rows], seed=s),
                "value_captured": summary([c for _, c in rows], seed=s)}

    # Paired against the shipped recommender on the same cardholders: far
    # tighter than comparing two independent intervals, because most of the
    # variation is between cardholders, not between methods.
    def flat(method: str) -> list[tuple[float, float]]:
        return [r for pop in POPULATIONS for r in outcomes[method][pop]]

    base = flat("shipped")
    paired = {}
    for method in outcomes:
        if method == "shipped":
            continue
        rows = flat(method)
        paired[method] = {
            "hit_rate_minus_shipped": summary([a[0] - b[0] for a, b in zip(rows, base, strict=True)], seed=seed),
            "capture_minus_shipped": summary([a[1] - b[1] for a, b in zip(rows, base, strict=True)], seed=seed),
        }

    methods = {}
    for method, by_pop in outcomes.items():
        everyone = [r for rows in by_pop.values() for r in rows]
        methods[method] = {
            "all": collect(everyone, seed),
            **{pop: collect(rows, seed) for pop, rows in by_pop.items()},
        }

    return {
        "design": {
            "populations": list(POPULATIONS), "users_per_population": users_per_population,
            "history_days": HISTORY_DAYS, "boost_days": FUTURE_DAYS, "seed": seed,
            "oracle": "category with the most amount x base_rate over the 30 days after the decision",
        },
        "methods": methods,
        "paired_vs_shipped": paired,
        "oracle_in_top3": {
            "shipped": {pop: summary(v, seed=seed) for pop, v in top3.items()},
            "v1_weighted_score": {pop: summary(v, seed=seed) for pop, v in v1_top3.items()},
        },
        "shipped_ranking": dict(smart_recommender.RANKING),
        "v1_weights": V1_WEIGHTS,
    }
