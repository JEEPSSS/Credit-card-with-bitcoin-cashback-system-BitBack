"""Deleting an account deletes the data, not just the login.

The check is written against the schema rather than a list of tables: every
column with a foreign key to `users.id` is found from the metadata and must
hold no row for the deleted user. A table added later is covered without
anyone remembering to add it here.
"""
from sqlalchemy import func, select

from app.database import Base
from app.models import Referral, ReferralCode, User, WalletBalance
from tests.conftest import auth_header
from tests.test_transactions import spend


def user_references():
    """(table, column) for every foreign key that points at users.id."""
    for table in Base.metadata.sorted_tables:
        for column in table.columns:
            if any(fk.target_fullname == "users.id" for fk in column.foreign_keys):
                yield table, column


def rows_for(db, user_id: int) -> dict[str, int]:
    found = {}
    for table, column in user_references():
        n = db.execute(select(func.count()).select_from(table)
                       .where(column == user_id)).scalar()
        if n:
            found[f"{table.name}.{column.name}"] = n
    return found


def build_a_full_account(client, db):
    """A user with a row in as many tables as the API can reach."""
    referrer = auth_header(client, email="referrer@test.io")
    code = client.get("/api/referral", headers=referrer).json()["code"]

    r = client.post("/api/auth/register", json={
        "email": "leaving@test.io", "password": "password123",
        "display_name": "Leaving", "referral_code": code})
    me = {"Authorization": f"Bearer {r.json()['access_token']}"}
    user_id = r.json()["user"]["id"]

    for amount in (40.0, 60.0, 900.0):
        spend(client, me, amount=amount)
    client.post("/api/rewards/boosts/activate", headers=me, json={"category": "dining"})
    goal = client.post("/api/goals", headers=me, json={"name": "Trip", "target_sats": 10**6}).json()
    client.post(f"/api/goals/{goal['id']}/allocate", headers=me, json={"sats": 100})
    client.post("/api/alerts", headers=me, json={"target_price": 90_000, "direction": "above"})
    client.put("/api/roundup/config", headers=me, json={"is_enabled": True, "multiplier": 2.0})
    client.post("/api/auth/2fa/setup", headers=me)

    # This user refers someone too, so they sit on both sides of `referrals`.
    my_code = client.get("/api/referral", headers=me).json()["code"]
    client.post("/api/auth/register", json={
        "email": "friend@test.io", "password": "password123",
        "display_name": "Friend", "referral_code": my_code})
    return me, user_id


def delete(client, headers, password="password123"):
    return client.request("DELETE", "/api/auth/me", headers=headers,
                          json={"password": password})


def test_deleting_an_account_leaves_no_row_behind(client, db):
    me, user_id = build_a_full_account(client, db)
    before = rows_for(db, user_id)
    assert len(before) >= 10, f"the fixture should touch most tables, got {before}"

    assert delete(client, me).status_code == 200

    db.expire_all()
    assert db.get(User, user_id) is None
    assert rows_for(db, user_id) == {}


def test_the_other_side_of_a_referral_keeps_what_it_was_paid(client, db):
    me, _ = build_a_full_account(client, db)
    referrer_id = db.query(User).filter(User.email == "referrer@test.io").one().id
    paid = db.query(WalletBalance).filter(WalletBalance.user_id == referrer_id).one().balance_sats

    delete(client, me)

    db.expire_all()
    assert db.query(WalletBalance).filter(
        WalletBalance.user_id == referrer_id).one().balance_sats == paid
    assert db.query(ReferralCode).filter(ReferralCode.user_id == referrer_id).count() == 1
    assert db.query(Referral).count() == 0


def test_the_session_is_dead_afterwards(client, db):
    me, _ = build_a_full_account(client, db)
    delete(client, me)
    assert client.get("/api/auth/me", headers=me).status_code == 401
    assert client.post("/api/auth/login", json={
        "email": "leaving@test.io", "password": "password123"}).status_code == 401


def test_a_wrong_password_deletes_nothing(client, db):
    me, user_id = build_a_full_account(client, db)
    assert delete(client, me, password="not-it").status_code == 400
    db.expire_all()
    assert db.get(User, user_id) is not None


def test_deletion_requires_a_session(client):
    assert client.request("DELETE", "/api/auth/me",
                          json={"password": "password123"}).status_code == 401


# ------------------------------------------------------------ privacy page
def test_the_privacy_policy_is_public_and_says_how_to_delete(client):
    r = client.get("/privacy")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/html")
    assert "Delete account" in r.text


def test_the_contact_address_is_escaped(client, monkeypatch):
    from app.config import settings
    monkeypatch.setattr(settings, "support_email", '"><script>x</script>@test.io')
    assert "<script>" not in client.get("/privacy").text
