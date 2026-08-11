import json

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy.orm import Session

from app.anomaly_detector import score_transaction
from app.auth import get_current_user
from app.btc_service import get_btc_price
from app.clock import utcnow
from app.database import get_db
from app.gamification import check_badges, update_streak
from app.models import RewardEvent, Transaction, User, UserRoundUpConfig
from app.rate_limit import rate_limit
from app.reward_engine import calculate_reward, get_level, round_up_sats
from app.schemas import (
    RewardBreakdown,
    RewardPreviewRequest,
    TransactionCreate,
    TransactionOut,
    TransactionPage,
    TransactionResult,
)
from app.services import active_boost, category_or_404, credit_wallet, notify, total_sats_earned

router = APIRouter(prefix="/api", tags=["transactions"])


def _result(db: Session, tx: Transaction, reward: dict, round_up_info, streak,
            level: dict, new_badges: list, risk, wallet) -> TransactionResult:
    return TransactionResult(
        transaction=TransactionOut.model_validate(tx),
        reward=RewardBreakdown(**reward),
        round_up=round_up_info,
        new_badges=new_badges,
        streak={"current": streak.current_streak, "longest": streak.longest_streak},
        level=level,
        wallet_balance_sats=wallet.balance_sats,
        risk={"score": risk.risk_score, "is_anomaly": risk.is_anomaly,
              "model": risk.model_version, "features": json.loads(risk.features_used)},
    )


@router.post("/transactions", response_model=TransactionResult)
def create_transaction(
    body: TransactionCreate,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Simulate a card purchase and pay the cashback.

    Pass an `Idempotency-Key` header to make retries safe. Without it a
    double-tap on Confirm, or a client retry after a timeout, credits the reward
    twice.

    A replayed key returns 409 carrying the id of the transaction it already
    created, rather than replaying the original response body. Replaying the
    body properly means persisting it against the key - which is the right
    implementation and what payment processors do, but it is more machinery than
    this prototype needs. The guarantee that matters is upheld either way: the
    payout happens exactly once.
    """
    rate_limit(f"tx:{user.id}", 20)

    if idempotency_key:
        existing = db.query(Transaction).filter(
            Transaction.user_id == user.id,
            Transaction.idempotency_key == idempotency_key,
        ).first()
        if existing:
            raise HTTPException(409, {
                "message": "That transaction was already recorded.",
                "transaction_id": existing.id,
            })

    cat = category_or_404(db, body.category)
    price = get_btc_price()["price"]
    earned_before = total_sats_earned(db, user.id)
    level = get_level(earned_before)
    boost = active_boost(db, user.id)
    boost_mult = boost.multiplier if boost and boost.category == body.category else 1.0

    reward = calculate_reward(body.amount_fiat, body.category, price, cat.base_rate,
                              level["multiplier"], boost_mult)

    tx = Transaction(
        user_id=user.id, amount_fiat=body.amount_fiat, category=body.category,
        merchant=body.merchant, btc_price_at_time=price,
        sats_earned=reward["total_sats"], idempotency_key=idempotency_key,
        created_at=utcnow(),
    )
    db.add(tx)
    db.flush()

    db.add(RewardEvent(
        user_id=user.id, transaction_id=tx.id, btc_amount=reward["total_sats"],
        btc_price=price, cashback_rate=cat.base_rate,
        level_multiplier=level["multiplier"], boost_multiplier=boost_mult,
        category=body.category,
    ))
    wallet = credit_wallet(db, user.id, reward["total_sats"], "cashback", tx_hash=True)

    round_up_info = None
    cfg = db.query(UserRoundUpConfig).filter(UserRoundUpConfig.user_id == user.id).first()
    if cfg and cfg.is_enabled:
        spare_usd, spare_sats = round_up_sats(body.amount_fiat, cfg.multiplier, price)
        if spare_sats > 0:
            wallet = credit_wallet(db, user.id, spare_sats, "round_up", tx_hash=True)
            round_up_info = {"spare_usd": spare_usd, "sats": spare_sats,
                             "multiplier": cfg.multiplier}

    streak = update_streak(db, user.id)
    earned_after = earned_before + reward["total_sats"]
    new_level = get_level(earned_after)
    new_badges = check_badges(db, user.id, earned_after, new_level["key"])
    risk = score_transaction(db, user.id, tx)

    notify(db, user.id, f"+{reward['total_sats']:,} sats",
           f"{body.merchant} · ${body.amount_fiat:,.2f} at "
           f"{reward['effective_rate'] * 100:.2f}% back", "reward", "bitcoin")
    if new_level["key"] != level["key"]:
        notify(db, user.id, f"{new_level['name']} unlocked",
               f"Your cashback multiplier is now {new_level['multiplier']}x.",
               "reward", "trending-up")
    for badge in new_badges:
        notify(db, user.id, f"Badge earned: {badge['name']}", badge["description"],
               "reward", badge["icon"])
    if risk.is_anomaly:
        notify(db, user.id, "Unusual transaction",
               f"{body.merchant} scored {risk.risk_score}/100 for risk. "
               "Review it if it wasn't you.", "alert", "shield-alert")

    db.commit()
    db.refresh(tx)
    return _result(db, tx, reward, round_up_info, streak, new_level, new_badges, risk, wallet)


@router.get("/transactions", response_model=TransactionPage)
def list_transactions(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    category: str | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(Transaction).filter(Transaction.user_id == user.id)
    if category:
        q = q.filter(Transaction.category == category)
    total = q.count()
    rows = (q.order_by(Transaction.created_at.desc())
            .offset((page - 1) * per_page).limit(per_page).all())
    return TransactionPage(
        total=total, page=page, per_page=per_page,
        has_more=page * per_page < total,
        items=[TransactionOut.model_validate(t) for t in rows],
    )


@router.post("/rewards/preview", response_model=RewardBreakdown)
def preview_reward(body: RewardPreviewRequest, user: User = Depends(get_current_user),
                   db: Session = Depends(get_db)):
    cat = category_or_404(db, body.category)
    price = get_btc_price()["price"]
    level = get_level(total_sats_earned(db, user.id))
    boost = active_boost(db, user.id)
    mult = boost.multiplier if boost and boost.category == body.category else 1.0
    return RewardBreakdown(**calculate_reward(
        body.amount_fiat, body.category, price, cat.base_rate, level["multiplier"], mult))
