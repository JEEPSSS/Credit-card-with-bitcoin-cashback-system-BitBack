"""How the service behaves when the world around it misbehaves.

The price provider fails, the instance restarts with nothing cached, a client
lies about its address. None of these show up in a happy-path test, and all of
them happen on a free cloud deployment.
"""
import time

import pytest

import main
from app import btc_service
from app.config import settings
from app.models import Notification, PriceAlert
from tests.test_transactions import spend


def failing():
    raise ConnectionError("provider unreachable")


@pytest.fixture
def cold_cache():
    """A freshly started process: nothing fetched yet."""
    btc_service.reset()
    yield
    btc_service.set_cached_price(50_000.0)


@pytest.fixture
def production(monkeypatch):
    monkeypatch.setattr(settings, "environment", "production")


# ------------------------------------------------------------------- price
def test_a_second_provider_covers_the_first(monkeypatch, cold_cache):
    monkeypatch.setattr(btc_service, "PROVIDERS",
                        [("coingecko", failing), ("coinbase", lambda: (61_000.0, 0.0))])
    snap = btc_service.get_btc_price()
    assert snap["price"] == 61_000.0
    assert snap["source"] == "coinbase"
    assert snap["stale"] is False


def test_a_failed_fetch_is_not_retried_on_every_request(monkeypatch, cold_cache):
    """Regression: once the cache expired, every request made a fresh network
    call, so a provider outage put a multi-second timeout on each of them."""
    calls = []

    def counting_failure():
        calls.append(1)
        raise ConnectionError

    monkeypatch.setattr(btc_service, "PROVIDERS", [("coingecko", counting_failure)])
    for _ in range(5):
        btc_service.get_btc_price()
    assert len(calls) == 1


def test_a_price_that_was_never_fetched_is_marked_stale(monkeypatch, cold_cache):
    monkeypatch.setattr(btc_service, "PROVIDERS", [("coingecko", failing)])
    snap = btc_service.get_btc_price()
    assert snap["price"] == settings.btc_price_fallback_usd
    assert snap["source"] == "fallback"
    assert snap["stale"] is True


def test_production_declines_a_reward_at_an_invented_price(
        client, headers, monkeypatch, cold_cache, production):
    """Regression: with no price ever fetched, rewards were paid at the
    configured fallback of $65,000 whatever bitcoin actually cost."""
    monkeypatch.setattr(btc_service, "PROVIDERS", [("coingecko", failing)])
    r = spend(client, headers)
    assert r.status_code == 503
    assert client.get("/api/transactions", headers=headers).json()["total"] == 0


def test_production_declines_a_reward_at_an_old_price(client, headers, monkeypatch, production):
    btc_service.set_cached_price(50_000.0)
    long_ago = time.time() - settings.btc_price_max_age_seconds - 60
    btc_service._cache.update(fetched_at=long_ago, attempted_at=time.time())
    assert spend(client, headers).status_code == 503


def test_development_still_works_offline(client, headers, monkeypatch, cold_cache):
    monkeypatch.setattr(btc_service, "PROVIDERS", [("coingecko", failing)])
    assert spend(client, headers).status_code == 200


def test_the_price_endpoint_says_when_it_is_stale(client, monkeypatch, cold_cache):
    monkeypatch.setattr(btc_service, "PROVIDERS", [("coingecko", failing)])
    body = client.get("/api/btc/price").json()
    assert body["stale"] is True
    assert body["age_seconds"] is None


# ------------------------------------------------------------------ alerts
def _alert(db, user_factory, target=40_000.0):
    user = user_factory("alerts@test.io")
    db.add(PriceAlert(user_id=user.id, target_price=target, direction="above"))
    db.commit()
    return user


def test_alerts_fire_against_a_live_price(db, SessionLocal, user_factory, monkeypatch):
    monkeypatch.setattr(main, "SessionLocal", SessionLocal)
    user = _alert(db, user_factory)
    btc_service.set_cached_price(50_000.0)
    assert main._sweep_alerts() == 1
    assert db.query(Notification).filter(Notification.user_id == user.id).count() == 1


def test_alerts_never_fire_against_the_fallback_price(
        db, SessionLocal, user_factory, monkeypatch, cold_cache):
    """The fallback is a placeholder, not a market observation."""
    monkeypatch.setattr(main, "SessionLocal", SessionLocal)
    monkeypatch.setattr(btc_service, "PROVIDERS", [("coingecko", failing)])
    _alert(db, user_factory, target=10_000.0)      # below the fallback price
    assert main._sweep_alerts() == 0


# ------------------------------------------------------------------ health
def test_health_checks_the_database(client):
    body = client.get("/api/health").json()
    assert body["status"] == "ok"
    assert body["database"] == "ok"


# ---------------------------------------------------------------- client ip
def test_x_forwarded_for_can_be_spoofed_by_the_client(client, monkeypatch):
    """Documents why the source is configurable: the first X-Forwarded-For
    entry is whatever the client sent."""
    monkeypatch.setattr(settings, "client_ip_source", "x-forwarded-for")
    r = client.get("/api/meta/client-ip", headers={"X-Forwarded-For": "6.6.6.6"})
    assert r.json()["ip"] == "6.6.6.6"


def test_cf_connecting_ip_ignores_a_spoofed_forwarded_for(client, monkeypatch):
    monkeypatch.setattr(settings, "client_ip_source", "cf-connecting-ip")
    r = client.get("/api/meta/client-ip", headers={
        "X-Forwarded-For": "6.6.6.6", "CF-Connecting-IP": "203.0.113.7"})
    assert r.json()["ip"] == "203.0.113.7"


def test_a_spoofed_header_cannot_dodge_the_signup_limit(client, monkeypatch):
    """With the right source configured, rotating X-Forwarded-For buys nothing."""
    monkeypatch.setattr(settings, "client_ip_source", "cf-connecting-ip")
    codes = [
        client.post("/api/auth/register",
                    headers={"X-Forwarded-For": f"10.0.0.{i}", "CF-Connecting-IP": "203.0.113.7"},
                    json={"email": f"farm{i}@test.io", "password": "password123",
                          "display_name": "Farm"}).status_code
        for i in range(8)
    ]
    assert 429 in codes


# -------------------------------------------------------------- request ids
def test_every_response_carries_a_request_id(client):
    assert len(client.get("/api/health").headers["X-Request-ID"]) == 12


def test_a_well_formed_caller_id_is_kept_and_anything_else_replaced(client):
    kept = client.get("/api/health", headers={"X-Request-ID": "app-7f3a9c"})
    assert kept.headers["X-Request-ID"] == "app-7f3a9c"
    hostile = client.get("/api/health", headers={"X-Request-ID": "x\\nFAKE LOG LINE"})
    assert hostile.headers["X-Request-ID"] != "x\\nFAKE LOG LINE"


def test_a_500_gives_the_user_a_reference_and_nothing_else(client, monkeypatch):
    from fastapi.testclient import TestClient

    from app.routers import market

    def broken():
        raise RuntimeError("secret internal detail")

    monkeypatch.setattr(market, "get_btc_price", broken)
    with TestClient(main.app, raise_server_exceptions=False) as c:
        r = c.get("/api/btc/price")
    assert r.status_code == 500
    assert "secret" not in r.text
    assert r.json()["reference"] == r.headers["X-Request-ID"]
