"""Two requests at the same moment, against a real Postgres server.

SQLite serialises every writer, so these races cannot happen there and the
tests are skipped. On Postgres they are made deterministic rather than left to
timing: a barrier holds both requests at the exact point where the race used
to open, so both are guaranteed to be inside it together.
"""
import os
import threading
from concurrent.futures import ThreadPoolExecutor

import pytest

from app.models import Transaction, WalletBalance, WalletTransaction
from app.routers import goals, transactions
from tests.test_transactions import spend

pytestmark = pytest.mark.skipif(
    not os.environ.get("TEST_DATABASE_URL"),
    reason="races need a database with real concurrent writers (set TEST_DATABASE_URL)",
)


def hold_at_barrier(monkeypatch, module, name):
    """Wrap `module.name` so two callers meet before either continues.

    The timeout matters: once a fix makes the second caller wait on a row lock
    held by the first, it can never reach the barrier, and the first must be
    allowed to carry on alone.
    """
    barrier = threading.Barrier(2)
    original = getattr(module, name)

    def wrapped(*args, **kwargs):
        result = original(*args, **kwargs)
        try:
            barrier.wait(timeout=2)
        except threading.BrokenBarrierError:
            pass
        return result

    monkeypatch.setattr(module, name, wrapped)


def both_at_once(fn):
    with ThreadPoolExecutor(max_workers=2) as pool:
        return [f.result() for f in [pool.submit(fn), pool.submit(fn)]]


def test_a_double_tap_pays_once_and_the_loser_gets_409(client, headers, db, monkeypatch):
    """Regression: both requests passed the "seen this key?" check before either
    inserted. The unique constraint still stopped the second payout, but it
    surfaced as an unhandled IntegrityError - a 500 - for a routine retry."""
    hold_at_barrier(monkeypatch, transactions, "category_or_404")

    codes = sorted(r.status_code for r in both_at_once(
        lambda: spend(client, headers, key="double-tap-1")))

    assert codes == [200, 409]
    db.expire_all()
    assert db.query(Transaction).count() == 1
    assert db.query(WalletTransaction).filter(WalletTransaction.type == "cashback").count() == 1


def test_deleting_a_goal_twice_at_once_refunds_once(client, headers, db, monkeypatch):
    """Regression: both deletes read the goal before either removed it, so its
    balance was returned to the wallet twice."""
    spend(client, headers, amount=1_000.0)
    goal = client.post("/api/goals", headers=headers,
                       json={"name": "Trip", "target_sats": 1_000_000}).json()
    client.post(f"/api/goals/{goal['id']}/allocate", headers=headers, json={"sats": 10_000})
    db.expire_all()
    before = db.query(WalletBalance).one().balance_sats

    hold_at_barrier(monkeypatch, goals, "_owned_goal")
    codes = sorted(r.status_code for r in both_at_once(
        lambda: client.delete(f"/api/goals/{goal['id']}", headers=headers)))

    db.expire_all()
    assert codes == [200, 404]
    assert db.query(WalletBalance).one().balance_sats == before + 10_000
