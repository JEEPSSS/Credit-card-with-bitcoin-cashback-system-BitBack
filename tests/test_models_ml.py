"""The analytical models, tested directly against constructed histories.

These are the claims the report makes about the models, written as assertions:
the forecast tracks flat, growing and collapsing series without extrapolating a
recent trend forever, and the persona classifier separates the profiles it
defines.
"""
from datetime import timedelta

import pytest

from app.anomaly_detector import (
    ANOMALY_THRESHOLD,
    MIN_TRAIN_SIZE,
    _heuristic_score,
    score_transaction,
)
from app.clock import utcnow
from app.ml_forecast import HORIZON_DAYS, forecast_earnings
from app.models import RewardEvent, Transaction
from app.spending_persona import classify_persona


@pytest.fixture
def user(user_factory):
    return user_factory("model@test.io")


def add_rewards(db, user_id, weekly_sats: list[int], per_week: int = 4):
    """Lay down `weekly_sats[i]` spread over week i, oldest first."""
    weeks = len(weekly_sats)
    start = utcnow() - timedelta(days=weeks * 7 - 1)
    for i, total in enumerate(weekly_sats):
        if total <= 0:
            continue
        each = total // per_week
        for j in range(per_week):
            db.add(RewardEvent(
                user_id=user_id, transaction_id=0, btc_amount=each, btc_price=50_000.0,
                cashback_rate=0.02, category="dining",
                created_at=start + timedelta(days=i * 7 + j),
            ))
    db.commit()


# ------------------------------------------------------------------- forecast
def test_forecast_needs_history_before_it_will_speak(db, user):
    result = forecast_earnings(db, user.id)
    assert result["has_enough_data"] is False
    assert result["predicted_sats_30d"] == 0


def test_a_flat_series_forecasts_the_flat_rate(db, user):
    add_rewards(db, user.id, [10_000] * 12)
    result = forecast_earnings(db, user.id)

    assert result["has_enough_data"] is True
    assert result["trend_direction"] == "stable"
    # 30 days is ~4.3 weeks of a 10,000/week run rate.
    expected = 10_000 * HORIZON_DAYS / 7
    assert result["predicted_sats_30d"] == pytest.approx(expected, rel=0.25)


def test_a_growing_series_is_reported_as_increasing(db, user):
    add_rewards(db, user.id, [2_000 * (i + 1) for i in range(12)])
    result = forecast_earnings(db, user.id)
    assert result["trend_direction"] == "increasing"


def test_a_collapsing_series_is_reported_as_decreasing(db, user):
    add_rewards(db, user.id, [30_000 - 2_000 * i for i in range(12)])
    result = forecast_earnings(db, user.id)
    assert result["trend_direction"] == "decreasing"


def test_damping_stops_a_spike_extrapolating_forever(db, user):
    """Undamped Holt projects the last trend linearly without bound.

    A single big final week must not imply the user keeps accelerating at that
    rate for the whole horizon.
    """
    add_rewards(db, user.id, [5_000] * 11 + [80_000])
    result = forecast_earnings(db, user.id)

    naive_linear = 80_000 * HORIZON_DAYS / 7
    assert result["predicted_sats_30d"] < naive_linear


def test_the_forecast_is_never_negative(db, user):
    add_rewards(db, user.id, [40_000, 30_000, 20_000, 10_000, 5_000, 2_000,
                              1_000, 500, 200, 100, 50, 10])
    assert forecast_earnings(db, user.id)["predicted_sats_30d"] >= 0


def test_the_bounds_bracket_the_prediction(db, user):
    add_rewards(db, user.id, [10_000] * 12)
    r = forecast_earnings(db, user.id)
    assert r["lower_bound"] <= r["predicted_sats_30d"] <= r["upper_bound"]


def test_a_new_account_with_flat_earnings_is_not_reported_as_growing(db, user):
    """Regression: empty weeks before signup were counted as zero-earning weeks.

    The lookback window is 13 weeks, so a user active for three of them had ten
    zeros prepended to their series. That fits a strongly positive slope and the
    app congratulated every new account on growth it had not had.
    """
    add_rewards(db, user.id, [10_000] * 3)
    assert forecast_earnings(db, user.id)["trend_direction"] == "stable"


def test_a_quiet_week_inside_an_active_history_is_kept(db, user):
    """Interior zeros are real signal and must not be trimmed away."""
    add_rewards(db, user.id, [10_000] * 5 + [0] + [10_000] * 5)
    result = forecast_earnings(db, user.id)
    assert result["has_enough_data"] is True
    assert result["trend_direction"] == "stable"


def test_both_component_models_are_reported(db, user):
    add_rewards(db, user.id, [10_000] * 12)
    comparison = forecast_earnings(db, user.id)["model_comparison"]
    assert set(comparison) == {"linear_regression", "holt_damped", "blend_weights"}
    assert comparison["blend_weights"] == {"holt": 0.6, "linear": 0.4}


