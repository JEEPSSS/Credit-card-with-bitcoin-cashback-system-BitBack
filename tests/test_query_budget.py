"""Read endpoints issue a fixed number of queries, however long the history.

An N+1 - one query per transaction, notification or badge - is invisible at
ten rows and is the first thing to fall over at ten thousand. Measuring the
same endpoints at two history sizes catches one the day it is written: the
count must not move.
"""
import pytest
from sqlalchemy import event

from app import rate_limit
from tests.test_transactions import spend

READ_ENDPOINTS = [
    "/api/wallet", "/api/transactions", "/api/rewards/summary",
    "/api/analytics/insights", "/api/analytics/recap", "/api/analytics/spending?period=all",
    "/api/notifications", "/api/forecast", "/api/fraud/summary", "/api/fraud/flagged",
    "/api/ai/boost-recommendation", "/api/ai/persona",
]
CATEGORIES = ["dining", "travel", "groceries", "shopping", "transport"]


def add_purchases(client, headers, n, offset=0):
    for i in range(offset, offset + n):
        rate_limit.reset()          # the per-user transaction limit is not under test
        assert spend(client, headers, amount=10 + i % 50, category=CATEGORIES[i % 5],
                     merchant=f"Shop {i % 12}").status_code == 200


def query_counts(client, headers, engine) -> dict[str, int]:
    counts = {}
    current = [0]

    def count(*_args, **_kwargs):
        current[0] += 1

    event.listen(engine, "before_cursor_execute", count)
    try:
        for path in READ_ENDPOINTS:
            current[0] = 0
            assert client.get(path, headers=headers).status_code == 200, path
            counts[path] = current[0]
    finally:
        event.remove(engine, "before_cursor_execute", count)
    return counts


@pytest.mark.slow
def test_query_count_does_not_grow_with_history(client, headers, engine):
    add_purchases(client, headers, 10)
    small = query_counts(client, headers, engine)
    add_purchases(client, headers, 50, offset=10)
    large = query_counts(client, headers, engine)

    grew = {p: (small[p], large[p]) for p in READ_ENDPOINTS if large[p] > small[p]}
    assert grew == {}, f"queries grew with history (10 -> 60 purchases): {grew}"
    assert max(large.values()) <= 8
