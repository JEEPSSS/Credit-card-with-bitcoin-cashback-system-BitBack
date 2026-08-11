"""Time handling.

Every timestamp in this system is UTC. Columns are naive `DateTime` holding UTC
instants, so a single helper produces the value written to them and nothing
calls `datetime.utcnow()` (deprecated from Python 3.12) or `date.today()` (the
server's *local* date, which does not agree with the stored timestamps unless
the server happens to run in UTC).

That disagreement was a real bug: streaks and the daily badge counted days in
server-local time while transactions were stamped in UTC, so both broke across
the day boundary on any non-UTC host.

Known limitation, worth stating rather than hiding: a streak is a claim about
the *user's* day, not UTC's. Doing that properly needs a per-user IANA timezone
stored on the account and applied here. Until then, UTC is at least internally
consistent.
"""
from datetime import UTC, date, datetime, timedelta


def utcnow() -> datetime:
    """Current UTC instant, naive, for writing to a naive DateTime column."""
    return datetime.now(UTC).replace(tzinfo=None)


def utctoday() -> date:
    """Current UTC calendar date. Matches the day boundary of stored timestamps."""
    return utcnow().date()


def start_of_utc_day(day: date | None = None) -> datetime:
    return datetime.combine(day or utctoday(), datetime.min.time())


def days_ago(days: int) -> datetime:
    return utcnow() - timedelta(days=days)
