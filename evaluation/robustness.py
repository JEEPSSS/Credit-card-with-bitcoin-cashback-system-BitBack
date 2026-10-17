"""The fraud and forecast results across many random seeds.

The original suites each ran on one synthetic cardholder from one seed. A
single draw cannot say whether a number is a property of the model or of
that draw: the fraud set holds only about ten anomalies, so one detection
more or less moves recall by ten points. This suite reruns both suites on
30 independent seeds and reports every headline number as a mean with a 95%
bootstrap interval over seeds, plus how often the model beat its baseline.
"""
from collections import defaultdict

from evaluation import forecast, fraud
from evaluation.db import fresh_session
from evaluation.stats import summary

SEEDS = range(1, 31)
FRAUD_METRICS = ("precision", "recall", "f1", "false_positive_rate", "average_precision")


def _run(suite, seed: int) -> dict:
    db = fresh_session()
    try:
        return suite.evaluate(db, seed=seed)
    finally:
        db.close()


def _fraud() -> dict:
    model, baseline, diff = defaultdict(list), defaultdict(list), defaultdict(list)
    detected, count = defaultdict(int), defaultdict(int)
    for seed in SEEDS:
        r = _run(fraud, seed)
        for m in FRAUD_METRICS:
            model[m].append(r["isolation_forest"][m])
            baseline[m].append(r["heuristic_baseline"][m])
            diff[m].append(r["isolation_forest"][m] - r["heuristic_baseline"][m])
        for kind, k in r["recall_by_anomaly_type"].items():
            detected[kind] += k["detected"]
            count[kind] += k["count"]
    return {
        "seeds": len(SEEDS),
        "isolation_forest": {m: summary(v) for m, v in model.items()},
        "heuristic_baseline": {m: summary(v) for m, v in baseline.items()},
        "model_minus_baseline": {m: summary(v) for m, v in diff.items()},
        "model_beats_baseline_on_f1": sum(d > 0 for d in diff["f1"]),
        "pooled_recall_by_anomaly_type": {
            kind: {"detected": detected[kind], "count": count[kind],
                   "recall": round(detected[kind] / count[kind], 4)}
            for kind in sorted(count)
        },
    }


def _forecast() -> dict:
    per_regime = defaultdict(lambda: defaultdict(list))
    for seed in SEEDS:
        r = _run(forecast, seed)
        for name, g in r["regimes"].items():
            per_regime[name]["model_mape"].append(g["shipped_model"]["mape_pct"])
            per_regime[name]["naive_mape"].append(g["naive_last_30_days"]["mape_pct"])
            per_regime[name]["skill"].append(g["skill_vs_naive"])
            per_regime[name]["coverage"].append(g["interval_coverage"]["rate"])
    return {
        "seeds": len(SEEDS),
        "regimes": {
            name: {
                "model_mape_pct": summary(v["model_mape"], digits=2),
                "naive_mape_pct": summary(v["naive_mape"], digits=2),
                "skill_vs_naive": summary(v["skill"], digits=3),
                "seeds_where_model_beats_naive": sum(s > 1 for s in v["skill"]),
                "band_coverage": summary(v["coverage"], digits=3),
            }
            for name, v in per_regime.items()
        },
    }


def evaluate(_db=None) -> dict:
    return {"fraud": _fraud(), "forecast": _forecast()}
