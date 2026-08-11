"""Unsupervised fraud detection with Isolation Forest.

Card fraud has no labels at signup, so a supervised classifier is not available:
the model has to learn what normal looks like for each cardholder and flag
departures from it. Isolation Forest suits this because anomalies need fewer
random splits to isolate, so scoring is O(log n) per tree and fast enough to run
inline on the transaction path.

Six features per transaction, all computed relative to the user's own history so
a $400 spend is normal for one cardholder and a flag for another.

Training is separated from scoring
----------------------------------
The first version fitted a fresh 100-tree forest on every transaction, inside
the request. Measured on this codebase that cost 117 ms at 100 transactions of
history and 158 ms at the 500-row cap, of which a flat ~110 ms was the fit
itself - paid on every purchase, to rebuild a model that had barely changed.

Now a fitted model is cached per user and reused. It is refit only when the
user has accumulated `settings.fraud_refit_interval` new transactions since the
last fit, so the request path is a single `decision_function` call on an already
built forest. The training-set decision values needed for calibration are
cached alongside the model rather than recomputed.

The cache is in-process, so it is per-worker and cold after a restart: the first
transaction following a restart pays the full training cost, and every one after
that does not. Sharing it across workers would mean serialising models into
Redis or a shared volume, which is not worth the deployment complexity at this
scale but is the obvious next step.
"""
import json
import math
from collections import OrderedDict

import numpy as np
from sklearn.ensemble import IsolationForest
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Transaction, TransactionRiskScore

MIN_TRAIN_SIZE = 50
MIN_CONTEXT = 20      # prior transactions a training row needs to be usable
ANOMALY_THRESHOLD = 60
CONTAMINATION = 0.05
MODEL_VERSION = "iforest-v1"
HISTORY_LIMIT = 500
CACHE_SIZE = 256      # users held in the model cache before the oldest is evicted

FEATURE_NAMES = [
    "amount_zscore", "category_frequency", "time_since_last_tx",
    "hour_of_day", "amount_vs_global_avg", "merchant_is_new",
]


def _features(tx_amount, tx_category, tx_merchant, tx_time, history) -> dict:
    amounts = [t.amount_fiat for t in history]
    same_cat = [t.amount_fiat for t in history if t.category == tx_category]

    if len(same_cat) >= 2:
        mu, sd = float(np.mean(same_cat)), float(np.std(same_cat))
        zscore = (tx_amount - mu) / sd if sd > 1e-6 else 0.0
    else:
        zscore = 0.0

    cat_freq = len(same_cat) / len(history) if history else 0.0

    if history:
        last = max(history, key=lambda t: t.created_at).created_at
        gap = max(0.0, (tx_time - last).total_seconds())
        time_since = math.log(gap + 1)
    else:
        time_since = 0.0

    hour = tx_time.hour / 23.0
    global_avg = float(np.mean(amounts)) if amounts else tx_amount
    amt_vs_avg = tx_amount / global_avg if global_avg > 1e-6 else 1.0
    is_new_merchant = 0.0 if any(t.merchant == tx_merchant for t in history) else 1.0

    return {
        "amount_zscore": round(zscore, 4),
        "category_frequency": round(cat_freq, 4),
        "time_since_last_tx": round(time_since, 4),
        "hour_of_day": round(hour, 4),
        "amount_vs_global_avg": round(amt_vs_avg, 4),
        "merchant_is_new": is_new_merchant,
    }


def _vector(f: dict) -> list[float]:
    return [f[k] for k in FEATURE_NAMES]


def _heuristic_score(f: dict) -> int:
    """Cold-start rule set used until the user has enough history to train on.

    Weights are intentionally simple and are documented in the report as a
    baseline the trained model is compared against.
    """
    score = 0.0
    score += min(35, abs(f["amount_zscore"]) * 11)
    score += 20 if f["amount_vs_global_avg"] > 3 else 0
    score += 15 if f["hour_of_day"] < 0.22 else 0          # roughly midnight-5am
    score += 10 * f["merchant_is_new"]
    score += 15 if f["category_frequency"] < 0.05 else 0
    return int(max(0, min(100, score)))


class _FittedModel:
    """An Isolation Forest plus the calibration data derived from its training set."""

    __slots__ = ("model", "train_min", "train_max", "trained_at_size")

    def __init__(self, model: IsolationForest, train_d: np.ndarray, trained_at_size: int):
        self.model = model
        self.train_min = float(train_d.min())
        self.train_max = float(train_d.max())
        self.trained_at_size = trained_at_size

    def calibrate(self, x: np.ndarray) -> int:
        """Map an Isolation Forest decision value onto a 0-100 risk scale.

        Mapping the raw score_samples output linearly does not work: on real data
        it clusters in a narrow band near -0.45, so a fixed linear map pushes
        every transaction over any useful threshold. Instead the score is
        normalised against the spread of the training set's own decision values.

        decision_function is already offset by the contamination hyperparameter,
        so it is negative for exactly the fraction of training points
        contamination declares to be outliers. Anchoring 50 at that boundary
        means the flagging threshold of 60 is derived from contamination rather
        than picked by hand.
        """
        d = float(self.model.decision_function(x)[0])
        if d < 0:
            # Outlier side: ANOMALY_THRESHOLD..100, deepest training outlier at 100.
            span = abs(self.train_min) if self.train_min < -1e-9 else 1.0
            risk = ANOMALY_THRESHOLD + (100 - ANOMALY_THRESHOLD) * min(1.0, abs(d) / span)
        else:
            # Inlier side: 0..ANOMALY_THRESHOLD, most normal training point at 0.
            span = self.train_max if self.train_max > 1e-9 else 1.0
            risk = ANOMALY_THRESHOLD * (1.0 - min(1.0, d / span))
        return int(max(0, min(100, round(risk))))


