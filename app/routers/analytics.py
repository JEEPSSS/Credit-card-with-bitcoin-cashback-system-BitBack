import csv
import io
from datetime import date, datetime

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.btc_service import sats_to_usd
from app.clock import days_ago
from app.database import get_db
from app.models import CategoryCashback, RewardEvent, Transaction, User, UserStreak
from app.reward_engine import SATS_PER_BTC

router = APIRouter(prefix="/api", tags=["analytics"])

PERIOD_DAYS = {"7d": 7, "30d": 30, "90d": 90, "all": 3650}
RECAP_DAYS = 30
FLAT_WHITE_USD = 4.50


def _fair_market_value(db: Session, user_id: int, since: datetime | None = None) -> float:
    """USD value of rewards at the price each was earned at.

    Valuing historical rewards at today's price is wrong twice over: it makes
    the reported cashback rate move with the market rather than describe the
    card, and it disagrees with the tax report, which correctly uses fair market
    value on receipt. `RewardEvent.btc_price` is recorded for exactly this.
    """
    q = db.query(func.coalesce(
        func.sum(RewardEvent.btc_amount * RewardEvent.btc_price / SATS_PER_BTC), 0.0)
    ).filter(RewardEvent.user_id == user_id)
    if since is not None:
        q = q.filter(RewardEvent.created_at >= since)
    return float(q.scalar() or 0.0)


@router.get("/analytics/spending")
def spending(period: str = Query("30d", pattern="^(7d|30d|90d|all)$"),
             user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    since = days_ago(PERIOD_DAYS[period])
    rows = db.query(
        Transaction.category,
        func.sum(Transaction.amount_fiat),
        func.sum(Transaction.sats_earned),
        func.count(Transaction.id),
    ).filter(Transaction.user_id == user.id, Transaction.created_at >= since)\
     .group_by(Transaction.category).all()

    icons = {c.category: c.icon for c in db.query(CategoryCashback)}
    total_spent = sum(r[1] for r in rows) or 0.0
    return {
        "period": period,
        "total_spent": round(total_spent, 2),
        "total_sats": int(sum(r[2] for r in rows) or 0),
        "categories": sorted([
            {"category": c, "total_spent": round(s, 2), "sats_earned": int(sats),
             "transaction_count": n, "icon": icons.get(c, "credit-card"),
             "share": round(s / total_spent, 4) if total_spent else 0}
            for c, s, sats, n in rows], key=lambda x: x["total_spent"], reverse=True),
    }


@router.get("/analytics/insights")
def insights(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    mine = Transaction.user_id == user.id
    count, total_spent, total_sats, first_at = db.query(
        func.count(Transaction.id),
        func.coalesce(func.sum(Transaction.amount_fiat), 0.0),
        func.coalesce(func.sum(Transaction.sats_earned), 0),
        func.min(Transaction.created_at),
    ).filter(mine).one()

    if not count:
        return {"has_data": False, "message": "Your first transaction unlocks insights."}

    top_category, top_spent = db.query(
        Transaction.category, func.sum(Transaction.amount_fiat).label("spent")
    ).filter(mine).group_by(Transaction.category).order_by(func.sum(
        Transaction.amount_fiat).desc()).limit(1).one()

    biggest = db.query(Transaction).filter(mine).order_by(
        Transaction.sats_earned.desc()).limit(1).one()

    span_days = max(1, (days_ago(0) - first_at).days)
    earned_usd = _fair_market_value(db, user.id)

    return {
        "has_data": True,
        "top_category": {"category": top_category, "total_spent": round(top_spent, 2)},
        "average_transaction": round(total_spent / count, 2),
        "daily_average_sats": int(total_sats / span_days),
        "biggest_reward": {"merchant": biggest.merchant, "sats": biggest.sats_earned,
                           "amount_fiat": biggest.amount_fiat},
        "effective_rate": round(earned_usd / total_spent, 4) if total_spent else 0,
        "projected_yearly_sats": int(total_sats / span_days * 365),
    }


@router.get("/analytics/recap")
def recap(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    since = days_ago(RECAP_DAYS)
    mine = Transaction.user_id == user.id
    recent = (mine, Transaction.created_at >= since)

    count, total_spent, total_sats = db.query(
        func.count(Transaction.id),
        func.coalesce(func.sum(Transaction.amount_fiat), 0.0),
        func.coalesce(func.sum(Transaction.sats_earned), 0),
    ).filter(*recent).one()

    if not count:
        return {"has_data": False, "message": "Come back after a month of spending."}

    top_category, top_sats = db.query(
        Transaction.category, func.sum(Transaction.sats_earned)
    ).filter(*recent).group_by(Transaction.category).order_by(
        func.sum(Transaction.sats_earned).desc()).limit(1).one()

    biggest = db.query(Transaction).filter(*recent).order_by(
        Transaction.sats_earned.desc()).limit(1).one()
    streak = db.query(UserStreak).filter(UserStreak.user_id == user.id).first()

    # Percentile against every other account's 30-day total, computed in SQL.
    # The user's own row is excluded so a solo user is not ranked against
    # themselves and pinned at the 0th percentile.
    totals = db.query(func.sum(Transaction.sats_earned)).filter(
        Transaction.created_at >= since, Transaction.user_id != user.id
    ).group_by(Transaction.user_id).all()
    peers = [t[0] or 0 for t in totals]
    percentile = (int(round(sum(1 for v in peers if v < total_sats) / len(peers) * 100))
                  if peers else 50)

    usd = sats_to_usd(total_sats)
    return {
        "has_data": True,
        "period": f"Last {RECAP_DAYS} days",
        "total_sats": int(total_sats),
        "total_usd": usd,
        "total_spent": round(total_spent, 2),
        "transaction_count": count,
        "top_category": {"category": top_category, "sats": int(top_sats)},
        "biggest_reward": {"merchant": biggest.merchant, "sats": biggest.sats_earned},
        "streak": streak.longest_streak if streak else 0,
        "percentile": percentile,
        "fun_facts": [
            f"That's {usd / FLAT_WHITE_USD:.1f} flat whites paid for by your own spending.",
            f"You averaged {int(total_sats) // max(1, count):,} sats a transaction.",
            f"At this rate you'd stack {int(total_sats) * 12:,} sats a year.",
        ],
    }


@router.get("/tax/report")
def tax_report(year: int = Query(default_factory=lambda: date.today().year, ge=2009, le=2100),
               user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Cashback rewards as a CSV, valued at fair market value on receipt.

    Cashback received in bitcoin is income at the moment it is received, valued
    at the price at that moment - which is why `btc_price` is stored per reward
    event rather than recomputed later.
    """
    rows = db.query(RewardEvent).filter(
        RewardEvent.user_id == user.id,
        RewardEvent.created_at >= datetime(year, 1, 1),
        RewardEvent.created_at < datetime(year + 1, 1, 1),
    ).order_by(RewardEvent.created_at).all()

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["Date", "Category", "Sats received", "BTC amount",
                     "BTC price (USD)", "Fair market value (USD)", "Type"])
    for r in rows:
        writer.writerow([
            r.created_at.strftime("%Y-%m-%d %H:%M:%S"), r.category, r.btc_amount,
            f"{r.btc_amount / SATS_PER_BTC:.8f}", f"{r.btc_price:.2f}",
            f"{(r.btc_amount / SATS_PER_BTC) * r.btc_price:.2f}", "Cashback reward",
        ])
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]), media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="bitback-{year}.csv"'})
