"""Generate a demo account with 120 days of realistic spending.

A live demo needs history: the fraud model needs 50+ transactions before it
trains, the forecast needs a trend, and the persona needs a skewed category
distribution. Injects three deliberate anomalies so the fraud dashboard has
something to show.

    python seed_demo.py
    login: demo@bitback.app / demo12345
"""
import random
from datetime import timedelta

from app.anomaly_detector import invalidate as invalidate_fraud_cache
from app.anomaly_detector import score_transaction
from app.auth import hash_password
from app.clock import utcnow
from app.database import Base, SessionLocal, engine
from app.gamification import check_badges
from app.models import (
    AutoWithdrawConfig,
    CategoryCashback,
    Notification,
    ReferralCode,
    RewardEvent,
    SavingsGoal,
    Transaction,
    TransactionRiskScore,
    User,
    UserRoundUpConfig,
    UserStreak,
    WalletBalance,
    WalletTransaction,
)
from app.reward_engine import calculate_reward, get_level
from main import SEED_CATEGORIES

random.seed(42)

DEMO_EMAIL = "demo@bitback.app"
DEMO_PASSWORD = "demo12345"
HISTORY_DAYS = 120

MERCHANTS = {
    "dining": ["Ya Kun Kaya Toast", "Tiong Bahru Bakery", "Ramen Keisuke", "Wolf Burgers", "Chir Chir"],
    "groceries": ["FairPrice Finest", "Cold Storage", "Sheng Siong", "RedMart"],
    "transport": ["Grab", "SMRT", "Shell", "ComfortDelGro"],
    "shopping": ["Uniqlo", "Shopee", "Lazada", "Decathlon"],
    "entertainment": ["Spotify", "Netflix", "Golden Village", "Steam"],
    "bills": ["SP Group", "Singtel", "StarHub"],
    "health": ["Guardian", "Anytime Fitness", "Watsons"],
    "travel": ["Scoot", "Agoda", "Klook"],
    "education": ["Coursera", "Kinokuniya"],
    "general": ["PayNow transfer", "7-Eleven"],
}
# Weighted so the persona classifier has a clear winner (foodie).
WEIGHTS = {"dining": 30, "groceries": 20, "transport": 14, "shopping": 12,
           "entertainment": 8, "bills": 5, "health": 4, "travel": 3,
           "education": 2, "general": 2}
RANGES = {"dining": (8, 45), "groceries": (25, 120), "transport": (3, 30),
          "shopping": (20, 180), "entertainment": (10, 40), "bills": (40, 200),
          "health": (12, 90), "travel": (150, 800), "education": (20, 150),
          "general": (5, 60)}

# Large amount, unusual hour, unseen merchant - one of each signal the model uses.
PLANTED_ANOMALIES = [
    (1450.00, "shopping", "LuxeWatch Geneva", 3, 5),
    (890.00, "general", "Unknown Terminal 4471", 2, 3),
    (2100.00, "travel", "Sky Charter Ltd", 4, 1),
]


def _record(db, user_id, amount, category, merchant, price, rate, when, total_sats):
    level = get_level(total_sats)
    reward = calculate_reward(amount, category, price, rate, level["multiplier"], 1.0)
    tx = Transaction(user_id=user_id, amount_fiat=amount, category=category,
                     merchant=merchant, btc_price_at_time=price,
                     sats_earned=reward["total_sats"], created_at=when)
    db.add(tx)
    db.flush()
    db.add_all([
        RewardEvent(user_id=user_id, transaction_id=tx.id, btc_amount=reward["total_sats"],
                    btc_price=price, cashback_rate=rate,
                    level_multiplier=level["multiplier"], category=category, created_at=when),
        WalletTransaction(user_id=user_id, amount_sats=reward["total_sats"],
                          type="cashback", created_at=when),
    ])
    return reward["total_sats"]


