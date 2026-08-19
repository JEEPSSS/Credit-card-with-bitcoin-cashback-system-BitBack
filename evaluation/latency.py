"""Latency of the fraud detector, cold and warm.

The detector runs inline on the transaction path, so its cost is the user's
cost. This measures the two states that matter — a refit, and a cached model —
and the amortised figure that follows from the refit interval.

Absolute numbers are machine-specific and the report says so. The ratio between
cold and warm is not, and that is the claim being made.
"""
import statistics
import time

from sqlalchemy.orm import Session

from app.anomaly_detector import invalidate, score_transaction
from app.config import settings
from app.models import Transaction
from evaluation.datasets import build_cardholder


def _time_ms(fn, repeats: int) -> list[float]:
    times = []
    for _ in range(repeats):
        start = time.perf_counter()
        fn()
        times.append((time.perf_counter() - start) * 1000)
    return times


def evaluate(db: Session, *, history_sizes=(100, 250, 500), repeats: int = 12) -> dict:
    results = []

    for size in history_sizes:
        # `days` drives volume; roughly two transactions a day on average.
        user, labelled = build_cardholder(
            db, f"latency-{size}@evaluation.local",
            days=size, fraud_count=0, seed=size,
        )
        newest: Transaction = labelled[-1].transaction

        # Bound as defaults: a bare closure over the loop variables would be
        # re-read at call time, which is a real bug in a timing harness.
        def score(_user_id=user.id, _tx=newest):
            score_transaction(db, _user_id, _tx)
            db.rollback()

        invalidate()
        cold = _time_ms(score, 1)[0]
        warm = _time_ms(score, repeats)

        interval = settings.fraud_refit_interval
        warm_median = statistics.median(warm)
        amortised = (cold + (interval - 1) * warm_median) / interval

        results.append({
            "history_transactions": len(labelled),
            "cold_refit_ms": round(cold, 1),
            "warm_median_ms": round(warm_median, 1),
            "warm_p95_ms": round(sorted(warm)[int(len(warm) * 0.95) - 1], 1),
            "amortised_ms": round(amortised, 1),
            "refit_interval": interval,
        })

    return {
        "note": "Absolute timings are specific to the machine this ran on; the "
                "cold-to-warm ratio is the portable result.",
        "measurements": results,
    }
