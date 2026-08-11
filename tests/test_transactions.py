"""Transaction creation, reward payout, idempotency and pagination."""
import pytest

from app.reward_engine import SATS_PER_BTC
from tests.conftest import TEST_BTC_PRICE


def spend(client, headers, amount=100.0, category="dining", merchant="Ramen Keisuke", key=None):
    extra = {"Idempotency-Key": key} if key else {}
    return client.post("/api/transactions", headers={**headers, **extra},
                       json={"amount_fiat": amount, "category": category, "merchant": merchant})


def test_a_purchase_pays_the_category_rate(client, headers):
    r = spend(client, headers, amount=100.0, category="dining")
    assert r.status_code == 200

    body = r.json()
    # dining is 3%: $3 of BTC at $50,000 is 6,000 sats.
    expected = int(round((100.0 * 0.03 / TEST_BTC_PRICE) * SATS_PER_BTC))
    assert body["reward"]["total_sats"] == expected
    assert body["wallet_balance_sats"] == expected


def test_the_wallet_reflects_every_purchase(client, headers):
    for _ in range(3):
        spend(client, headers, amount=50.0)
    total = client.get("/api/wallet", headers=headers).json()["balance_sats"]
    assert total == 3 * int(round((50.0 * 0.03 / TEST_BTC_PRICE) * SATS_PER_BTC))


def test_an_unknown_category_is_rejected(client, headers):
    assert spend(client, headers, category="crypto-mining").status_code == 400


@pytest.mark.parametrize("amount", [0, -25.0, 2_000_000])
def test_out_of_range_amounts_are_rejected(client, headers, amount):
    assert spend(client, headers, amount=amount).status_code == 422


def test_a_boost_doubles_the_reward(client, headers):
    plain = spend(client, headers, amount=100.0, category="dining").json()["reward"]["total_sats"]
    client.post("/api/rewards/boosts/activate", headers=headers, json={"category": "dining"})
    boosted = spend(client, headers, amount=100.0, category="dining").json()["reward"]["total_sats"]
    assert boosted == pytest.approx(plain * 2, rel=0.01)


def test_a_boost_only_applies_to_its_own_category(client, headers):
    client.post("/api/rewards/boosts/activate", headers=headers, json={"category": "dining"})
    r = spend(client, headers, amount=100.0, category="travel").json()
    assert r["reward"]["boost_multiplier"] == 1.0


# ------------------------------------------------------------------ idempotency
def test_a_replayed_idempotency_key_does_not_pay_twice(client, headers):
    """A retry after a timeout, or a double-tap on Confirm, must not double-pay."""
    first = spend(client, headers, key="abc-123")
    assert first.status_code == 200
    balance_after_first = first.json()["wallet_balance_sats"]

    second = spend(client, headers, key="abc-123")

    assert second.status_code == 409
    assert client.get("/api/wallet", headers=headers).json()["balance_sats"] == balance_after_first


def test_different_keys_are_separate_transactions(client, headers):
    spend(client, headers, key="one")
    spend(client, headers, key="two")
    assert client.get("/api/transactions", headers=headers).json()["total"] == 2


def test_the_same_key_from_another_user_is_unrelated(client, headers):
    from tests.conftest import auth_header
    other = auth_header(client, email="other@test.io")
    assert spend(client, headers, key="shared").status_code == 200
    assert spend(client, other, key="shared").status_code == 200


# ------------------------------------------------------------------- pagination
@pytest.mark.parametrize("params", [
    "page=0",           # OFFSET -20; Postgres rejects a negative offset outright
    "page=-5",
    "per_page=0",
    "per_page=100000",  # one request that returns the entire history
])
def test_out_of_range_pagination_is_rejected(client, headers, params):
    assert client.get(f"/api/transactions?{params}", headers=headers).status_code == 422


def test_pagination_walks_the_history(client, headers):
    for i in range(5):
        spend(client, headers, merchant=f"Shop {i}")

    first = client.get("/api/transactions?page=1&per_page=2", headers=headers).json()
    second = client.get("/api/transactions?page=2&per_page=2", headers=headers).json()

    assert first["total"] == 5
    assert first["has_more"] is True
    assert len(first["items"]) == 2
    assert {t["id"] for t in first["items"]}.isdisjoint({t["id"] for t in second["items"]})


def test_history_is_scoped_to_the_signed_in_user(client, headers):
    from tests.conftest import auth_header
    spend(client, headers)
    other = auth_header(client, email="other@test.io")
    assert client.get("/api/transactions", headers=other).json()["total"] == 0


# ---------------------------------------------------------------------- round-up
def test_round_up_converts_spare_change(client, headers):
    client.put("/api/roundup/config", headers=headers,
               json={"is_enabled": True, "multiplier": 2.0})
    body = spend(client, headers, amount=10.40).json()
    # $0.60 spare, doubled to $1.20.
    assert body["round_up"]["spare_usd"] == pytest.approx(1.20, abs=0.01)
    assert body["round_up"]["sats"] > 0


def test_a_whole_dollar_amount_has_no_spare_change(client, headers):
    client.put("/api/roundup/config", headers=headers,
               json={"is_enabled": True, "multiplier": 2.0})
    assert spend(client, headers, amount=10.00).json()["round_up"] is None


# ------------------------------------------------------------------------ preview
def test_preview_matches_what_the_purchase_pays(client, headers):
    preview = client.post("/api/rewards/preview", headers=headers,
                          json={"amount_fiat": 75.0, "category": "travel"}).json()
    actual = spend(client, headers, amount=75.0, category="travel").json()
    assert preview["total_sats"] == actual["reward"]["total_sats"]
