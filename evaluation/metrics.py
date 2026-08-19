"""Classification metrics, written out rather than imported.

sklearn would supply all of these. They are implemented here anyway, for two
reasons: the definitions are short enough that the report can quote them, and a
viva question about what precision means is easier to answer when the code
computes it rather than delegates it.
"""
from dataclasses import dataclass


@dataclass(frozen=True)
class Confusion:
    tp: int
    fp: int
    tn: int
    fn: int

    @property
    def precision(self) -> float:
        """Of the transactions we flagged, how many were actually fraud.

        The cost of low precision is a cardholder who stops reading alerts.
        """
        return self.tp / (self.tp + self.fp) if self.tp + self.fp else 0.0

    @property
    def recall(self) -> float:
        """Of the actual fraud, how much we caught.

        The cost of low recall is money.
        """
        return self.tp / (self.tp + self.fn) if self.tp + self.fn else 0.0

    @property
    def f1(self) -> float:
        p, r = self.precision, self.recall
        return 2 * p * r / (p + r) if p + r else 0.0

    @property
    def false_positive_rate(self) -> float:
        """Share of legitimate transactions wrongly flagged.

        The figure that decides whether a fraud feature is usable in practice:
        at 5% a heavy user is interrupted several times a week.
        """
        return self.fp / (self.fp + self.tn) if self.fp + self.tn else 0.0

    def as_dict(self) -> dict:
        return {
            "true_positives": self.tp,
            "false_positives": self.fp,
            "true_negatives": self.tn,
            "false_negatives": self.fn,
            "precision": round(self.precision, 4),
            "recall": round(self.recall, 4),
            "f1": round(self.f1, 4),
            "false_positive_rate": round(self.false_positive_rate, 4),
        }


def confusion(scores: list[float], labels: list[bool], threshold: float) -> Confusion:
    tp = fp = tn = fn = 0
    for score, is_fraud in zip(scores, labels, strict=False):
        flagged = score >= threshold
        if flagged and is_fraud:
            tp += 1
        elif flagged and not is_fraud:
            fp += 1
        elif not flagged and is_fraud:
            fn += 1
        else:
            tn += 1
    return Confusion(tp, fp, tn, fn)


def sweep(scores: list[float], labels: list[bool], step: int = 5) -> list[dict]:
    """Metrics across the whole threshold range.

    A single operating point hides the trade-off. The sweep is what shows
    whether the shipped threshold of 60 was a reasonable choice or a lucky one.
    """
    return [
        {"threshold": t, **confusion(scores, labels, t).as_dict()}
        for t in range(0, 101, step)
    ]


def average_precision(scores: list[float], labels: list[bool]) -> float:
    """Area under the precision-recall curve, by the step-wise sum.

    Preferred to ROC-AUC here because the classes are heavily imbalanced —
    fraud is a few percent of transactions — and ROC-AUC flatters a classifier
    on imbalanced data by rewarding true negatives, of which there are many.
    """
    ranked = sorted(zip(scores, labels, strict=False), key=lambda p: p[0], reverse=True)
    total_positive = sum(1 for _, y in ranked if y)
    if not total_positive:
        return 0.0

    tp = 0
    previous_recall = 0.0
    area = 0.0
    for i, (_, is_fraud) in enumerate(ranked, start=1):
        if is_fraud:
            tp += 1
        precision = tp / i
        recall = tp / total_positive
        area += precision * (recall - previous_recall)
        previous_recall = recall
    return area


def mape(actual: list[float], predicted: list[float]) -> float:
    """Mean absolute percentage error, skipping zero actuals.

    MAPE is undefined at zero and explodes near it, which matters here because a
    quiet week is a legitimate outcome. Those points are excluded and counted,
    rather than silently biasing the average.
    """
    pairs = [(a, p) for a, p in zip(actual, predicted, strict=False) if a != 0]
    if not pairs:
        return float("nan")
    return sum(abs((a - p) / a) for a, p in pairs) / len(pairs) * 100


def mae(actual: list[float], predicted: list[float]) -> float:
    if not actual:
        return float("nan")
    return sum(abs(a - p) for a, p in zip(actual, predicted, strict=False)) / len(actual)
