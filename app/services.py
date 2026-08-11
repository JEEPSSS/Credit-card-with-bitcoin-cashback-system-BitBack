"""Operations shared across routers.

Anything that touches a balance lives here rather than in a route handler, so
there is exactly one way to create a wallet and exactly one way to move value
into or out of it.
"""
import secrets
import string

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.clock import utcnow
from app.config import settings
from app.models import (
    CategoryCashback,
    Notification,
    PriceAlert,
    ReferralCode,
    RewardEvent,
    UserActiveBoost,
    WalletBalance,
    WalletTransaction,
)

REFERRAL_CODE_LENGTH = 8
REFERRAL_CODE_ALPHABET = string.ascii_uppercase + string.digits


def notify(db: Session, user_id: int, title: str, message: str, type_: str, icon: str) -> None:
    db.add(Notification(user_id=user_id, title=title, message=message, type=type_, icon=icon))


def total_sats_earned(db: Session, user_id: int) -> int:
    return int(
        db.query(func.coalesce(func.sum(RewardEvent.btc_amount), 0))
        .filter(RewardEvent.user_id == user_id)
        .scalar()
        or 0
    )


def get_wallet(db: Session, user_id: int, for_update: bool = False) -> WalletBalance:
    """The only place a WalletBalance is ever created.

    Registration used to queue a WalletBalance with `add_all` and then call this
    function in the same request. With autoflush disabled the SELECT below could
    not see the pending row, so it created a second one and the commit failed on
    the unique constraint. Autoflush is now on and this is the single creation
    path; both changes are needed for that bug to stay fixed.

    `for_update` takes a row lock so a read-modify-write of the balance is not
    interleaved with a concurrent one. SQLite ignores it (its writer lock already
    serialises), Postgres honours it.
    """
    q = db.query(WalletBalance).filter(WalletBalance.user_id == user_id)
    if for_update:
        q = q.with_for_update()
    wallet = q.first()
    if wallet is None:
        wallet = WalletBalance(user_id=user_id, balance_sats=0)
        db.add(wallet)
        db.flush()
    return wallet


def credit_wallet(db: Session, user_id: int, sats: int, type_: str,
                  tx_hash: bool = False, destination: str | None = None) -> WalletBalance:
    """Move `sats` into the wallet (negative to debit) and record the ledger row."""
    wallet = get_wallet(db, user_id, for_update=True)
    wallet.balance_sats += sats
    db.add(WalletTransaction(
        user_id=user_id,
        amount_sats=sats,
        type=type_,
        tx_hash=secrets.token_hex(16) if tx_hash else None,
        destination_address=destination,
    ))
    return wallet


def new_referral_code() -> str:
    return "".join(secrets.choice(REFERRAL_CODE_ALPHABET) for _ in range(REFERRAL_CODE_LENGTH))


def get_or_create_referral_code(db: Session, user_id: int) -> ReferralCode:
    rc = db.query(ReferralCode).filter(ReferralCode.user_id == user_id).first()
    if rc is None:
        rc = ReferralCode(user_id=user_id, code=new_referral_code())
        db.add(rc)
        db.flush()
    return rc


def active_boost(db: Session, user_id: int) -> UserActiveBoost | None:
    boost = db.query(UserActiveBoost).filter(UserActiveBoost.user_id == user_id).first()
    return boost if boost and boost.expires_at > utcnow() else None


def category_or_404(db: Session, category: str) -> CategoryCashback:
    from fastapi import HTTPException
    cat = db.query(CategoryCashback).filter(CategoryCashback.category == category).first()
    if cat is None:
        raise HTTPException(400, "Pick a category from the list.")
    return cat


def evaluate_price_alerts(db: Session, price: float) -> int:
    """Trigger any alert the current price has crossed. Returns how many fired.

    This used to run inside `GET /api/btc/price`, which meant an unauthenticated
    read scanned and wrote every user's alerts - a read endpoint performing
    writes, with a cost that grew with total platform users, on the most-called
    route in the app. It now runs on a timer from the application lifespan.
    """
    pending = db.query(PriceAlert).filter(PriceAlert.is_triggered.is_(False)).all()
    fired = 0
    for alert in pending:
        crossed = (
            (alert.direction == "above" and price >= alert.target_price)
            or (alert.direction == "below" and price <= alert.target_price)
        )
        if not crossed:
            continue
        alert.is_triggered, alert.triggered_at = True, utcnow()
        notify(
            db, alert.user_id, "Price alert",
            f"Bitcoin is {alert.direction} ${alert.target_price:,.0f}. It's now ${price:,.0f}.",
            "alert", "bell",
        )
        fired += 1
    if fired:
        db.commit()
    return fired


def award_referral(db: Session, referee, code: str) -> bool:
    """Credit both sides of a referral. Returns False if the code is unusable."""
    rc = db.query(ReferralCode).filter(ReferralCode.code == code.upper()).first()
    if rc is None or rc.user_id == referee.id:
        return False

    from app.models import Referral
    rc.total_referrals += 1
    rc.total_sats_earned += settings.referrer_bonus_sats
    db.add(Referral(referrer_id=rc.user_id, referee_id=referee.id,
                    reward_sats=settings.referrer_bonus_sats))
    credit_wallet(db, rc.user_id, settings.referrer_bonus_sats, "referral_bonus")
    credit_wallet(db, referee.id, settings.referral_welcome_sats, "referral_welcome")
    notify(
        db, rc.user_id, "Referral bonus",
        f"{referee.display_name} joined with your code. "
        f"You earned {settings.referrer_bonus_sats:,} sats.",
        "reward", "gift",
    )
    return True
