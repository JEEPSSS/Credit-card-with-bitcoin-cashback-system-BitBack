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


def test_every_foreign_key_is_the_leading_column_of_an_index(engine):
    """Postgres does not index foreign keys on its own.

    An unindexed one makes every delete of the parent row scan the child
    table. reward_events.transaction_id was one: deleting an account with
    20,000 purchases spent 26 s in those checks, longer than the app waits
    for a response. This fails the day another one is added.
    """
    from sqlalchemy import inspect

    inspector = inspect(engine)
    missing = []
    for table in inspector.get_table_names():
        leading = {tuple(inspector.get_pk_constraint(table)["constrained_columns"][:1])}
        leading |= {tuple(ix["column_names"][:1]) for ix in inspector.get_indexes(table)}
        leading |= {tuple(uc["column_names"][:1])
                    for uc in inspector.get_unique_constraints(table)}
        for fk in inspector.get_foreign_keys(table):
            if tuple(fk["constrained_columns"][:1]) not in leading:
                missing.append(f"{table}.{fk['constrained_columns'][0]}")
    assert missing == [], f"foreign keys without an index: {missing}"
