"""Unit tests for the cashback maths. No database, no HTTP."""
import pytest

from app.reward_engine import LEVELS, SATS_PER_BTC, calculate_reward, get_level, round_up_sats

PRICE = 50_000.0


def test_base_reward_is_the_rate_applied_to_the_spend():
    r = calculate_reward(100.0, "dining", PRICE, base_rate=0.03)
    assert r["base_sats"] == int(round((100.0 * 0.03 / PRICE) * SATS_PER_BTC))
    assert r["total_sats"] == r["base_sats"]


def test_the_parts_sum_to_the_total():
    r = calculate_reward(250.0, "travel", PRICE, base_rate=0.03,
                         user_level_multiplier=1.2, boost_multiplier=2.0)
    assert r["base_sats"] + r["level_bonus"] + r["boost_bonus"] == r["total_sats"]


def test_multipliers_compound_into_the_effective_rate():
    r = calculate_reward(100.0, "dining", PRICE, base_rate=0.03,
                         user_level_multiplier=1.5, boost_multiplier=2.0)
    assert r["effective_rate"] == pytest.approx(0.03 * 1.5 * 2.0)


def test_an_unknown_category_falls_back_to_the_default_rate():
    assert calculate_reward(100.0, "not-a-category", PRICE)["cashback_rate"] == 0.015


def test_a_higher_price_buys_fewer_sats_for_the_same_spend():
    cheap = calculate_reward(100.0, "dining", 20_000.0, base_rate=0.03)["total_sats"]
    dear = calculate_reward(100.0, "dining", 80_000.0, base_rate=0.03)["total_sats"]
    assert cheap > dear


# --------------------------------------------------------------------- levels
@pytest.mark.parametrize("sats,expected", [
    (0, "bronze"), (9_999, "bronze"),
    (10_000, "silver"), (49_999, "silver"),
    (50_000, "gold"), (200_000, "platinum"),
    (1_000_000, "diamond"), (99_000_000, "diamond"),
])
def test_level_boundaries(sats, expected):
    assert get_level(sats)["key"] == expected


def test_progress_runs_from_zero_to_one_within_a_level():
    assert get_level(10_000)["progress"] == pytest.approx(0.0)
    assert get_level(30_000)["progress"] == pytest.approx(0.5)


def test_the_top_level_has_nowhere_left_to_go():
    top = get_level(5_000_000)
    assert top["next_level"] is None
    assert top["progress"] == 1.0
    assert top["sats_to_next"] == 0


def test_levels_are_ordered_and_multipliers_increase():
    assert [lvl["min_sats"] for lvl in LEVELS] == sorted(lvl["min_sats"] for lvl in LEVELS)
    assert [lvl["multiplier"] for lvl in LEVELS] == sorted(lvl["multiplier"] for lvl in LEVELS)


# -------------------------------------------------------------------- round-up
def test_round_up_takes_the_spare_change_to_the_next_dollar():
    spare_usd, sats = round_up_sats(10.40, multiplier=1.0, btc_price=PRICE)
    assert spare_usd == pytest.approx(0.60)
    assert sats == int(round((0.60 / PRICE) * SATS_PER_BTC))


def test_round_up_scales_by_the_multiplier():
    assert round_up_sats(10.40, 3.0, PRICE)[0] == pytest.approx(1.80)


def test_a_whole_dollar_amount_has_no_spare_change():
    assert round_up_sats(10.00, 2.0, PRICE) == (0.0, 0)


# ------------------------------------------------- found by evaluation/rewards.py
def test_no_boost_means_no_boost_line_on_the_receipt():
    """Regression: rounding each part separately put a "+1 sat boost" on 18% of
    purchases with no boost active. This purchase was one of them."""
    r = calculate_reward(3686.91, "general", 28363.639231850066, base_rate=0.02,
                         user_level_multiplier=1.5, boost_multiplier=1.0)
    assert r["boost_bonus"] == 0
    assert r["base_sats"] + r["level_bonus"] == r["total_sats"]


@pytest.mark.parametrize("amount", [0.01, 0.99, 7.77, 123.45, 3686.91, 99_999.99])
@pytest.mark.parametrize("level", [1.0, 1.1, 1.2, 1.3, 1.5])
@pytest.mark.parametrize("boost", [1.0, 2.0])
def test_breakdown_parts_are_never_negative_and_always_sum(amount, level, boost):
    r = calculate_reward(amount, "general", 61_234.5, base_rate=0.015,
                         user_level_multiplier=level, boost_multiplier=boost)
    assert r["level_bonus"] >= 0 and r["boost_bonus"] >= 0
    assert r["base_sats"] + r["level_bonus"] + r["boost_bonus"] == r["total_sats"]
    if level == 1.0:
        assert r["level_bonus"] == 0


def test_half_a_cent_of_spare_change_rounds_up():
    """Regression: $0.39 x 1.5 = $0.585 was shown as $0.58 (0.585 is stored as
    0.58499... in floating point)."""
    assert round_up_sats(21256.61, 1.5, PRICE)[0] == 0.59
    assert round_up_sats(30478.95, 1.5, PRICE)[0] == 0.08
