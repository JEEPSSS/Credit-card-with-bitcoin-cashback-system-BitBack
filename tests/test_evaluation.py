"""The evaluation harness and the rule engines it measures.

The harness produces numbers the report quotes, so its own building blocks
are tested: a reproduction of a retired model must still reproduce it, and
the app behaviour an evaluation changed must stay changed.
"""
import random
from datetime import timedelta

import pytest

from app.clock import utcnow
from app.models import CategoryCashback, Transaction
from app.reward_engine import DEFAULT_RATES
from app.smart_recommender import recommend_boost
from evaluation import recommender as R
from evaluation.stats import bootstrap_ci, summary


def seed_categories(db):
    db.add_all([CategoryCashback(category=c, base_rate=r, icon="x", description=c)
                for c, r in DEFAULT_RATES.items()])
    db.commit()


def spend(db, user_id, category, amount, when):
    db.add(Transaction(user_id=user_id, amount_fiat=amount, category=category,
                       merchant=f"{category} shop", btc_price_at_time=60_000.0,
                       sats_earned=0, created_at=when))


# ------------------------------------------------------------ boost ranking
def test_a_boost_is_ranked_by_what_it_is_worth_not_by_spend(db, user_factory):
    """$300 of dining at 3% is worth more boosted than $600 of bills at 1%.

    The v1 weighted score ranked bills first here: it added volume and rate
    instead of multiplying them.
    """
    seed_categories(db)
    user = user_factory("boost@test.io")
    now = utcnow()
    for i in range(10):
        spend(db, user.id, "dining", 30.0, now - timedelta(days=i + 1))
        spend(db, user.id, "bills", 60.0, now - timedelta(days=i + 1))
    db.commit()

    ranked = [r["category"] for r in recommend_boost(db, user.id)["recommendations"]]
    assert ranked == ["dining", "bills"]


def test_the_backtest_date_hides_everything_after_it(db, user_factory):
    seed_categories(db)
    user = user_factory("asof@test.io")
    as_of = utcnow() - timedelta(days=30)
    for i in range(5):
        spend(db, user.id, "dining", 20.0, as_of - timedelta(days=i + 1))
        spend(db, user.id, "travel", 900.0, as_of + timedelta(days=i + 1))  # the future
    db.commit()

    result = recommend_boost(db, user.id, as_of=as_of)
    assert [r["category"] for r in result["recommendations"]] == ["dining"]


def test_the_response_shape_the_app_reads_is_unchanged(db, user_factory):
    seed_categories(db)
    user = user_factory("shape@test.io")
    for i in range(4):
        spend(db, user.id, "dining", 20.0, utcnow() - timedelta(days=i + 1))
    db.commit()
    pick = recommend_boost(db, user.id)["top_pick"]
    assert {"category", "score", "predicted_extra_usd", "explanation", "factors",
            "trend", "recency"} <= set(pick)
    assert 0 <= pick["score"] <= 100


# Rankings produced by the ORIGINAL v1 app code on these exact simulated
# cardholders (rng seed 99), recorded before the app changed. v1_rank must
# keep reproducing them, or the report's before/after comparison is void.
V1_EXPECTED = [
    ["travel", "general", "shopping", "dining", "transport", "health", "entertainment"],
    ["travel", "transport", "education", "dining", "bills", "health", "general"],
    ["education", "dining", "groceries", "shopping", "entertainment", "transport", "bills"],
    ["education", "bills", "general", "entertainment", "travel", "groceries", "dining"],
    ["travel", "groceries", "entertainment", "bills", "dining", "education", "health"],
    ["shopping", "health", "dining", "transport", "groceries", "education"],
    ["groceries", "health", "dining", "shopping", "travel"],
    ["education", "shopping", "entertainment", "general", "groceries"],
    ["shopping", "education", "dining", "bills", "groceries", "entertainment", "health"],
]


def test_the_v1_reproduction_matches_the_original_model(db):
    seed_categories(db)
    rng = random.Random(99)
    as_of = R.START + timedelta(days=R.HISTORY_DAYS)
    got = []
    for population in R.POPULATIONS:
        for i in range(3):
            user_id, _ = R._simulate(db, rng, population, i)
            got.append(R.v1_rank(R._history(db, user_id, as_of, R.HISTORY_DAYS), as_of))
    assert got == V1_EXPECTED


# -------------------------------------------------------------------- stats
def test_the_bootstrap_interval_brackets_the_mean():
    values = [0.0, 1.0] * 50
    lo, hi = bootstrap_ci(values)
    assert lo < 0.5 < hi
    assert summary(values)["mean"] == 0.5


def test_a_constant_has_no_uncertainty():
    lo, hi = bootstrap_ci([0.7] * 30)
    assert lo == pytest.approx(0.7) and hi == pytest.approx(0.7)


# ------------------------------------------------- suites, at smoke-test size
def test_the_reward_engine_holds_every_property():
    """The full suite checks 200,000 purchases; 5,000 keeps CI fast."""
    from evaluation import rewards

    r = rewards.evaluate(purchases=5_000)
    assert all(v == 0 for v in r["breakdown_violations"]["current"].values())
    assert r["total_vs_exact"]["cases_off_by_more_than_half_a_sat"] == 0
    assert all(v == 0 for k, v in r["monotonicity"].items() if k != "checked")
    assert r["levels"]["problems"] == []
    assert r["round_up"]["spare_change_mismatches_vs_exact"] == 0
    assert r["effective_rate_field_mismatches"] == 0


def test_the_persona_suite_measures_a_known_persona_correctly():
    from evaluation import persona

    r = persona.evaluate(per_cell=10)
    # Classified from their true spending mix, textbook cardholders are always right.
    assert r["accuracy"]["textbook"]["ceiling_true_mix"]["mean"] == 1.0
    assert set(r["confusion_at_20_purchases"]["rows_are_truth"]) == set(persona.KEYS)


def test_the_gamification_simulation_runs_the_real_badge_code(db):
    from evaluation import gamification

    r = gamification.evaluate(db, users_per_archetype=1)
    assert r["badges"]["heavy"]["first_swipe"]["by_day_7"] == 1.0
    assert set(r["levels"]["light"]) == {"silver", "gold", "platinum", "diamond"}
