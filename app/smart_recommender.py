"""Which category boost to activate, ranked by what the boost is worth.

A boost doubles cashback in one category for 30 days, so its value is the
cashback the cardholder would have earned there anyway: spend x base rate.
The ranking is that quantity over the last 60 days, projected to a month.

The first version ranked by a weighted sum of five normalised factors
(volume 0.30, frequency 0.25, base rate 0.15, trend 0.15, recency 0.15).
A backtest against what each simulated cardholder actually spent in the 30
days after the decision (evaluation/recommender.py) found it picking the best
category less often than simply ranking by expected value. On a held-out
population of 600 it picked the best category 61% of the time against 70%
(paired difference 9.3 points, 95% CI 5.7-13.2). The ablations showed why:
trend and recency changed nothing, frequency made it worse, and adding
volume and rate cannot express that a boost is worth their *product*. The
factors are still computed, because the app uses them to explain the pick.
"""
import math
from collections import defaultdict
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.clock import utcnow
from app.models import CategoryCashback, Transaction

# Reported to the client so the explanation can say what the ranking is.
RANKING = {"expected_boost_value": 1.0}
LOOKBACK_DAYS = 60


def _sigmoid(x: float) -> float:
    return 1 / (1 + math.exp(-max(-60.0, min(60.0, x))))


def _slope(pairs: list[tuple[float, float]]) -> float:
    if len(pairs) < 2:
        return 0.0
    n = len(pairs)
    mx = sum(p[0] for p in pairs) / n
    my = sum(p[1] for p in pairs) / n
    denom = sum((p[0] - mx) ** 2 for p in pairs)
    return sum((p[0] - mx) * (p[1] - my) for p in pairs) / denom if denom else 0.0


def recommend_boost(db: Session, user_id: int, as_of: datetime | None = None) -> dict:
    """Rank categories by how much a boost there is likely to be worth.

    `as_of` lets the recommender be asked what it would have said at a past
    moment, seeing only the history before it - which is how it is backtested
    in evaluation/recommender.py. Omitted, it means now.
    """
    now = as_of or utcnow()
    since = now - timedelta(days=LOOKBACK_DAYS)
    txs = (
        db.query(Transaction)
        .filter(Transaction.user_id == user_id, Transaction.created_at >= since,
                Transaction.created_at < now)
        .all()
    )
    rates = {c.category: c.base_rate for c in db.query(CategoryCashback).all()}

    if len(txs) < 3:
        return {
            "has_enough_data": False,
            "message": "Spend a little more and a recommendation will appear here.",
            "recommendations": [],
            "top_pick": None,
        }

    volume, count, days = defaultdict(float), defaultdict(int), defaultdict(list)
    for t in txs:
        volume[t.category] += t.amount_fiat
        count[t.category] += 1
        days[t.category].append(((now - t.created_at).days, t.amount_fiat))

    max_vol = max(volume.values()) or 1.0
    max_cnt = max(count.values()) or 1
    max_rate = max(rates.values()) if rates else 0.03
    value = {cat: volume[cat] * rates.get(cat, 0.015) for cat in volume}
    total_value = sum(value.values()) or 1.0

    results = []
    for cat in volume:
        v_n = volume[cat] / max_vol
        f_n = count[cat] / max_cnt
        r_n = rates.get(cat, 0.015) / max_rate

        pairs = [(-d, amt) for d, amt in days[cat]]
        slope = _slope(pairs)
        trend_n = _sigmoid(slope / 10)

        newest = min(d for d, _ in days[cat])
        rec_n = math.exp(-newest / 30)

        # Share of all the boostable value in this cardholder's spending.
        score = value[cat] / total_value
        monthly_spend = volume[cat] * (30 / LOOKBACK_DAYS)
        extra_usd = monthly_spend * rates.get(cat, 0.015)

        trend_label = "increasing" if trend_n > 0.58 else "decreasing" if trend_n < 0.42 else "stable"
        recency_label = "recent" if newest <= 7 else "moderate" if newest <= 21 else "inactive"

        results.append({
            "category": cat,
            "score": round(score * 100, 1),
            "predicted_extra_usd": round(extra_usd, 2),
            "monthly_spend": round(monthly_spend, 2),
            "transaction_count": count[cat],
            "base_rate": rates.get(cat, 0.015),
            "trend": trend_label,
            "recency": recency_label,
            "explanation": (
                f"You spent ${volume[cat]:,.0f} across {count[cat]} "
                f"{'transaction' if count[cat] == 1 else 'transactions'} here in the last "
                f"{LOOKBACK_DAYS} days. Spending is {trend_label} and activity is {recency_label}."
            ),
            "factors": {
                "spend_volume": round(v_n, 3), "frequency": round(f_n, 3),
                "base_rate": round(r_n, 3), "trend": round(trend_n, 3), "recency": round(rec_n, 3),
            },
        })

    # Ranked by the unrounded value; the category name breaks exact ties so
    # the order never depends on database row order.
    results.sort(key=lambda r: (-value[r["category"]], r["category"]))
    return {
        "has_enough_data": True,
        "recommendations": results,
        "top_pick": results[0],
        "weights": RANKING,
    }