def main():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        if db.query(CategoryCashback).count() == 0:
            db.add_all([CategoryCashback(category=c, base_rate=r, icon=i, description=d)
                        for c, r, i, d in SEED_CATEGORIES])
            db.commit()
        rates = {c.category: c.base_rate for c in db.query(CategoryCashback)}

        existing = db.query(User).filter(User.email == DEMO_EMAIL).first()
        if existing:
            # Object-level delete so the ORM's cascade rules fire. A bulk
            # `query().delete()` bypasses them and leaves orphaned rows behind.
            db.delete(existing)
            db.commit()
        invalidate_fraud_cache()

        now = utcnow()
        user = User(email=DEMO_EMAIL, password_hash=hash_password(DEMO_PASSWORD),
                    display_name="Demo User", created_at=now - timedelta(days=HISTORY_DAYS))
        db.add(user)
        db.flush()
        db.add_all([
            WalletBalance(user_id=user.id, balance_sats=0),
            UserStreak(user_id=user.id),
            UserRoundUpConfig(user_id=user.id, is_enabled=True, multiplier=2.0),
            AutoWithdrawConfig(user_id=user.id),
            ReferralCode(user_id=user.id, code="DEMO2026"),
            SavingsGoal(user_id=user.id, name="Hardware wallet", target_sats=250_000,
                        current_sats=40_000, icon="shield"),
            SavingsGoal(user_id=user.id, name="Japan trip", target_sats=2_000_000, icon="plane"),
        ])
        db.flush()

        cats = list(WEIGHTS)
        weights = [WEIGHTS[c] for c in cats]
        total_sats = 0

        for day_offset in range(HISTORY_DAYS, 0, -1):
            when = now - timedelta(days=day_offset)
            # Gentle upward trend so the forecast has signal to find.
            n = random.choices([0, 1, 2, 3], weights=[18, 40, 30, 12])[0]
            if day_offset < 40:
                n += random.choices([0, 1], weights=[60, 40])[0]
            # Simulated price walk; real prices come from CoinGecko at runtime.
            price = 62000 + (HISTORY_DAYS - day_offset) * 45 + random.uniform(-1200, 1200)

            for _ in range(n):
                cat = random.choices(cats, weights=weights)[0]
                lo, hi = RANGES[cat]
                total_sats += _record(
                    db, user.id, round(random.uniform(lo, hi), 2), cat,
                    random.choice(MERCHANTS[cat]), price, rates[cat],
                    when.replace(hour=random.randint(8, 22), minute=random.randint(0, 59)),
                    total_sats,
                )

        for amount, cat, merchant, hour, days_back in PLANTED_ANOMALIES:
            total_sats += _record(
                db, user.id, amount, cat, merchant, 67000.0, rates[cat],
                (now - timedelta(days=days_back)).replace(hour=hour, minute=17),
                total_sats,
            )

        db.query(WalletBalance).filter(WalletBalance.user_id == user.id).update(
            {"balance_sats": total_sats})

        print("Scoring transactions with the fraud model...")
        for tx in (db.query(Transaction).filter(Transaction.user_id == user.id)
                   .order_by(Transaction.created_at).all()):
            score_transaction(db, user.id, tx)

        streak = db.query(UserStreak).filter(UserStreak.user_id == user.id).first()
        streak.current_streak, streak.longest_streak = 6, 14
        streak.last_transaction_date = now.date()
        check_badges(db, user.id, total_sats, get_level(total_sats)["key"])
        db.add(Notification(user_id=user.id, title="Welcome back",
                            message=f"Your demo account is loaded with {HISTORY_DAYS} days of history.",
                            type="system", icon="sparkles"))
        db.commit()

        n_tx = db.query(Transaction).filter(Transaction.user_id == user.id).count()
        flagged = db.query(TransactionRiskScore).filter(
            TransactionRiskScore.user_id == user.id,
            TransactionRiskScore.is_anomaly.is_(True)).count()
        print(f"Seeded {n_tx} transactions, {total_sats:,} sats, {flagged} flagged.")
        print(f"Login: {DEMO_EMAIL} / {DEMO_PASSWORD}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
