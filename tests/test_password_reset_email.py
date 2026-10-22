"""Password-reset email: who gets one, what it says, and what it never reveals."""
import httpx
import pytest

from app import mailer
from app.config import settings
from tests.conftest import register


@pytest.fixture
def outbox(monkeypatch):
    """Configure email and capture what would be posted to Resend."""
    monkeypatch.setattr(settings, "demo_mode", False)
    monkeypatch.setattr(settings, "resend_api_key", "re_test")
    monkeypatch.setattr(settings, "email_from", "BitBack <no-reply@example.com>")
    monkeypatch.setattr(settings, "public_base_url", "https://bitback.example/")
    sent = []

    def fake_post(url, headers, json, timeout):
        sent.append({"url": url, "headers": headers, "json": json})
        return httpx.Response(200, json={"id": "test"})

    monkeypatch.setattr(mailer.httpx, "post", fake_post)
    return sent


def _token_from(message) -> str:
    return message["json"]["text"].split("#token=")[1].split()[0]


def test_a_registered_address_gets_a_working_link(client, outbox):
    register(client)
    r = client.post("/api/auth/forgot-password", json={"email": "User@Test.io"})

    assert r.status_code == 200
    assert "reset_token" not in r.json()
    assert len(outbox) == 1
    message = outbox[0]
    assert message["url"] == mailer.RESEND_URL
    assert message["headers"]["Authorization"] == "Bearer re_test"
    assert message["json"]["to"] == ["user@test.io"]
    assert "https://bitback.example/reset-password#token=" in message["json"]["text"]
    assert "https://bitback.example/reset-password#token=" in message["json"]["html"]

    reset = client.post("/api/auth/reset-password",
                        json={"token": _token_from(message), "new_password": "brandnew123"})
    assert reset.status_code == 200
    assert client.post("/api/auth/login", json={"email": "user@test.io",
                                                "password": "brandnew123"}).status_code == 200


def test_an_unknown_address_gets_nothing_and_the_same_response(client, outbox):
    register(client)
    known = client.post("/api/auth/forgot-password", json={"email": "user@test.io"})
    unknown = client.post("/api/auth/forgot-password", json={"email": "nobody@test.io"})

    assert known.content == unknown.content
    assert [m["json"]["to"] for m in outbox] == [["user@test.io"]]


def test_without_email_the_endpoint_says_so_instead_of_promising_a_link(client, monkeypatch):
    """Regression: the response promised a link that was never sent."""
    monkeypatch.setattr(settings, "demo_mode", False)
    monkeypatch.setattr(settings, "resend_api_key", None)
    register(client)

    known = client.post("/api/auth/forgot-password", json={"email": "user@test.io"})
    unknown = client.post("/api/auth/forgot-password", json={"email": "nobody@test.io"})

    assert "not available" in known.json()["message"]
    assert known.content == unknown.content


def test_a_provider_failure_is_logged_without_the_token(client, monkeypatch, outbox, caplog):
    def broken(*args, **kwargs):
        raise httpx.ConnectError("down")

    monkeypatch.setattr(mailer.httpx, "post", broken)
    register(client)
    r = client.post("/api/auth/forgot-password", json={"email": "user@test.io"})

    assert r.status_code == 200
    assert "email send failed" in caplog.text
    assert "token" not in caplog.text and "user@test.io" not in caplog.text


def test_one_inbox_cannot_be_flooded_from_many_addresses(client, outbox):
    register(client)
    codes = [client.post("/api/auth/forgot-password", json={"email": "user@test.io"},
                         headers={"X-Forwarded-For": f"203.0.113.{i}"}).status_code
             for i in range(5)]

    assert codes == [200, 200, 200, 429, 429]
    assert len(outbox) == 3


def test_the_reset_page_is_served_without_caching(client):
    r = client.get("/reset-password")

    assert r.status_code == 200
    assert "text/html" in r.headers["content-type"]
    assert r.headers["cache-control"] == "no-store"
    assert r.headers["referrer-policy"] == "no-referrer"
    assert "/api/auth/reset-password" in r.text


def test_the_privacy_policy_names_the_email_provider_only_when_it_is_used(client, monkeypatch):
    monkeypatch.setattr(settings, "resend_api_key", None)
    assert "Resend" not in client.get("/privacy").text
    monkeypatch.setattr(settings, "resend_api_key", "re_test")
    monkeypatch.setattr(settings, "email_from", "BitBack <no-reply@example.com>")
    monkeypatch.setattr(settings, "public_base_url", "https://bitback.example")
    assert "Resend" in client.get("/privacy").text
