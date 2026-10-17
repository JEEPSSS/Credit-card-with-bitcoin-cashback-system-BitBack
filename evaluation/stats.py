"""Uncertainty for every headline number.

A single run on a single synthetic population gives one number with no sense
of how much it would move under a different draw. Every suite that reports a
mean therefore reports a 95% interval beside it, from the percentile
bootstrap (Efron & Tibshirani, 1993): resample the per-unit results with
replacement, recompute the statistic, and take the 2.5th and 97.5th
percentiles. It makes no normality assumption, which matters for bounded
quantities like hit rates near 0 or 1.
"""
import random
from collections.abc import Callable, Sequence


def mean(values: Sequence[float]) -> float:
    return sum(values) / len(values) if values else float("nan")


def bootstrap_ci(
    values: Sequence[float],
    statistic: Callable[[Sequence[float]], float] = mean,
    *,
    resamples: int = 2000,
    level: float = 0.95,
    seed: int = 0,
) -> tuple[float, float]:
    """Percentile-bootstrap confidence interval for `statistic(values)`."""
    if not values:
        return float("nan"), float("nan")
    rng = random.Random(seed)
    n = len(values)
    draws = sorted(
        statistic([values[rng.randrange(n)] for _ in range(n)]) for _ in range(resamples)
    )
    lo = draws[int((1 - level) / 2 * resamples)]
    hi = draws[min(resamples - 1, int((1 + level) / 2 * resamples))]
    return lo, hi


def summary(values: Sequence[float], *, digits: int = 4, seed: int = 0) -> dict:
    """{"mean", "ci95": [lo, hi], "n"} for a list of per-unit results."""
    lo, hi = bootstrap_ci(values, seed=seed)
    return {"mean": round(mean(values), digits), "ci95": [round(lo, digits), round(hi, digits)],
            "n": len(values)}
