"""Synthetic cardholders with known ground truth.

Evaluating an unsupervised detector needs labels, and a cashback prototype has
none: no transaction in this system was ever confirmed fraudulent by a human.
The alternative to giving up is to generate a population whose labels are known
by construction — a cardholder with a stable, plausible spending habit, into
which specific, individually-labelled anomalies are injected.

What that can and cannot support is worth being exact about, because it is the
main threat to the validity of every fraud number in the report:

  * It CAN show whether the detector separates a known departure from a
    cardholder's own baseline, and how that separation degrades as the departure
    gets subtler.
  * It CANNOT show real-world precision. Real fraud is adversarial and does not
    draw its amounts from the distribution used here. A model tuned until it
    scores well on synthetic anomalies is tuned to the generator, not to fraud.

The generator is therefore deliberately naive about the model: the anomaly types
below are the ones a cardholder would recognise as suspicious on their own
statement, not the ones the six features happen to be good at.
"""
import random
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.auth import hash_password
from app.models import RewardEvent, Transaction, User
from app.reward_engine import calculate_reward

# A cardholder's habitual categories, and what they typically spend in each.
HABIT = {
    "dining": (8.0, 45.0, 0.34),
    "groceries": (25.0, 120.0, 0.22),
    "transport": (3.0, 30.0, 0.16),
    "shopping": (20.0, 120.0, 0.12),
    "entertainment": (10.0, 40.0, 0.09),
    "bills": (40.0, 200.0, 0.07),
}
MERCHANTS = {
    "dining": ["Ya Kun", "Tiong Bahru Bakery", "Ramen Keisuke", "Wolf Burgers"],
    "groceries": ["FairPrice", "Cold Storage", "Sheng Siong"],
    "transport": ["Grab", "SMRT", "Shell"],
    "shopping": ["Uniqlo", "Shopee", "Decathlon"],
    "entertainment": ["Spotify", "Netflix", "Golden Village"],
    "bills": ["SP Group", "Singtel"],
}
WAKING_HOURS = (8, 22)
BTC_PRICE = 60_000.0


@dataclass
class LabelledTransaction:
    transaction: Transaction
    is_fraud: bool
    kind: str


def _spend(rng: random.Random, category: str) -> float:
    low, high, _ = HABIT[category]
    return round(rng.uniform(low, high), 2)


def _reward(amount: float, category: str) -> int:
    return calculate_reward(amount, category, BTC_PRICE)["total_sats"]


def build_cardholder(
    db: Session,
    email: str,
    *,
    days: int = 120,
    fraud_count: int = 30,
    seed: int = 42,
    end: datetime | None = None,
    trend: float = 0.0,
) -> tuple[User, list[LabelledTransaction]]:
    """A cardholder with `days` of habitual spending plus labelled anomalies.

    `trend` is the fractional change in spending across the whole history:
    0.0 is a stationary cardholder, 0.8 is one spending 80% more by the end
    than at the start. It exists because a trend-following forecast can only be
    fairly judged against both regimes — on stationary data a naive "repeat the
    last month" baseline is already near-optimal, and any trend term can do is
    add variance. Reporting only one regime would misrepresent the model in
    whichever direction the generator happened to be set.
    """
    rng = random.Random(seed)
    end = end or datetime(2026, 3, 1, 12, 0, 0)
    start = end - timedelta(days=days)

    user = User(
        email=email,
        password_hash=hash_password("evaluation-only"),
        display_name="Evaluation Subject",
        created_at=start,
    )
    db.add(user)
    db.flush()

    categories = list(HABIT)
    weights = [HABIT[c][2] for c in categories]
    labelled: list[LabelledTransaction] = []

    def record(amount, category, merchant, when, is_fraud, kind):
        sats = _reward(amount, category)
        tx = Transaction(
            user_id=user.id, amount_fiat=amount, category=category, merchant=merchant,
            btc_price_at_time=BTC_PRICE, sats_earned=sats, created_at=when,
        )
        db.add(tx)
        db.flush()
        db.add(RewardEvent(
            user_id=user.id, transaction_id=tx.id, btc_amount=sats, btc_price=BTC_PRICE,
            cashback_rate=0.02, category=category, created_at=when,
        ))
        labelled.append(LabelledTransaction(tx, is_fraud, kind))

    # ---- habitual behaviour -------------------------------------------------
    for day in range(days):
        when = start + timedelta(days=day)
        # Growth is applied to the amount rather than the frequency, so the
        # transaction count stays realistic while earnings drift.
        growth = 1.0 + trend * (day / max(1, days - 1))
        for _ in range(rng.choices([0, 1, 2, 3], weights=[15, 40, 32, 13])[0]):
            category = rng.choices(categories, weights=weights)[0]
            record(
                round(_spend(rng, category) * growth, 2), category,
                rng.choice(MERCHANTS[category]),
                when.replace(hour=rng.randint(*WAKING_HOURS), minute=rng.randint(0, 59)),
                False, "normal",
            )

    # ---- injected anomalies -------------------------------------------------
    # Five kinds, in equal share, each a departure a cardholder would query on
    # their own statement. Placed in the final third so the detector has a
    # baseline to have learned from.
    kinds = ["amount", "hour", "merchant", "velocity", "category"]
    inject_from = days - days // 3

    for i in range(fraud_count):
        kind = kinds[i % len(kinds)]
        day = rng.randint(inject_from, days - 1)
        when = start + timedelta(days=day)

        if kind == "amount":
            # 15-30x the cardholder's typical dining spend.
            record(round(rng.uniform(600, 1400), 2), "dining", rng.choice(MERCHANTS["dining"]),
                   when.replace(hour=rng.randint(*WAKING_HOURS), minute=0), True, kind)

        elif kind == "hour":
            # Normal amount, but at an hour this cardholder never transacts.
            record(_spend(rng, "shopping"), "shopping", rng.choice(MERCHANTS["shopping"]),
                   when.replace(hour=rng.randint(2, 4), minute=rng.randint(0, 59)), True, kind)

        elif kind == "merchant":
            # Unseen merchant, elevated but not absurd amount.
            record(round(rng.uniform(200, 400), 2), "shopping", f"Unknown Terminal {4000 + i}",
                   when.replace(hour=rng.randint(*WAKING_HOURS), minute=0), True, kind)

        elif kind == "velocity":
            # Three charges inside a few minutes — card-testing behaviour.
            base = when.replace(hour=rng.randint(*WAKING_HOURS), minute=rng.randint(0, 50))
            for k in range(3):
                record(round(rng.uniform(80, 160), 2), "general", f"Rapid Merchant {i}",
                       base + timedelta(minutes=k * 2), True, kind)

        elif kind == "category":
            # A category this cardholder has never once used.
            record(round(rng.uniform(300, 900), 2), "travel", f"Sky Charter {i}",
                   when.replace(hour=rng.randint(*WAKING_HOURS), minute=0), True, kind)

    db.commit()
    labelled.sort(key=lambda lt: lt.transaction.created_at)
    return user, labelled
