"""Analytics, and the valuation rule that runs through them."""
import pytest

from app import btc_service
from tests.conftest import TEST_BTC_PRICE
from tests.test_transactions import spend


def test_effective_rate_uses_the_price_at_the_time_of_earning(client, headers):
    """Regression: the rate was computed against whatever BTC costs today.

    A reward is income at the moment it is received, valued at the price at that
    moment - which is why `RewardEvent.btc_price` is stored. Valuing historical
    rewards at the current price made the reported cashback rate move with the
    market instead of describing the card, and disagreed with the tax report,
    which had it right.
    """
    spend(client, headers, amount=100.0, category="dining")   # 3% at $50,000

    before = client.get("/api/analytics/insights", headers=headers).json()["effective_rate"]
    btc_service.set_cached_price(TEST_BTC_PRICE * 2)          # bitcoin doubles
    after = client.get("/api/analytics/insights", headers=headers).json()["effective_rate"]

    assert before == pytest.approx(0.03, abs=0.001)
    assert after == before, "the reported rate moved with the market"


def test_the_tax_report_and_insights_agree(client, headers):
    spend(client, headers, amount=100.0, category="dining")
    btc_service.set_cached_price(TEST_BTC_PRICE * 3)

    rate = client.get("/api/analytics/insights", headers=headers).json()["effective_rate"]
    csv_body = client.get("/api/tax/report", headers=headers).text
    fair_value = float(csv_body.strip().splitlines()[1].split(",")[5])

    assert fair_value / 100.0 == pytest.approx(rate, abs=0.001)


def test_insights_are_empty_before_any_spending(client, headers):
    assert client.get("/api/analytics/insights", headers=headers).json()["has_data"] is False


def test_spending_breaks_down_by_category(client, headers):
    spend(client, headers, amount=100.0, category="dining")
    spend(client, headers, amount=50.0, category="travel")

    body = client.get("/api/analytics/spending?period=30d", headers=headers).json()

    assert body["total_spent"] == pytest.approx(150.0)
    assert [c["category"] for c in body["categories"]] == ["dining", "travel"]
    assert body["categories"][0]["share"] == pytest.approx(2 / 3, abs=0.01)


@pytest.mark.parametrize("period", ["7d", "30d", "90d", "all"])
def test_every_documented_period_is_accepted(client, headers, period):
    assert client.get(f"/api/analytics/spending?period={period}",
                      headers=headers).status_code == 200


def test_an_unknown_period_is_rejected(client, headers):
    assert client.get("/api/analytics/spending?period=eternity",
                      headers=headers).status_code == 422


def test_wallet_growth_measures_the_period_not_the_first_point(client, headers):
    """Growth is what accrued during the window.

    Measuring `last - first` undercounted, because the first point already
    includes day zero's activity.
    """
    earned = spend(client, headers, amount=100.0).json()["reward"]["total_sats"]
    body = client.get("/api/wallet/growth?period=7d", headers=headers).json()
    assert body["growth_sats"] == earned


def test_wallet_growth_series_covers_the_whole_period(client, headers):
    body = client.get("/api/wallet/growth?period=30d", headers=headers).json()
    assert len(body["points"]) == 31


def test_recap_needs_a_month_of_data(client, headers):
    assert client.get("/api/analytics/recap", headers=headers).json()["has_data"] is False


def test_a_solo_user_is_not_ranked_against_themselves(client, headers):
    """With no peers the percentile is neutral, not zero."""
    spend(client, headers, amount=100.0)
    assert client.get("/api/analytics/recap", headers=headers).json()["percentile"] == 50
