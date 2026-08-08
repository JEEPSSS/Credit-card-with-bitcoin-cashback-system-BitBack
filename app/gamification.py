"""Streaks and achievement badges.

Badge conditions are declared as predicates over a snapshot of the user's state
so adding a badge is a one-line change and the checks stay testable.
"""
from datetime import date, datetime, timedelta

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import Transaction, UserBadge, UserStreak, RewardEvent

BADGES = [
    {"key": "first_swipe", "name": "First swipe", "icon": "sparkles", "description": "Your first transaction"},
    {"key": "centurion", "name": "Centurion", "icon": "medal", "description": "100 transactions"},
    {"key": "streak_master", "name": "Streak master", "icon": "flame", "description": "A 7-day streak"},
    {"key": "mountain_climber", "name": "Mountain climber", "icon": "mountain", "description": "10,000 sats earned"},
    {"key": "whale_alert", "name": "Whale alert", "icon": "waves", "description": "100,000 sats earned"},
    {"key": "category_explorer", "name": "Category explorer", "icon": "compass", "description": "5 different categories"},
    {"key": "precision_spender", "name": "Precision spender", "icon": "target", "description": "10 transactions in one category"},
    {"key": "lightning_fast", "name": "Lightning fast", "icon": "zap", "description": "3 transactions in a day"},
    {"key": "night_owl", "name": "Night owl", "icon": "moon", "description": "A transaction between midnight and 5am"},
    {"key": "diamond_hands", "name": "Diamond hands", "icon": "gem", "description": "Reach Diamond level"},
]
BADGE_BY_KEY = {b["key"]: b for b in BADGES}


def update_streak(db: Session, user_id: int) -> UserStreak:
    streak = db.query(UserStreak).filter(UserStreak.user_id == user_id).first()
    if streak is None:
        streak = UserStreak(user_id=user_id, current_streak=0, longest_streak=0)
        db.add(streak)
        db.flush()

    today = date.today()
    last = streak.last_transaction_date
    if last == today:
        pass
    elif last == today - timedelta(days=1):
        streak.current_streak += 1
    else:
        streak.current_streak = 1
    streak.last_transaction_date = today
    streak.longest_streak = max(streak.longest_streak, streak.current_streak)
    return streak


def check_badges(db: Session, user_id: int, total_sats: int, level_key: str) -> list[dict]:
    owned = {b.badge_key for b in db.query(UserBadge).filter(UserBadge.user_id == user_id).all()}

    tx_count = db.query(func.count(Transaction.id)).filter(Transaction.user_id == user_id).scalar() or 0
    distinct_cats = db.query(func.count(func.distinct(Transaction.category))).filter(
        Transaction.user_id == user_id).scalar() or 0
    max_in_cat = db.query(func.count(Transaction.id)).filter(
        Transaction.user_id == user_id).group_by(Transaction.category).order_by(
        func.count(Transaction.id).desc()).limit(1).scalar() or 0
    streak = db.query(UserStreak).filter(UserStreak.user_id == user_id).first()
    current_streak = streak.current_streak if streak else 0

    start_today = datetime.combine(date.today(), datetime.min.time())
    today_count = db.query(func.count(Transaction.id)).filter(
        Transaction.user_id == user_id, Transaction.created_at >= start_today).scalar() or 0

    night = db.query(Transaction).filter(Transaction.user_id == user_id).all()
    has_night = any(0 <= t.created_at.hour < 5 for t in night)

    conditions = {
        "first_swipe": tx_count >= 1,
        "centurion": tx_count >= 100,
        "streak_master": current_streak >= 7,
        "mountain_climber": total_sats >= 10_000,
        "whale_alert": total_sats >= 100_000,
        "category_explorer": distinct_cats >= 5,
        "precision_spender": max_in_cat >= 10,
        "lightning_fast": today_count >= 3,
        "night_owl": has_night,
        "diamond_hands": level_key == "diamond",
    }

    newly = []
    for key, met in conditions.items():
        if met and key not in owned:
            db.add(UserBadge(user_id=user_id, badge_key=key))
            newly.append(BADGE_BY_KEY[key])
    return newly


def badge_state(db: Session, user_id: int) -> dict:
    owned = {b.badge_key: b.earned_at for b in db.query(UserBadge).filter(UserBadge.user_id == user_id).all()}
    return {
        "earned": [{**BADGE_BY_KEY[k], "earned_at": v} for k, v in owned.items()],
        "all": [{**b, "earned": b["key"] in owned} for b in BADGES],
        "earned_count": len(owned),
        "total_count": len(BADGES),
    }
