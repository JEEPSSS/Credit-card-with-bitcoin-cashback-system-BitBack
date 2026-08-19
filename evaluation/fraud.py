"""Fraud detector evaluation against labelled synthetic anomalies."""
from collections import defaultdict

from sqlalchemy.orm import Session

from app.anomaly_detector import (
    ANOMALY_THRESHOLD,
    _features,
    _heuristic_score,
    invalidate,
    score_transaction,
)
from app.models import Transaction
from evaluation.datasets import build_cardholder
from evaluation.metrics import average_precision, confusion, sweep


def _heuristic_baseline(db: Session, user_id: int, tx: Transaction) -> int:
    """Score the same transaction with the cold-start rule set.

    The Isolation Forest has to beat something, and the honest comparator is the
    hand-written rule set the app already falls back to before a user has
    history. If the trained model cannot beat five weighted rules, the trained
    model is not earning its 130ms.
    """
    history = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == user_id,
            Transaction.id != tx.id,
            Transaction.created_at < tx.created_at,
        )
        .order_by(Transaction.created_at.desc())
        .limit(500)
        .all()
    )
    return _heuristic_score(
        _features(tx.amount_fiat, tx.category, tx.merchant, tx.created_at, history)
    )


def evaluate(db: Session, *, days: int = 180, fraud_count: int = 8, seed: int = 42) -> dict:
    """Score every transaction and compare the model against the rule baseline.

    The defaults put the fraud rate near 3-4%. That matters: precision is a
    function of the base rate, so an evaluation set stuffed with fraud flatters
    the model. Real card fraud is well under 1% of transactions, so even 3% is
    generous — it is chosen to keep the positive class large enough for the
    per-anomaly-type breakdown to mean anything, and the report states the rate
    beside every precision figure for that reason.
    """
    invalidate()
    user, labelled = build_cardholder(
        db, f"fraud-eval-{seed}@evaluation.local",
        days=days, fraud_count=fraud_count, seed=seed,
    )

    model_scores: list[float] = []
    baseline_scores: list[float] = []
    labels: list[bool] = []
    by_kind: dict[str, list[int]] = defaultdict(list)

    for item in labelled:
        record = score_transaction(db, user.id, item.transaction)
        model_scores.append(record.risk_score)
        baseline_scores.append(_heuristic_baseline(db, user.id, item.transaction))
        labels.append(item.is_fraud)
        if item.is_fraud:
            by_kind[item.kind].append(record.risk_score)
    db.commit()

    model = confusion(model_scores, labels, ANOMALY_THRESHOLD)
    baseline = confusion(baseline_scores, labels, ANOMALY_THRESHOLD)

    # Recall per anomaly type shows *which* departures the model misses, which
    # is far more actionable than one aggregate number.
    per_kind = {
        kind: {
            "count": len(scores),
            "detected": sum(1 for s in scores if s >= ANOMALY_THRESHOLD),
            "recall": round(
                sum(1 for s in scores if s >= ANOMALY_THRESHOLD) / len(scores), 4
            ),
            "median_score": sorted(scores)[len(scores) // 2],
        }
        for kind, scores in sorted(by_kind.items())
    }

    return {
        "dataset": {
            "transactions": len(labelled),
            "fraudulent": sum(labels),
            "fraud_rate": round(sum(labels) / len(labels), 4),
            "days": days,
            "seed": seed,
        },
        "threshold": ANOMALY_THRESHOLD,
        "isolation_forest": {
            **model.as_dict(),
            "average_precision": round(average_precision(model_scores, labels), 4),
        },
        "heuristic_baseline": {
            **baseline.as_dict(),
            "average_precision": round(average_precision(baseline_scores, labels), 4),
        },
        "recall_by_anomaly_type": per_kind,
        "threshold_sweep": sweep(model_scores, labels),
    }
