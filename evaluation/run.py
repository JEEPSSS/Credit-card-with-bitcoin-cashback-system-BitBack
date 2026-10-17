"""Run every evaluation and write the results.

    python -m evaluation.run                       # everything (about 10 minutes)
    python -m evaluation.run --only persona        # one suite
    python -m evaluation.run --only fraud --only forecast

Each suite gets a throwaway in-memory database, so this never touches
`bitback.db` and repeated runs are identical given the same seeds. Results go
to evaluation/results.json, which is committed: the report's numbers can be
traced to the run that produced them.
"""
import argparse
import json
from pathlib import Path

from evaluation import (
    forecast,
    fraud,
    gamification,
    latency,
    persona,
    recommender,
    rewards,
    robustness,
)
from evaluation.db import fresh_session

OUTPUT = Path(__file__).parent / "results.json"
SUITES = {
    "fraud": fraud.evaluate,
    "forecast": forecast.evaluate,
    "latency": latency.evaluate,
    "robustness": robustness.evaluate,
    "recommender": recommender.evaluate,
    "persona": persona.evaluate,
    "rewards": rewards.evaluate,
    "gamification": gamification.evaluate,
}


def _ci(s: dict, pct: bool = False) -> str:
    k = 100 if pct else 1
    return f"{s['mean'] * k:.3f} [{s['ci95'][0] * k:.3f}, {s['ci95'][1] * k:.3f}]"


def _print_fraud(r: dict) -> None:
    d, m, b = r["dataset"], r["isolation_forest"], r["heuristic_baseline"]
    print(f"\nFRAUD  (one seed: {d['transactions']:,} transactions, {d['fraudulent']} injected "
          f"anomalies = {d['fraud_rate'] * 100:.1f}%)")
    print(f"  {'':22} {'precision':>10} {'recall':>8} {'F1':>7} {'FPR':>7} {'AP':>7}")
    for name, s in (("Isolation Forest", m), ("Heuristic baseline", b)):
        print(f"  {name:22} {s['precision']:>10.3f} {s['recall']:>8.3f} "
              f"{s['f1']:>7.3f} {s['false_positive_rate']:>7.3f} {s['average_precision']:>7.3f}")


def _print_forecast(r: dict) -> None:
    print(f"\nFORECAST  (one seed, rolling-origin, {r['horizon_days']}-day horizon)")
    print(f"  {'regime':12} {'model MAPE':>11} {'naive MAPE':>11} {'skill':>7}")
    for name, g in r["regimes"].items():
        print(f"  {name:12} {g['shipped_model']['mape_pct']:>11.2f} "
              f"{g['naive_last_30_days']['mape_pct']:>11.2f} {g['skill_vs_naive']:>7.3f}")


def _print_latency(r: dict) -> None:
    print("\nLATENCY  (fraud scoring, on the request path)")
    print(f"  {'history':>9} {'cold ms':>9} {'warm ms':>9} {'p95 ms':>8} {'amortised':>11}")
    for m in r["measurements"]:
        print(f"  {m['history_transactions']:>9,} {m['cold_refit_ms']:>9.1f} "
              f"{m['warm_median_ms']:>9.1f} {m['warm_p95_ms']:>8.1f} {m['amortised_ms']:>11.1f}")


def _print_robustness(r: dict) -> None:
    f = r["fraud"]
    print(f"\nROBUSTNESS  ({f['seeds']} seeds, mean [95% CI])")
    for m in ("precision", "recall", "f1", "false_positive_rate", "average_precision"):
        print(f"  fraud {m:20} model {_ci(f['isolation_forest'][m])}   "
              f"baseline {_ci(f['heuristic_baseline'][m])}")
    print(f"  model beats baseline on F1 in {f['model_beats_baseline_on_f1']}/{f['seeds']} seeds")
    for kind, k in f["pooled_recall_by_anomaly_type"].items():
        print(f"    {kind:10} recall {k['recall']:.2f} ({k['detected']}/{k['count']})")
    for name, g in r["forecast"]["regimes"].items():
        print(f"  forecast {name:11} skill {_ci(g['skill_vs_naive'])}  "
              f"beats naive in {g['seeds_where_model_beats_naive']}/{r['forecast']['seeds']}  "
              f"band coverage {g['band_coverage']['mean']:.2f}")


