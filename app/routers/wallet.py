from collections import defaultdict
from datetime import timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.btc_service import get_btc_price, sats_to_usd
from app.clock import days_ago
from app.database import get_db
from app.models import User, WalletTransaction
from app.reward_engine import SATS_PER_BTC
from app.schemas import WalletOut
from app.services import get_wallet

router = APIRouter(prefix="/api/wallet", tags=["wallet"])

PERIOD_DAYS = {"7d": 7, "30d": 30, "90d": 90, "all": 365}


@router.get("", response_model=WalletOut)
def wallet(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    w = get_wallet(db, user.id)
    db.commit()          # persists the wallet if this is the first ever read
    price = get_btc_price()["price"]
    return WalletOut(
        balance_sats=w.balance_sats,
        balance_btc=round(w.balance_sats / SATS_PER_BTC, 8),
        balance_usd=sats_to_usd(w.balance_sats, price),
        btc_price=price,
        updated_at=w.updated_at,
    )


@router.get("/growth")
def wallet_growth(period: str = Query("30d", pattern="^(7d|30d|90d|all)$"),
                  user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Daily running balance across the period.

    The opening balance is summed in SQL rather than by loading every ledger row
    the user has ever had and adding them up in Python.
    """
    days = PERIOD_DAYS[period]
    since = days_ago(days)
    mine = WalletTransaction.user_id == user.id

    opening = int(
        db.query(func.coalesce(func.sum(WalletTransaction.amount_sats), 0))
        .filter(mine, WalletTransaction.created_at < since).scalar() or 0
    )
    rows = (db.query(WalletTransaction.created_at, WalletTransaction.amount_sats)
            .filter(mine, WalletTransaction.created_at >= since).all())

    buckets: dict = defaultdict(int)
    for created_at, amount in rows:
        buckets[created_at.date()] += amount

    price = get_btc_price()["price"]
    start = since.date()
    running, series = opening, []
    for i in range(days + 1):
        day = start + timedelta(days=i)
        running += buckets.get(day, 0)
        series.append({"date": day.isoformat(), "sats": running,
                       "usd": round((running / SATS_PER_BTC) * price, 2)})

    # Growth is what accrued *during* the period, so it measures against the
    # opening balance rather than against the first point (which already
    # includes day zero's activity).
    return {"period": period, "points": series,
            "growth_sats": (series[-1]["sats"] - opening) if series else 0}


@router.get("/transactions")
def wallet_transactions(limit: int = Query(30, ge=1, le=200),
                        user: User = Depends(get_current_user),
                        db: Session = Depends(get_db)):
    rows = (db.query(WalletTransaction)
            .filter(WalletTransaction.user_id == user.id)
            .order_by(WalletTransaction.created_at.desc()).limit(limit).all())
    return [{"id": r.id, "amount_sats": r.amount_sats, "type": r.type,
             "status": r.status, "created_at": r.created_at} for r in rows]
