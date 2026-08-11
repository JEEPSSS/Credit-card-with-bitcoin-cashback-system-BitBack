"""Earnings forecast: least-squares trend line ensembled with damped Holt's
linear exponential smoothing, fitted on weekly buckets.

Two choices here are load-bearing and were made after the daily version failed:

Weekly aggregation. Daily sats earned is zero-inflated - a typical user has no
transactions on many days - and fitting exponential smoothing to that series
makes the level estimate chase noise. On the demo account the daily fit produced
a smoothed level of ~50,000 against a true daily mean of ~6,200, and the 30-day
forecast came out roughly ten times the observed rate. Bucketing to calendar
weeks removes the zero inflation and stabilises both components.

Trend damping. Undamped Holt extrapolates the last trend linearly forever, so a
user who happened to spend more last week is projected to keep accelerating.
The damping parameter phi shrinks the trend geometrically over the forecast
horizon, which is the standard remedy (Gardner & McKenzie) and bounds the
forecast at level + trend * phi/(1-phi).
"""
from collections import defaultdict

from sqlalchemy.orm import Session

from app.clock import days_ago
from app.models import RewardEvent

ALPHA = 0.3    # level smoothing
BETA = 0.1     # trend smoothing
PHI = 0.85     # trend damping
LOOKBACK_DAYS = 91          # 13 whole weeks
HORIZON_DAYS = 30
TREND_TOLERANCE = 0.05      # weekly slope, as a share of the weekly mean


def _weekly_series(db: Session, user_id: int) -> tuple[list[float], int]:
    since = days_ago(LOOKBACK_DAYS)
    rows = (
        db.query(RewardEvent)
        .filter(RewardEvent.user_id == user_id, RewardEvent.created_at >= since)
        .all()
    )
    weeks = defaultdict(float)
    active_days = set()
    for r in rows:
        idx = (r.created_at - since).days // 7
        if 0 <= idx < LOOKBACK_DAYS // 7:
            weeks[idx] += r.btc_amount
            active_days.add(r.created_at.date())
    series = [weeks.get(i, 0.0) for i in range(LOOKBACK_DAYS // 7)]

    # Weeks before the user's first reward are not weeks in which they earned
    # nothing, they are weeks in which the account did not exist. Leaving them in
    # makes every new account look like explosive growth: a flat 10,000 sats a
    # week over the three weeks a user has actually been active fits a slope of
    # +824/week once ten empty leading weeks are prepended, and the app tells
    # them their earnings are increasing when they are flat.
    #
    # Interior zeros are kept. A quiet week inside an active history is real
    # signal about that user; a week before they signed up is not.
    first_active = next((i for i, v in enumerate(series) if v > 0), len(series))
    return series[first_active:], len(active_days)


def _linear_regression(y: list[float]) -> dict:
    n = len(y)
    if n < 2:
        return {"slope": 0.0, "intercept": y[0] if y else 0.0, "r2": 0.0}
    xs = list(range(n))
    mx, my = sum(xs) / n, sum(y) / n
    denom = sum((x - mx) ** 2 for x in xs)
    slope = sum((x - mx) * (v - my) for x, v in zip(xs, y, strict=False)) / denom if denom else 0.0
    intercept = my - slope * mx
    ss_tot = sum((v - my) ** 2 for v in y)
    ss_res = sum((v - (slope * x + intercept)) ** 2 for x, v in zip(xs, y, strict=False))
    r2 = 1 - ss_res / ss_tot if ss_tot > 1e-9 else 0.0
    return {"slope": slope, "intercept": intercept, "r2": max(0.0, min(1.0, r2))}


def _holt_damped(y: list[float], alpha=ALPHA, beta=BETA) -> dict:
    """Fit level and trend. Trend is initialised from the mean of the first
    differences rather than a single one, which stops one noisy first week
    setting the slope for the whole fit."""
    if len(y) < 2:
        return {"level": y[0] if y else 0.0, "trend": 0.0}
    level = y[0]
    diffs = [y[i + 1] - y[i] for i in range(min(3, len(y) - 1))]
    trend = sum(diffs) / len(diffs)
    for value in y[1:]:
        prev = level
        level = alpha * value + (1 - alpha) * (level + PHI * trend)
        trend = beta * (level - prev) + (1 - beta) * PHI * trend
    return {"level": level, "trend": trend}


def _holt_forecast(fit: dict, weeks: float) -> float:
    """Sum damped weekly forecasts across a partial-week horizon."""
    total, whole = 0.0, int(weeks)
    damp = 0.0
    for h in range(1, whole + 1):
        damp += PHI ** h
        total += max(0.0, fit["level"] + fit["trend"] * damp)
    frac = weeks - whole
    if frac > 0:
        damp += PHI ** (whole + 1)
        total += max(0.0, fit["level"] + fit["trend"] * damp) * frac
    return total


def forecast_earnings(db: Session, user_id: int) -> dict:
    y, active_days = _weekly_series(db, user_id)
    non_empty = sum(1 for v in y if v > 0)

    if active_days < 3 or non_empty < 2:
        return {
            "has_enough_data": False,
            "message": "A couple more weeks of spending and the forecast appears here.",
            "predicted_sats_30d": 0,
            "days_of_data": active_days,
        }

    horizon_weeks = HORIZON_DAYS / 7
    n = len(y)

    lin = _linear_regression(y)
    lin_total = 0.0
    for i in range(1, int(horizon_weeks) + 2):
        weight = min(1.0, horizon_weeks - (i - 1))
        if weight <= 0:
            break
        lin_total += max(0.0, lin["slope"] * (n + i - 1) + lin["intercept"]) * weight

    fit = _holt_damped(y)
    holt_total = _holt_forecast(fit, horizon_weeks)

    blended = 0.6 * holt_total + 0.4 * lin_total
    confidence = round(0.5 + 0.5 * lin["r2"], 3)
    band = 0.20 - 0.10 * lin["r2"]

    # The direction label describes the observed series, so it is read from the
    # least-squares slope rather than from Holt's trend state. Damping shrinks
    # that state on purpose: for a constant weekly slope s it settles at
    # beta*s / (1 - (1-beta)*phi), which at beta=0.1 and phi=0.85 is only 43% of
    # s. Comparing a deliberately shrunk quantity against a fraction of the mean
    # labelled a sustained 2,000 sats/week decline as "stable".
    weekly_mean = sum(y) / max(1, non_empty)
    tolerance = weekly_mean * TREND_TOLERANCE
    direction = ("increasing" if lin["slope"] > tolerance
                 else "decreasing" if lin["slope"] < -tolerance else "stable")

    return {
        "has_enough_data": True,
        "predicted_sats_30d": int(round(blended)),
        "lower_bound": int(round(blended * (1 - band))),
        "upper_bound": int(round(blended * (1 + band))),
        "confidence": confidence,
        "trend_direction": direction,
        "daily_average_sats": int(round(sum(y) / max(1, active_days))),
        "weekly_average_sats": int(round(weekly_mean)),
        "days_of_data": active_days,
        "model_comparison": {
            "linear_regression": {"predicted_sats": int(round(lin_total)),
                                  "r2": round(lin["r2"], 3),
                                  "slope_per_week": int(round(lin["slope"]))},
            "holt_damped": {"predicted_sats": int(round(holt_total)),
                            "alpha": ALPHA, "beta": BETA, "phi": PHI,
                            "level": int(round(fit["level"])),
                            "trend": int(round(fit["trend"]))},
            "blend_weights": {"holt": 0.6, "linear": 0.4},
        },
    }
