"""Run every evaluation and write the results.

    python -m evaluation.run                 # everything
    python -m evaluation.run --only fraud    # one suite

Each suite gets a throwaway in-memory database, so this never touches
`bitback.db` and repeated runs are identical given the same seed.
"""
import argparse
import json
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from evaluation import forecast, fraud, latency

OUTPUT = Path("evaluation_results.json")
SUITES = {"fraud": fraud.evaluate, "forecast": forecast.evaluate, "latency": latency.evaluate}


def _session():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine)()


def _print_fraud(r: dict) -> None:
    d, m, b = r["dataset"], r["isolation_forest"], r["heuristic_baseline"]
    print(f"\nFRAUD  ({d['transactions']:,} transactions, {d['fraudulent']} injected "
          f"anomalies = {d['fraud_rate'] * 100:.1f}%)")
    print(f"  {'':22} {'precision':>10} {'recall':>8} {'F1':>7} {'FPR':>7} {'AP':>7}")
    for name, s in (("Isolation Forest", m), ("Heuristic baseline", b)):
        print(f"  {name:22} {s['precision']:>10.3f} {s['recall']:>8.3f} "
              f"{s['f1']:>7.3f} {s['false_positive_rate']:>7.3f} {s['average_precision']:>7.3f}")
    print("  recall by anomaly type:")
    for kind, k in r["recall_by_anomaly_type"].items():
        print(f"    {kind:10} {k['detected']:>3}/{k['count']:<3} "
              f"recall {k['recall']:.2f}   median score {k['median_score']}")


def _print_forecast(r: dict) -> None:
    print(f"\nFORECAST  (rolling-origin, {r['horizon_days']}-day horizon)")
    print(f"  {'regime':12} {'model MAPE':>11} {'naive MAPE':>11} {'skill':>7} {'in range':>10}")
    for name, g in r["regimes"].items():
        c = g["interval_coverage"]
        print(f"  {name:12} {g['shipped_model']['mape_pct']:>11.2f} "
              f"{g['naive_last_30_days']['mape_pct']:>11.2f} "
              f"{g['skill_vs_naive']:>7.3f} {c['covered']:>6}/{c['folds']}")
    print("  skill >1 means the model beats repeating the last 30 days")
    candidates = list(next(iter(r["regimes"].values()))["candidates_mape"])
    width = max(len(c) for c in candidates) + 2
    print("\n  candidate predictors (MAPE %, lower is better):")
    print(f"  {'regime':12}" + "".join(f"{c:>{width}}" for c in candidates))
    for name, g in r["regimes"].items():
        m = g["candidates_mape"]
        print(f"  {name:12}" + "".join(f"{m[c]:>{width}.2f}" for c in candidates))


def _print_latency(r: dict) -> None:
    print("\nLATENCY  (fraud scoring, on the request path)")
    print(f"  {'history':>9} {'cold ms':>9} {'warm ms':>9} {'p95 ms':>8} {'amortised':>11}")
    for m in r["measurements"]:
        print(f"  {m['history_transactions']:>9,} {m['cold_refit_ms']:>9.1f} "
              f"{m['warm_median_ms']:>9.1f} {m['warm_p95_ms']:>8.1f} {m['amortised_ms']:>11.1f}")


PRINTERS = {"fraud": _print_fraud, "forecast": _print_forecast, "latency": _print_latency}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--only", choices=sorted(SUITES), action="append")
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args()

    chosen = args.only or list(SUITES)
    results = {}

    for name in chosen:
        db = _session()
        try:
            results[name] = SUITES[name](db)
        finally:
            db.close()
        PRINTERS[name](results[name])

    args.output.write_text(json.dumps(results, indent=2, default=str) + "\n")
    print(f"\nWritten to {args.output}")


if __name__ == "__main__":
    main()
