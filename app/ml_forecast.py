"""Earnings forecast: exponential smoothing of the level, blended with the mean
of the lookback window, on weekly buckets.

Weekly aggregation is load-bearing and was chosen after the daily version
failed. Daily sats earned is zero-inflated — a typical user has no transactions
on many days — and fitting exponential smoothing to that series makes the level
estimate chase noise. On the demo account the daily fit produced a smoothed
level of ~50,000 against a true daily mean of ~6,200, and the 30-day forecast
came out roughly ten times the observed rate. Bucketing to calendar weeks
removes the zero inflation.

Why there is no trend term in the prediction
--------------------------------------------
This model used to be a 60/40 ensemble of damped Holt's linear method and a
least-squares trend line. Rolling-origin backtesting (`evaluation/forecast.py`)
showed that it lost to a naive "next month looks like last month" baseline in
every regime tested, and that the trend term was the reason:

    MAPE %          shipped   naive   window mean   level only   blend
    stationary        31.13   29.52         23.21        27.57   24.98
    growing           29.88   27.69         23.60        26.07   23.73
    declining         33.18   32.47         34.15        30.62   32.03
    mean              31.40   29.89         26.99        28.09   26.91

Thirteen weekly observations of a noisy, zero-inflated series do not support
estimating a trend. Every trend estimate on that data is mostly noise, and
extrapolating it four weeks multiplies the noise rather than the signal. Damping
reduces the damage but does not remove it: the trend term is negative-value at
this sample size, not merely weak.

What ships is the blend in the last column: exponential smoothing with the trend
contribution zeroed, averaged with the window mean. The two fail in opposite
conditions — a window mean lags a genuine decline, while level smoothing tracks
it — so averaging them is the standard hedge and gives the best mean error and a
tolerable worst case. That is a 14% error reduction over the previous ensemble,
and it beats the naive baseline where the ensemble did not.

Fitting alpha, beta and phi per cardholder by minimising one-step-ahead error —
the textbook treatment (Hyndman & Athanasopoulos) — was also tried, and made
things worse again for the same reason. See `estimate_parameters`.

The trend is still *estimated*, from the least-squares slope, but only to label
the direction shown in the app. Saying "your earnings are trending up" is a much
weaker claim than putting that trend into the number, and the data supports the
weaker one.
"""
from collections import defaultdict
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.clock import utcnow
from app.models import RewardEvent

ALPHA = 0.3    # level smoothing
BETA = 0.1     # trend smoothing, retained for the state but not the prediction
PHI = 0.85     # trend damping
LOOKBACK_DAYS = 91          # 13 whole weeks
HORIZON_DAYS = 30
TREND_TOLERANCE = 0.05      # weekly slope, as a share of the weekly mean

# Weight on level smoothing against the window mean. 0.5 was chosen by the
# backtest above, not by taste; the two candidates are close enough across
# regimes that an even split is the defensible choice.
LEVEL_WEIGHT = 0.5