# -------------------------------------------------------------------- persona
def add_spend(db, user_id, by_category: dict[str, float]):
    for i, (category, amount) in enumerate(by_category.items()):
        for j in range(3):
            db.add(Transaction(
                user_id=user_id, amount_fiat=amount / 3, category=category,
                merchant=f"{category}-{j}", btc_price_at_time=50_000.0, sats_earned=100,
                created_at=utcnow() - timedelta(days=i * 3 + j),
            ))
    db.commit()


def test_persona_needs_five_transactions(db, user):
    result = classify_persona(db, user.id)
    assert result["has_enough_data"] is False
    assert result["transactions_needed"] == 5


@pytest.mark.parametrize("profile,expected", [
    ({"dining": 700, "groceries": 500, "entertainment": 100}, "foodie"),
    ({"travel": 900, "transport": 600, "dining": 100}, "traveler"),
    ({"entertainment": 800, "shopping": 600, "dining": 100}, "entertainer"),
    ({"bills": 600, "education": 500, "health": 500}, "planner"),
])
def test_each_persona_is_recognised_from_its_own_profile(db, user, profile, expected):
    add_spend(db, user.id, profile)
    assert classify_persona(db, user.id)["persona"]["key"] == expected


def test_the_spending_vector_is_a_distribution(db, user):
    add_spend(db, user.id, {"dining": 600, "travel": 400})
    vector = classify_persona(db, user.id)["spending_vector"]
    assert sum(vector.values()) == pytest.approx(1.0, abs=0.001)


def test_confidence_stays_in_range(db, user):
    add_spend(db, user.id, {"dining": 700, "groceries": 500, "entertainment": 100})
    assert 0.0 <= classify_persona(db, user.id)["confidence"] <= 0.99


# ---------------------------------------------------------------------- fraud
def test_the_heuristic_flags_an_extreme_amount():
    normal = _heuristic_score({"amount_zscore": 0.2, "category_frequency": 0.4,
                               "time_since_last_tx": 10.0, "hour_of_day": 0.5,
                               "amount_vs_global_avg": 1.1, "merchant_is_new": 0.0})
    extreme = _heuristic_score({"amount_zscore": 6.0, "category_frequency": 0.01,
                                "time_since_last_tx": 2.0, "hour_of_day": 0.1,
                                "amount_vs_global_avg": 12.0, "merchant_is_new": 1.0})
    assert normal < ANOMALY_THRESHOLD <= extreme


def test_a_short_history_falls_back_to_the_heuristic(db, user):
    tx = Transaction(user_id=user.id, amount_fiat=40.0, category="dining",
                     merchant="Cafe", btc_price_at_time=50_000.0, sats_earned=100,
                     created_at=utcnow())
    db.add(tx)
    db.commit()
    assert score_transaction(db, user.id, tx).model_version == "heuristic-v1"


def _build_history(db, user_id, n=MIN_TRAIN_SIZE + 40):
    base = utcnow() - timedelta(days=n)
    for i in range(n):
        db.add(Transaction(
            user_id=user_id, amount_fiat=30.0 + (i % 7), category="dining",
            merchant=f"Regular {i % 4}", btc_price_at_time=50_000.0, sats_earned=100,
            created_at=base + timedelta(days=i, hours=12),
        ))
    db.commit()


def test_a_trained_model_takes_over_once_there_is_enough_history(db, user):
    _build_history(db, user.id)
    tx = Transaction(user_id=user.id, amount_fiat=32.0, category="dining",
                     merchant="Regular 1", btc_price_at_time=50_000.0, sats_earned=100,
                     created_at=utcnow())
    db.add(tx)
    db.commit()
    assert score_transaction(db, user.id, tx).model_version == "iforest-v1"


def test_a_wildly_abnormal_purchase_scores_higher_than_a_routine_one(db, user):
    _build_history(db, user.id)
    now = utcnow()

    routine = Transaction(user_id=user.id, amount_fiat=32.0, category="dining",
                          merchant="Regular 1", btc_price_at_time=50_000.0,
                          sats_earned=100, created_at=now)
    strange = Transaction(user_id=user.id, amount_fiat=4_000.0, category="travel",
                          merchant="Sky Charter Ltd", btc_price_at_time=50_000.0,
                          sats_earned=100, created_at=now.replace(hour=3))
    db.add_all([routine, strange])
    db.commit()

    assert (score_transaction(db, user.id, strange).risk_score
            > score_transaction(db, user.id, routine).risk_score)


def test_scores_stay_inside_the_reported_scale(db, user):
    _build_history(db, user.id)
    tx = Transaction(user_id=user.id, amount_fiat=900.0, category="shopping",
                     merchant="Nowhere", btc_price_at_time=50_000.0, sats_earned=100,
                     created_at=utcnow())
    db.add(tx)
    db.commit()
    assert 0 <= score_transaction(db, user.id, tx).risk_score <= 100
