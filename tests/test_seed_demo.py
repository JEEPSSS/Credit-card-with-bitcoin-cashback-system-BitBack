"""The demo account's history sits in the cardholder's own day.

Timestamps are stored as naive UTC. The seeder used to write Singapore hours
into those columns as they were, so once the app showed times correctly the
history ran overnight, and an ordinary afternoon purchase on the demo account
was flagged partly for its "unusual" hour. Found in the demo recording.
"""
from datetime import UTC, datetime

import seed_demo
from app.anomaly_detector import _hour_rarity
from app.models import Transaction

PLANTED = {merchant: hour for _, _, merchant, hour, _ in seed_demo.PLANTED_ANOMALIES}


def _singapore_hour(stored: datetime) -> int:
    return stored.replace(tzinfo=UTC).astimezone(seed_demo.DEMO_TZ).hour


def test_singapore_times_are_stored_as_utc():
    day = datetime(2026, 3, 15, 12, tzinfo=seed_demo.DEMO_TZ)
    assert seed_demo._at(day, 8, 0) == datetime(2026, 3, 15, 0, 0)
    assert seed_demo._at(day, 2, 17) == datetime(2026, 3, 14, 18, 17)


def test_seeded_history_falls_in_the_singapore_day(engine, SessionLocal, db, monkeypatch):
    monkeypatch.setattr(seed_demo, "engine", engine)
    monkeypatch.setattr(seed_demo, "SessionLocal", SessionLocal)
    seed_demo.main()

    history = db.query(Transaction).all()
    assert len(history) > 100
    for tx in history:
        hour = _singapore_hour(tx.created_at)
        if tx.merchant in PLANTED:
            assert hour == PLANTED[tx.merchant], tx.merchant
        else:
            assert 8 <= hour <= 22, (tx.merchant, tx.created_at)

    # The purchase in the recording: 2:50 PM in Singapore, 06:50 UTC. Its hour
    # rarity is 0.29 now; it was 0.51, with only the seeded 8 AM purchases near it.
    assert _hour_rarity(6, history) < 0.35
    # 3 AM in Singapore stays rare: only the planted anomalies are near it.
    assert _hour_rarity(19, history) > 0.7
