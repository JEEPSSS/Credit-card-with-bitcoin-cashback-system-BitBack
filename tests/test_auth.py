"""Registration, sign-in, referrals and two-factor authentication."""
import pyotp
import pytest

from app.config import settings
from app.models import ReferralCode, WalletBalance
from tests.conftest import auth_header, register


def test_register_returns_a_session(client):
    r = register(client)
    assert r.status_code == 200
    assert r.json()["access_token"]
    assert r.json()["user"]["email"] == "user@test.io"


def test_email_is_normalised_and_unique(client):
    assert register(client, email="Mixed@Test.io").status_code == 200
    assert register(client, email="mixed@test.io").status_code == 400


def test_login_rejects_a_wrong_password(client):
    register(client)
    assert client.post("/api/auth/login",
                       json={"email": "user@test.io", "password": "wrong"}).status_code == 401


def test_me_requires_a_token(client):
    assert client.get("/api/auth/me").status_code == 401


def test_short_password_is_rejected(client):
    assert register(client, password="short").status_code == 422


# --------------------------------------------------------------------- referrals
def _code_for(client, db, email) -> str:
    header = auth_header(client, email=email)
    user_id = client.get("/api/auth/me", headers=header).json()["id"]
    return db.query(ReferralCode).filter(ReferralCode.user_id == user_id).first().code


def test_registering_with_a_referral_code_succeeds(client, db):
    """Regression: this returned 500 for every valid code.

    `register` queued a WalletBalance with `add_all` and then called
    `get_wallet`, whose SELECT could not see the pending row while autoflush was
    disabled. A second WalletBalance was inserted and the commit died on the
    unique constraint. An invalid code skipped that branch entirely, which is
    why the happy path looked fine.
    """
    code = _code_for(client, db, "referrer@test.io")

    r = register(client, email="referee@test.io", referral_code=code)

    assert r.status_code == 200, r.text
    referee_id = r.json()["user"]["id"]
    wallets = db.query(WalletBalance).filter(WalletBalance.user_id == referee_id).all()
    assert len(wallets) == 1, "a second wallet row was created"


def test_both_sides_of_a_referral_are_paid(client, db):
    code = _code_for(client, db, "referrer@test.io")
    referrer_id = db.query(ReferralCode).filter(ReferralCode.code == code).first().user_id

    r = register(client, email="referee@test.io", referral_code=code)
    referee_id = r.json()["user"]["id"]

    db.expire_all()
    balance = {w.user_id: w.balance_sats for w in db.query(WalletBalance)}
    assert balance[referrer_id] == settings.referrer_bonus_sats
    assert balance[referee_id] == settings.referral_welcome_sats


def test_an_unknown_referral_code_is_ignored(client, db):
    r = register(client, email="referee@test.io", referral_code="NOTACODE")
    assert r.status_code == 200
    wallet = db.query(WalletBalance).filter(
        WalletBalance.user_id == r.json()["user"]["id"]).first()
    assert wallet.balance_sats == 0


def test_registration_is_rate_limited(client):
    """Registration pays a bonus, so it cannot be an unlimited endpoint."""
    codes = [register(client, email=f"spam{i}@test.io").status_code for i in range(8)]
    assert 429 in codes, "an attacker can farm referral bonuses in a loop"


# --------------------------------------------------------- password reset
def test_forgot_password_does_not_reveal_whether_an_account_exists(client, monkeypatch):
    """The response shape must not differ between a real and an unknown address.

    Demo mode deliberately returns the reset token so the flow can be shown
    without an email provider; outside demo mode the two responses must be
    byte-identical.
    """
    monkeypatch.setattr(settings, "demo_mode", False)
    register(client)

    known = client.post("/api/auth/forgot-password", json={"email": "user@test.io"})
    unknown = client.post("/api/auth/forgot-password", json={"email": "nobody@test.io"})

    assert known.json() == unknown.json()


def test_reset_token_cannot_be_used_as_a_session_token(client):
    register(client)
    token = client.post("/api/auth/forgot-password",
                        json={"email": "user@test.io"}).json()["reset_token"]
    r = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 401


def test_password_reset_changes_the_password(client):
    register(client)
    token = client.post("/api/auth/forgot-password",
                        json={"email": "user@test.io"}).json()["reset_token"]
    assert client.post("/api/auth/reset-password",
                       json={"token": token, "new_password": "brandnew123"}).status_code == 200
    assert client.post("/api/auth/login",
                       json={"email": "user@test.io", "password": "brandnew123"}).status_code == 200


# --------------------------------------------------------------------------- 2FA
@pytest.fixture
def totp_enabled(client, headers):
    secret = client.post("/api/auth/2fa/setup", headers=headers).json()
    code = pyotp.TOTP(secret["secret"]).now()
    assert client.post("/api/auth/2fa/verify", headers=headers,
                       json={"code": code}).status_code == 200
    return secret


def test_login_challenges_once_2fa_is_on(client, totp_enabled):
    r = client.post("/api/auth/login",
                    json={"email": "user@test.io", "password": "password123"}).json()
    assert r["requires_2fa"] is True
    assert r["access_token"] == ""
    assert r["challenge_token"]


def test_a_valid_totp_code_completes_login(client, totp_enabled):
    challenge = client.post("/api/auth/login", json={
        "email": "user@test.io", "password": "password123"}).json()["challenge_token"]
    r = client.post("/api/auth/2fa/authenticate", json={
        "challenge_token": challenge, "code": pyotp.TOTP(totp_enabled["secret"]).now()})
    assert r.status_code == 200
    assert r.json()["access_token"]


def test_a_backup_code_works_once(client, totp_enabled):
    backup = totp_enabled["backup_codes"][0]

    def attempt():
        challenge = client.post("/api/auth/login", json={
            "email": "user@test.io", "password": "password123"}).json()["challenge_token"]
        return client.post("/api/auth/2fa/authenticate",
                           json={"challenge_token": challenge, "code": backup})

    assert attempt().status_code == 200
    assert attempt().status_code == 400, "a backup code was accepted twice"
