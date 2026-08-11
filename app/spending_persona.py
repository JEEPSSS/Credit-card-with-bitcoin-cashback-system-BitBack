"""Spending persona via nearest-centroid matching on cosine similarity.

K-Means over a single user's data is meaningless - there is one point. Instead
the five personas are fixed centroids in the 10-dimensional category simplex,
and the user's normalised spend vector is assigned to the nearest one. Cosine
similarity is the right metric because the vector is already normalised to
proportions, so magnitude carries no information and only direction matters.
"""
import math
from collections import defaultdict

from sqlalchemy.orm import Session

from app.models import Transaction

CATEGORIES = [
    "dining", "transport", "shopping", "entertainment", "groceries",
    "travel", "health", "education", "bills", "general",
]

PERSONAS = [
    {"key": "foodie", "name": "The Foodie", "icon": "utensils", "color": "#F7931A",
     "blurb": "Most of your sats come from eating well.",
     "weights": {"dining": .30, "groceries": .25, "entertainment": .12, "shopping": .10,
                 "transport": .08, "general": .06, "bills": .04, "travel": .03, "health": .01, "education": .01}},
    {"key": "traveler", "name": "The Traveler", "icon": "plane", "color": "#3B82F6",
     "blurb": "You stack the fastest when you're moving.",
     "weights": {"travel": .30, "transport": .25, "dining": .13, "shopping": .10,
                 "entertainment": .07, "general": .06, "groceries": .04, "bills": .03, "health": .01, "education": .01}},
    {"key": "entertainer", "name": "The Entertainer", "icon": "gamepad-2", "color": "#8B5CF6",
     "blurb": "Streaming, gaming, and going out carry your balance.",
     "weights": {"entertainment": .30, "shopping": .25, "dining": .15, "general": .09,
                 "transport": .07, "travel": .05, "groceries": .04, "bills": .03, "health": .01, "education": .01}},
    {"key": "planner", "name": "The Planner", "icon": "book-open", "color": "#10B981",
     "blurb": "Steady, essential spending. The most consistent way to stack.",
     "weights": {"bills": .22, "education": .20, "health": .20, "groceries": .14,
                 "transport": .08, "general": .06, "dining": .05, "shopping": .03, "travel": .01, "entertainment": .01}},
    {"key": "balanced", "name": "The Balanced", "icon": "scale", "color": "#F59E0B",
     "blurb": "No single category dominates. You earn a little everywhere.",
     "weights": {c: 0.10 for c in CATEGORIES}},
]


def _cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b, strict=False))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    return dot / (na * nb) if na > 1e-9 and nb > 1e-9 else 0.0


def classify_persona(db: Session, user_id: int) -> dict:
    txs = db.query(Transaction).filter(Transaction.user_id == user_id).all()
    if len(txs) < 5:
        return {
            "has_enough_data": False,
            "message": "Five transactions unlocks your spending persona.",
            "transactions_needed": 5 - len(txs),
        }

    spend = defaultdict(float)
    for t in txs:
        spend[t.category] += t.amount_fiat
    total = sum(spend.values()) or 1.0
    vector = [spend.get(c, 0.0) / total for c in CATEGORIES]

    scored = sorted(
        ({"persona": p, "similarity": _cosine(vector, [p["weights"].get(c, 0.0) for c in CATEGORIES])}
         for p in PERSONAS),
        key=lambda s: s["similarity"], reverse=True,
    )
    best, runner = scored[0], scored[1]
    gap = best["similarity"] - runner["similarity"]
    confidence = round(min(0.99, best["similarity"] * (0.75 + min(0.25, gap * 2.5))), 3)

    top = sorted(
        ({"category": c, "share": round(v, 4)} for c, v in zip(CATEGORIES, vector, strict=False) if v > 0),
        key=lambda x: x["share"], reverse=True,
    )[:3]

    p = best["persona"]
    return {
        "has_enough_data": True,
        "persona": {"key": p["key"], "name": p["name"], "icon": p["icon"],
                    "color": p["color"], "blurb": p["blurb"]},
        "confidence": confidence,
        "similarity": round(best["similarity"], 3),
        "runner_up": runner["persona"]["name"],
        "top_categories": top,
        "spending_vector": {c: round(v, 4) for c, v in zip(CATEGORIES, vector, strict=False)},
        "all_scores": [{"name": s["persona"]["name"], "similarity": round(s["similarity"], 3)} for s in scored],
    }
