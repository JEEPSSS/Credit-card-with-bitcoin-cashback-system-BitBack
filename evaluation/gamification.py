"""Are the badges and levels reachable, and by whom?

Gamification only motivates if goals sit at the right distance: a badge
everyone gets on day one rewards nothing, and one nobody reaches in a year is
decoration. There is no ground truth to score against here, so the suite
measures attainment instead - simulated cardholders of three activity levels
spend for 180 days through the app's own streak and badge code, and the day
each badge and level is reached is recorded.

The badge code reads "today" from the clock, so the simulation patches the two
clock functions app/gamification.py imports; everything else (the SQL behind
each badge condition, the streak rules, the reward and level maths) is the
code the app runs.

Activity levels, from light to heavy card use:

  light    - spends on 30% of days, one purchase
  regular  - spends on 70% of days, one or two purchases
  heavy    - spends on 90% of days, two to four purchases
"""
import random
import statistics
from datetime import datetime, timedelta
from unittest.mock import patch

from sqlalchemy.orm import Session

from app import gamification
from app.auth import hash_password
from app.models import Transaction, User
from app.reward_engine import DEFAULT_RATES, LEVELS, calculate_reward, get_level
from evaluation.recommender import AMOUNTS

DAYS = 180
CHECKPOINTS = (7, 30, 90, 180)
BTC_PRICE = 60_000.0
START = datetime(2026, 1, 1)
ARCHETYPES = {
    "light": {"active": 0.30, "purchases": [1], "weights": [1]},
    "regular": {"active": 0.70, "purchases": [1, 2], "weights": [70, 30]},
    "heavy": {"active": 0.90, "purchases": [2, 3, 4], "weights": [40, 40, 20]},
}
NIGHT_PURCHASE_CHANCE = 0.02


def _simulate_user(db: Session, rng: random.Random, archetype: str, idx: int) -> dict:
    spec = ARCHETYPES[archetype]
    user = User(email=f"game-{archetype}-{idx}@evaluation.local",
                password_hash=hash_password("evaluation-only"),
                display_name="Evaluation Subject", created_at=START)
    db.add(user)
    db.flush()

    habits = rng.sample(list(DEFAULT_RATES), rng.randint(4, 7))
    weights = [rng.random() + 0.2 for _ in habits]
    earned_on: dict[str, int] = {}
    level_on: dict[str, int] = {"bronze": 0}
    total_sats = 0
    longest = 0

    for day in range(DAYS):
        today = (START + timedelta(days=day)).date()
        if rng.random() >= spec["active"]:
            continue
        for _ in range(rng.choices(spec["purchases"], weights=spec["weights"])[0]):
            category = rng.choices(habits, weights=weights)[0]
            amount = round(rng.uniform(*AMOUNTS[category]), 2)
            hour = rng.randint(0, 4) if rng.random() < NIGHT_PURCHASE_CHANCE else rng.randint(8, 22)
            level = get_level(total_sats)
            sats = calculate_reward(amount, category, BTC_PRICE, DEFAULT_RATES[category],
                                    level["multiplier"])["total_sats"]
            db.add(Transaction(user_id=user.id, amount_fiat=amount, category=category,
                               merchant=f"{category}-{rng.randint(1, 5)}",
                               btc_price_at_time=BTC_PRICE, sats_earned=sats,
                               created_at=datetime.combine(today, datetime.min.time())
                               + timedelta(hours=hour, minutes=rng.randint(0, 59))))
            db.flush()
            total_sats += sats
            new_level = get_level(total_sats)["key"]
            level_on.setdefault(new_level, day)

            with patch.object(gamification, "utctoday", lambda t=today: t), \
                 patch.object(gamification, "start_of_utc_day",
                              lambda d=None, t=today: datetime.combine(t, datetime.min.time())):
                streak = gamification.update_streak(db, user.id)
                for badge in gamification.check_badges(db, user.id, total_sats, new_level):
                    earned_on[badge["key"]] = day
            longest = max(longest, streak.longest_streak)
        db.commit()

    return {"badges": earned_on, "levels": level_on, "longest_streak": longest,
            "total_sats": total_sats}


def evaluate(db: Session, *, users_per_archetype: int = 40, seed: int = 47) -> dict:
    rng = random.Random(seed)
    results = {name: [_simulate_user(db, rng, name, i) for i in range(users_per_archetype)]
               for name in ARCHETYPES}

    def attainment(users: list[dict], key: str, kind: str) -> dict:
        days = [u[kind][key] for u in users if key in u[kind]]
        return {
            **{f"by_day_{d}": round(sum(1 for x in days if x < d) / len(users), 3)
               for d in CHECKPOINTS},
            "median_day_reached": statistics.median(days) if days else None,
        }

    badges = {
        name: {b["key"]: attainment(users, b["key"], "badges") for b in gamification.BADGES}
        for name, users in results.items()
    }
    levels = {
        name: {lvl["key"]: attainment(users, lvl["key"], "levels") for lvl in LEVELS[1:]}
        for name, users in results.items()
    }
    # Badges nobody in any archetype reaches, and ones nearly everyone gets in
    # the first week - the two ways a goal stops working.
    everyone = [u for users in results.values() for u in users]
    never = [b["key"] for b in gamification.BADGES
             if not any(b["key"] in u["badges"] for u in everyone)]
    instant = [b["key"] for b in gamification.BADGES
               if sum(1 for u in everyone if u["badges"].get(b["key"], DAYS) < 7) / len(everyone) > 0.8]

    return {
        "design": {"days": DAYS, "users_per_archetype": users_per_archetype, "seed": seed,
                   "archetypes": ARCHETYPES, "btc_price_usd": BTC_PRICE,
                   "night_purchase_chance": NIGHT_PURCHASE_CHANCE},
        "badges": badges,
        "levels": levels,
        "sats_after_180_days": {
            name: {"median": int(statistics.median(u["total_sats"] for u in users)),
                   "max": max(u["total_sats"] for u in users)}
            for name, users in results.items()
        },
        "longest_streak_days": {
            name: {"median": statistics.median(u["longest_streak"] for u in users),
                   "max": max(u["longest_streak"] for u in users)}
            for name, users in results.items()
        },
        "never_earned_by_anyone": never,
        "earned_by_80pct_within_a_week": instant,
        "level_thresholds_sats": {lvl["key"]: lvl["min_sats"] for lvl in LEVELS},
    }
