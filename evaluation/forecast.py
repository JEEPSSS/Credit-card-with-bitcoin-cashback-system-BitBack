"""Rolling-origin backtest of the earnings forecast.

The forecast is evaluated the way any time-series forecast should be: fit on
everything up to a cut-off, predict the next 30 days, compare against what
actually happened, then advance the cut-off and repeat. Nothing after the
cut-off is visible to the model at fit time, which is what `as_of` on
`forecast_earnings` exists to guarantee.

It is scored against a naive baseline — "the next 30 days will look like the
last 30 days". That comparison is the one that matters. A forecast that cannot
beat repeating the recent past is an expensive way to do nothing, and reporting
error without a baseline hides that.

Two regimes are run, because a trend-following model can only be judged fairly
against both. On a stationary cardholder the naive baseline is already close to
optimal and a trend term has nothing to find; on a growing one it should pull
ahead. Reporting one regime alone would flatter or damn the model depending
purely on how the generator happened to be configured.
"""
from datetime import timedelta

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.ml_forecast import (
    HORIZON_DAYS,
    _holt_damped,
    _holt_forecast,
    _weekly_series,
    forecast_earnings,
)
from app.models import RewardEvent
from evaluation.datasets import build_cardholder
from evaluation.metrics import mae, mape

REGIMES = {"stationary": 0.0, "growing": 0.8, "declining": -0.5}
HORIZON_WEEKS = HORIZON_DAYS / 7


def _candidates(db: Session, user_id: int, cutoff, shipped: float, naive: float) -> dict[str, float]:
    """Alternative predictors, all fitted on exactly the same weekly series.

    Isolating the contribution of each part of the shipped model. `window_mean`
    is the mean of the lookback window scaled to the horizon — the optimal
    predictor for a stationary series, and therefore the thing a trend model has
    to beat before its trend term can be said to be earning anything.
    `level_only` is the same exponential smoothing with the trend forced to
    zero, which separates "the smoothing is wrong" from "the trend is wrong".
    """
    y, _ = _weekly_series(db, user_id, cutoff)
    if not y:
        return {}

    window_mean = (sum(y) / len(y)) * HORIZON_WEEKS

    flat = _holt_damped(y)
    flat["trend"] = 0.0
    level_only = _holt_forecast(flat, HORIZON_WEEKS)

    return {
        "shipped_model": shipped,
        "naive_last_30d": naive,
        "window_mean": window_mean,
        "level_only": level_only,
        # window_mean is the strongest on flat and growing series but the
        # weakest on a decline, where a mean over the whole window lags. Level
        # smoothing is the reverse. Averaging them is the standard hedge when
        # two predictors fail in opposite conditions.
        "mean_level_blend": 0.5 * window_mean + 0.5 * level_only,
    }


def _actual_sats(db: Session, user_id: int, start, end) -> float:
    return float(
        db.query(func.coalesce(func.sum(RewardEvent.btc_amount), 0))
        .filter(
            RewardEvent.user_id == user_id,
            RewardEvent.created_at >= start,
            RewardEvent.created_at < end,
        )
        .scalar()
        or 0
    )


def _backtest(db: Session, name: str, trend: float, days: int, folds: int, seed: int) -> dict:
    user, labelled = build_cardholder(
        db, f"forecast-{name}-{seed}@evaluation.local",
        days=days, fraud_count=0, seed=seed, trend=trend,
    )
    first = labelled[0].transaction.created_at
    last = labelled[-1].transaction.created_at

    # Every cut-off needs enough history behind it to fit on, and a full horizon
    # ahead of it to be scored against.
    earliest = first + timedelta(days=100)
    latest = last - timedelta(days=HORIZON_DAYS)
    if latest <= earliest:
        raise ValueError("history too short to backtest; increase `days`")

    span = (latest - earliest).days
    cutoffs = [earliest + timedelta(days=round(span * i / (folds - 1))) for i in range(folds)]

    rows, actuals, model_preds, naive_preds = [], [], [], []
    predictions: dict[str, list[float]] = {}

    for cutoff in cutoffs:
        result = forecast_earnings(db, user.id, as_of=cutoff)
        if not result.get("has_enough_data"):
            continue

        actual = _actual_sats(db, user.id, cutoff, cutoff + timedelta(days=HORIZON_DAYS))
        naive = _actual_sats(db, user.id, cutoff - timedelta(days=HORIZON_DAYS), cutoff)
        predicted = float(result["predicted_sats_30d"])

        for name, value in _candidates(db, user.id, cutoff, predicted, naive).items():
            predictions.setdefault(name, []).append(value)

        actuals.append(actual)
        model_preds.append(predicted)
        naive_preds.append(naive)
        rows.append({
            "cutoff": cutoff.date().isoformat(),
            "actual_sats": int(actual),
            "predicted_sats": int(predicted),
            "naive_sats": int(naive),
            "error_pct": round((predicted - actual) / actual * 100, 2) if actual else None,
            "within_bounds": result["lower_bound"] <= actual <= result["upper_bound"],
            "trend_direction": result["trend_direction"],
        })

    model_mape = mape(actuals, model_preds)
    naive_mape = mape(actuals, naive_preds)
    covered = sum(1 for r in rows if r["within_bounds"])

    # Forecast combination (Bates & Granger, 1969): a weighted average of two
    # forecasts usually beats either, because their errors are not perfectly
    # correlated. Swept here rather than assumed, since the whole point of this
    # harness is to stop parameters being chosen by taste.
    combinations = {}
    for w in (0.0, 0.25, 0.4, 0.5, 0.6, 0.75, 1.0):
        blended = [w * m + (1 - w) * n for m, n in zip(model_preds, naive_preds, strict=False)]
        combinations[f"w_model_{w:g}"] = round(mape(actuals, blended), 2)

    return {
        "trend": trend,
        "folds_scored": len(rows),
        "shipped_model": {
            "mape_pct": round(model_mape, 2),
            "mae_sats": int(mae(actuals, model_preds)),
        },
        "naive_last_30_days": {
            "mape_pct": round(naive_mape, 2),
            "mae_sats": int(mae(actuals, naive_preds)),
        },
        "combination_sweep_mape": combinations,
        "candidates_mape": {
            name: round(mape(actuals, preds), 2) for name, preds in predictions.items()
        },
        # >1 means the model beats repeating the recent past. Below 1 and the
        # baseline should be shipped instead.
        "skill_vs_naive": round(naive_mape / model_mape, 3) if model_mape else None,
        "interval_coverage": {
            "covered": covered,
            "folds": len(rows),
            "rate": round(covered / len(rows), 3) if rows else None,
        },
        "folds": rows,
    }


def evaluate(db: Session, *, days: int = 240, folds: int = 8, seed: int = 7) -> dict:
    return {
        "horizon_days": HORIZON_DAYS,
        "dataset": {"days": days, "seed": seed},
        "note": "The stated range is presented in the app as a plausible band, "
                "not a calibrated prediction interval; coverage is reported to "
                "show how far from calibrated it is.",
        "regimes": {
            name: _backtest(db, name, trend, days, folds, seed)
            for name, trend in REGIMES.items()
        },
    }
