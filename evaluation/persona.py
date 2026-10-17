"""Persona classifier accuracy, against cardholders whose persona is known.

Each simulated cardholder is generated from one persona's centroid: their true
spending mix is drawn from a Dirichlet distribution centred on it, with a
concentration that sets how typical they are (high = textbook example of the
persona, low = barely resembles it). Purchases are then drawn from that mix,
and the classifier sees only those purchases - as it would in the app.

That separates two reasons the classifier can be wrong:

  ambiguity - the cardholder's true mix is closer to another persona than to
              the one that generated them. No classifier working from the mix
              can get these right. Measured by classifying the *true* mix
              ("ceiling" below).
  sampling  - the mix is unambiguous, but a handful of purchases is a noisy
              estimate of it. Measured by the gap between the ceiling and the
              accuracy after n purchases.

The app originally unlocked the persona after 5 purchases. This suite found
that close to a coin flip - and overconfident - so the threshold is now 20
(app/spending_persona.py); accuracy at both counts is reported.

Confidence is checked for calibration: among predictions made with ~80%
confidence, about 80% should be right. Expected calibration error (ECE;
Guo et al., 2017) summarises the gap across ten confidence bins.
"""
import random
from collections import defaultdict

from app.spending_persona import CATEGORIES, MIN_TRANSACTIONS, PERSONAS, persona_from_spend
from evaluation.recommender import AMOUNTS
from evaluation.stats import summary

KEYS = [p["key"] for p in PERSONAS]
CENTROIDS = {p["key"]: [max(p["weights"].get(c, 0.0), 0.005) for c in CATEGORIES] for p in PERSONAS}
# Dirichlet concentration: how tightly a cardholder sits around their persona.
TYPICALITY = {"textbook": 200.0, "typical": 50.0, "loose": 20.0, "atypical": 8.0}
PURCHASE_COUNTS = (5, 10, 20, 50, 100)   # 5 was the original unlock threshold
MEAN_AMOUNT = {c: sum(AMOUNTS[c]) / 2 for c in CATEGORIES}


def _dirichlet(rng: random.Random, alphas: list[float]) -> list[float]:
    draws = [rng.gammavariate(a, 1.0) for a in alphas]
    total = sum(draws)
    return [d / total for d in draws]


def _purchases(rng: random.Random, spend_mix: list[float], n: int) -> list[tuple[str, float]]:
    """n purchases whose expected *spend* share matches `spend_mix`.

    The persona centroids are shares of spend, and categories differ wildly in
    ticket size (travel vs transport), so categories are drawn in proportion
    to share / mean amount - otherwise expensive categories would be
    over-represented in spend and every cardholder would drift to Traveler.
    """
    weights = [s / MEAN_AMOUNT[c] for c, s in zip(CATEGORIES, spend_mix, strict=True)]
    out = []
    for _ in range(n):
        cat = rng.choices(CATEGORIES, weights=weights)[0]
        out.append((cat, rng.uniform(*AMOUNTS[cat])))
    return out


def _ece(confidences: list[float], correct: list[bool], bins: int = 10) -> tuple[float, list[dict]]:
    table = []
    ece = 0.0
    for b in range(bins):
        lo, hi = b / bins, (b + 1) / bins
        idx = [i for i, c in enumerate(confidences) if lo <= c < hi or (b == bins - 1 and c == 1.0)]
        if not idx:
            continue
        conf = sum(confidences[i] for i in idx) / len(idx)
        acc = sum(correct[i] for i in idx) / len(idx)
        ece += len(idx) / len(confidences) * abs(conf - acc)
        table.append({"bin": f"{lo:.1f}-{hi:.1f}", "n": len(idx),
                      "mean_confidence": round(conf, 3), "accuracy": round(acc, 3)})
    return ece, table


def evaluate(_db=None, *, per_cell: int = 200, seed: int = 23) -> dict:
    """`per_cell` cardholders for every (persona, typicality) pair."""
    rng = random.Random(seed)
    by_cell: dict[tuple[str, int], list[float]] = defaultdict(list)       # (typicality, n)
    ceiling: dict[str, list[float]] = defaultdict(list)
    per_persona: dict[str, list[float]] = defaultdict(list)                 # at n = 20, all typicality
    confusion = {t: dict.fromkeys(KEYS, 0) for t in KEYS}
    confidences: list[float] = []
    correct: list[bool] = []
    by_n_conf: dict[int, list[float]] = defaultdict(list)
    by_n_correct: dict[int, list[bool]] = defaultdict(list)

    for typicality, kappa in TYPICALITY.items():
        for truth in KEYS:
            alphas = [kappa * w for w in CENTROIDS[truth]]
            for _ in range(per_cell):
                mix = _dirichlet(rng, alphas)
                ceiling[typicality].append(float(
                    persona_from_spend(dict(zip(CATEGORIES, mix, strict=True)))["persona"]["key"] == truth))

                purchases = _purchases(rng, mix, max(PURCHASE_COUNTS))
                for n in PURCHASE_COUNTS:
                    spend: dict[str, float] = defaultdict(float)
                    for cat, amount in purchases[:n]:
                        spend[cat] += amount
                    result = persona_from_spend(spend)
                    guess = result["persona"]["key"]
                    hit = guess == truth
                    by_cell[(typicality, n)].append(float(hit))
                    confidences.append(result["confidence"])
                    correct.append(hit)
                    by_n_conf[n].append(result["confidence"])
                    by_n_correct[n].append(hit)
                    if n == 20:
                        per_persona[truth].append(float(hit))
                        confusion[truth][guess] += 1

    ece, reliability = _ece(confidences, correct)
    return {
        "design": {
            "personas": KEYS, "typicality_concentration": TYPICALITY,
            "purchase_counts": list(PURCHASE_COUNTS), "cardholders_per_persona_and_typicality": per_cell,
            "seed": seed, "app_unlock_threshold": MIN_TRANSACTIONS,
        },
        "accuracy": {
            typicality: {
                "ceiling_true_mix": summary(ceiling[typicality], seed=seed),
                **{f"after_{n}_purchases": summary(by_cell[(typicality, n)], seed=seed)
                   for n in PURCHASE_COUNTS},
            }
            for typicality in TYPICALITY
        },
        "recall_by_persona_at_20_purchases": {k: summary(v, seed=seed) for k, v in per_persona.items()},
        "confusion_at_20_purchases": {"rows_are_truth": confusion},
        "calibration": {
            "expected_calibration_error": round(ece, 4),
            "mean_confidence": round(sum(confidences) / len(confidences), 4),
            "accuracy": round(sum(correct) / len(correct), 4),
            "reliability": reliability,
            # The confidence formula does not know how many purchases it saw,
            # so calibration is checked per purchase count as well.
            "by_purchase_count": {
                f"after_{n}_purchases": {
                    "mean_confidence": round(sum(by_n_conf[n]) / len(by_n_conf[n]), 4),
                    "accuracy": round(sum(by_n_correct[n]) / len(by_n_correct[n]), 4),
                    "expected_calibration_error": round(_ece(by_n_conf[n], by_n_correct[n])[0], 4),
                }
                for n in PURCHASE_COUNTS
            },
        },
        "chance_accuracy": round(1 / len(KEYS), 3),
    }