def _weekly_series(
    db: Session, user_id: int, as_of: datetime | None = None
) -> tuple[list[float], int]:
    """Weekly earnings for the 13 weeks preceding `as_of` (default: now).

    `as_of` exists so the model can be evaluated at a point in the past. A
    forecast that can only be run against "now" cannot be backtested, and a
    forecast that cannot be backtested has no error figure to report — which
    made the parameter a requirement of taking the evaluation seriously rather
    than a convenience.
    """
    end = as_of or utcnow()
    since = end - timedelta(days=LOOKBACK_DAYS)
    rows = (
        db.query(RewardEvent)
        .filter(
            RewardEvent.user_id == user_id,
            RewardEvent.created_at >= since,
            RewardEvent.created_at < end,
        )
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


def _holt_pass(y: list[float], alpha: float, beta: float, phi: float) -> dict:
    """One pass of damped Holt, returning the final state and in-sample error.

    Trend is initialised from the mean of the first few differences rather than
    a single one, which stops one noisy first week setting the slope for the
    whole fit. The one-step-ahead squared error is accumulated on the way
    through so the parameters can be chosen by it.
    """
    if len(y) < 2:
        return {"level": y[0] if y else 0.0, "trend": 0.0, "sse": 0.0}

    level = y[0]
    diffs = [y[i + 1] - y[i] for i in range(min(3, len(y) - 1))]
    trend = sum(diffs) / len(diffs)
    sse = 0.0

    for value in y[1:]:
        forecast = level + phi * trend          # what the state predicted for this step
        sse += (value - forecast) ** 2
        prev = level
        level = alpha * value + (1 - alpha) * forecast
        trend = beta * (level - prev) + (1 - beta) * phi * trend

    return {"level": level, "trend": trend, "sse": sse}


# Grid for parameter estimation. Coarse on purpose: with thirteen weekly
# observations a fine grid buys precision the data cannot support, and just
# overfits the sample it was chosen on.
_ALPHA_GRID = (0.1, 0.2, 0.3, 0.4, 0.5, 0.7)
_BETA_GRID = (0.05, 0.1, 0.2, 0.3)
_PHI_GRID = (0.75, 0.85, 0.95)


def estimate_parameters(y: list[float]) -> tuple[float, float, float]:
    """Grid-search alpha, beta and phi by minimising one-step-ahead SSE.

    Not used in production. Kept because the experiment it supports is part of
    the evaluation: fitting the smoothing parameters per cardholder is the
    textbook treatment (Hyndman & Athanasopoulos), and on this data it made the
    forecast measurably *worse* —

        regime        fixed   fitted
        stationary    0.949    0.920
        growing       0.927    0.839
        declining     0.979    0.878   (skill vs naive; higher is better)

    Thirteen weekly observations cannot support three estimated parameters. The
    search finds whatever minimises error on the sample it was given, and that
    choice does not carry to the next thirty days. Fixed, conservative values
    generalise better here, so those are what ship — and the number above is the
    reason, rather than an assumption.
    """
    best, best_params = None, (ALPHA, BETA, PHI)
    for a in _ALPHA_GRID:
        for b in _BETA_GRID:
            for p in _PHI_GRID:
                fit = _holt_pass(y, a, b, p)
                if best is None or fit["sse"] < best["sse"]:
                    best, best_params = fit, (a, b, p)
    return best_params


def _holt_damped(y: list[float], alpha: float = ALPHA, beta: float = BETA,
                 phi: float = PHI) -> dict:
    """Damped Holt with fixed smoothing parameters.

    See `estimate_parameters` for why they are fixed rather than fitted.
    """
    if len(y) < 2:
        return {"level": y[0] if y else 0.0, "trend": 0.0, "sse": 0.0,
                "alpha": alpha, "beta": beta, "phi": phi}
    return {**_holt_pass(y, alpha, beta, phi), "alpha": alpha, "beta": beta, "phi": phi}


def _holt_forecast(fit: dict, weeks: float) -> float:
    """Sum damped weekly forecasts across a partial-week horizon."""
    phi = fit.get("phi", PHI)
    total, whole = 0.0, int(weeks)
    damp = 0.0
    for h in range(1, whole + 1):
        damp += phi ** h
        total += max(0.0, fit["level"] + fit["trend"] * damp)
    frac = weeks - whole
    if frac > 0:
        damp += phi ** (whole + 1)
        total += max(0.0, fit["level"] + fit["trend"] * damp) * frac
    return total


def forecast_earnings(db: Session, user_id: int, as_of: datetime | None = None) -> dict:
    y, active_days = _weekly_series(db, user_id, as_of)
    non_empty = sum(1 for v in y if v > 0)

    if active_days < 3 or non_empty < 2:
        return {
            "has_enough_data": False,
            "message": "A couple more weeks of spending and the forecast appears here.",
            "predicted_sats_30d": 0,
            "days_of_data": active_days,
        }

    horizon_weeks = HORIZON_DAYS / 7

    lin = _linear_regression(y)

    # Window mean, scaled to the horizon. For a stationary series this is the
    # optimal predictor, and it is the thing any trend model must beat before
    # its trend term can be said to be earning anything.
    window_mean = (sum(y) / len(y)) * horizon_weeks

    # Exponential smoothing with the trend contribution removed. See the note
    # below for why the trend is dropped rather than damped further.
    fit = _holt_damped(y)
    level_only = _holt_forecast({**fit, "trend": 0.0}, horizon_weeks)

    blended = LEVEL_WEIGHT * level_only + (1 - LEVEL_WEIGHT) * window_mean
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
            "window_mean": {"predicted_sats": int(round(window_mean)),
                            "weeks_averaged": len(y)},
            "level_only": {"predicted_sats": int(round(level_only)),
                           "alpha": fit["alpha"], "beta": fit["beta"], "phi": fit["phi"],
                           "level": int(round(fit["level"])),
                           "trend_state": int(round(fit["trend"]))},
            "trend_estimate": {"slope_per_week": int(round(lin["slope"])),
                               "r2": round(lin["r2"], 3),
                               "used_for": "direction label only, not the prediction"},
            "blend_weights": {"level_only": LEVEL_WEIGHT, "window_mean": 1 - LEVEL_WEIGHT},
        },
    }