_cache: OrderedDict[int, _FittedModel] = OrderedDict()


def _cache_get(user_id: int, history_size: int) -> _FittedModel | None:
    fitted = _cache.get(user_id)
    if fitted is None:
        return None
    if history_size - fitted.trained_at_size >= settings.fraud_refit_interval:
        return None                       # stale: enough new data to be worth refitting
    _cache.move_to_end(user_id)
    return fitted


def _cache_put(user_id: int, fitted: _FittedModel) -> None:
    _cache[user_id] = fitted
    _cache.move_to_end(user_id)
    while len(_cache) > CACHE_SIZE:
        _cache.popitem(last=False)


def invalidate(user_id: int | None = None) -> None:
    """Drop cached models. Called when a user's history changes out of band."""
    if user_id is None:
        _cache.clear()
    else:
        _cache.pop(user_id, None)


def _build_training_matrix(history: list[Transaction]) -> np.ndarray | None:
    """Feature matrix for the user's history, newest first.

    Features are relative to what came before, so a training row is only
    meaningful if that row itself had enough prior context. Rows near the start
    of the user's history have almost no prior transactions, which makes their
    features degenerate and shifts the whole decision boundary. Those rows are
    excluded rather than fed to the model as if they were normal.
    """
    rows = []
    for i, h in enumerate(history):
        prior = history[i + 1:]
        if len(prior) < MIN_CONTEXT:
            break
        rows.append(_vector(_features(h.amount_fiat, h.category, h.merchant, h.created_at, prior)))
    if len(rows) < MIN_TRAIN_SIZE:
        return None
    return np.array(rows, dtype=float)


def _fit(history: list[Transaction]) -> _FittedModel | None:
    X = _build_training_matrix(history)
    if X is None:
        return None
    model = IsolationForest(contamination=CONTAMINATION, random_state=42, n_estimators=100)
    model.fit(X)
    return _FittedModel(model, model.decision_function(X), len(history))


def score_transaction(db: Session, user_id: int, tx: Transaction) -> TransactionRiskScore:
    # Strictly earlier transactions only. In production every other transaction
    # is already older so this is a no-op, but when backfilling demo data it
    # stops the model seeing the future: without the filter the "time since last
    # transaction" feature is zero for the scored point and positive for every
    # training row, which biases the decision boundary.
    history = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == user_id,
            Transaction.id != tx.id,
            Transaction.created_at < tx.created_at,
        )
        .order_by(Transaction.created_at.desc())
        .limit(HISTORY_LIMIT)
        .all()
    )
    feats = _features(tx.amount_fiat, tx.category, tx.merchant, tx.created_at, history)

    fitted = _cache_get(user_id, len(history))
    if fitted is None:
        fitted = _fit(history)
        if fitted is not None:
            _cache_put(user_id, fitted)

    if fitted is not None:
        risk = fitted.calibrate(np.array([_vector(feats)], dtype=float))
        version = MODEL_VERSION
    else:
        risk = _heuristic_score(feats)
        version = "heuristic-v1"

    record = TransactionRiskScore(
        transaction_id=tx.id,
        user_id=user_id,
        risk_score=risk,
        is_anomaly=risk >= ANOMALY_THRESHOLD,
        features_used=json.dumps(feats),
        model_version=version,
    )
    db.add(record)
    return record


def get_fraud_summary(db: Session, user_id: int) -> dict:
    scores = db.query(TransactionRiskScore).filter(TransactionRiskScore.user_id == user_id).all()
    total = len(scores)
    high = sum(1 for s in scores if s.risk_score >= ANOMALY_THRESHOLD)
    medium = sum(1 for s in scores if 30 <= s.risk_score < ANOMALY_THRESHOLD)
    low = total - high - medium
    protection = 100 if total == 0 else int(round(100 - (high / total) * 100))

    flagged = (
        db.query(TransactionRiskScore, Transaction)
        .join(Transaction, Transaction.id == TransactionRiskScore.transaction_id)
        .filter(TransactionRiskScore.user_id == user_id, TransactionRiskScore.is_anomaly.is_(True))
        .order_by(TransactionRiskScore.created_at.desc())
        .limit(5)
        .all()
    )
    return {
        "protection_score": protection,
        "total_transactions_analyzed": total,
        "high_risk_count": high,
        "medium_risk_count": medium,
        "low_risk_count": low,
        "model_version": MODEL_VERSION,
        "feature_names": FEATURE_NAMES,
        "recent_flags": [
            {
                "transaction_id": t.id,
                "merchant": t.merchant,
                "category": t.category,
                "amount_fiat": t.amount_fiat,
                "risk_score": s.risk_score,
                "features": json.loads(s.features_used),
                "created_at": t.created_at,
            }
            for s, t in flagged
        ],
    }