def _print_recommender(r: dict) -> None:
    d = r["design"]
    print(f"\nBOOST RECOMMENDER  ({d['users_per_population'] * len(d['populations'])} cardholders, "
          f"held-out seed {d['seed']})")
    print(f"  {'method':30} {'hit rate':>24} {'value captured':>24}")
    for name, m in r["methods"].items():
        print(f"  {name:30} {_ci(m['all']['hit_rate']):>24} {_ci(m['all']['value_captured']):>24}")
    v1 = r["paired_vs_shipped"]["v1_weighted_score"]
    print(f"  v1 - shipped (paired): hit {_ci(v1['hit_rate_minus_shipped'])}, "
          f"capture {_ci(v1['capture_minus_shipped'])}")


def _print_persona(r: dict) -> None:
    counts = r["design"]["purchase_counts"]
    print(f"\nPERSONA  (accuracy; chance = {r['chance_accuracy']})")
    print(f"  {'typicality':11} {'ceiling':>8}" + "".join(f"{'n=' + str(n):>8}" for n in counts))
    for t, row in r["accuracy"].items():
        print(f"  {t:11} {row['ceiling_true_mix']['mean']:>8.3f}"
              + "".join(f"{row[f'after_{n}_purchases']['mean']:>8.3f}" for n in counts))
    for k, v in r["calibration"]["by_purchase_count"].items():
        print(f"  {k:22} confidence {v['mean_confidence']:.3f}  accuracy {v['accuracy']:.3f}  "
              f"ECE {v['expected_calibration_error']:.3f}")


def _print_rewards(r: dict) -> None:
    b = r["breakdown_violations"]
    print(f"\nREWARDS  ({r['design']['purchases']:,} random purchases)")
    for k in b["current"]:
        print(f"  {k:30} now {b['current'][k]:>6}   before fix {b['v1_before_fix'][k]:>6}")
    print(f"  total off by > 0.5 sat: {r['total_vs_exact']['cases_off_by_more_than_half_a_sat']}"
          f"   monotonicity violations: "
          f"{sum(v for k, v in r['monotonicity'].items() if k != 'checked')}")
    ru = r["round_up"]
    print(f"  round-up cent mismatches: now {ru['spare_change_mismatches_vs_exact']}, "
          f"before fix {ru['v1_before_fix_mismatches']} (of {ru['checked']:,})")


def _print_gamification(r: dict) -> None:
    print(f"\nGAMIFICATION  ({r['design']['users_per_archetype']} cardholders per archetype, "
          f"{r['design']['days']} days; share earned by day 180)")
    keys = list(next(iter(r["badges"].values())))
    print(f"  {'badge':20}" + "".join(f"{a:>10}" for a in r["badges"]))
    for k in keys:
        print(f"  {k:20}" + "".join(f"{r['badges'][a][k]['by_day_180']:>10.2f}" for a in r["badges"]))
    for lvl in next(iter(r["levels"].values())):
        print(f"  level {lvl:14}" + "".join(f"{r['levels'][a][lvl]['by_day_180']:>10.2f}"
                                          for a in r["levels"]))


PRINTERS = {
    "fraud": _print_fraud, "forecast": _print_forecast, "latency": _print_latency,
    "robustness": _print_robustness, "recommender": _print_recommender,
    "persona": _print_persona, "rewards": _print_rewards, "gamification": _print_gamification,
}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--only", choices=sorted(SUITES), action="append")
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args()

    chosen = args.only or list(SUITES)
    # A partial run updates its suites in the existing file rather than
    # discarding the others.
    results = json.loads(args.output.read_text()) if args.output.exists() and args.only else {}

    for name in chosen:
        db = fresh_session()
        try:
            results[name] = SUITES[name](db)
        finally:
            db.close()
        PRINTERS[name](results[name])

    args.output.write_text(json.dumps(results, indent=2, default=str) + "\n")
    print(f"\nWritten to {args.output}")


if __name__ == "__main__":
    main()
