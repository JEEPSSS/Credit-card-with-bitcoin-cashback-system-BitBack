from datetime import timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.btc_service import sats_to_usd
from app.clock import utcnow
from app.database import get_db
from app.gamification import badge_state
from app.models import CategoryCashback, Transaction, User, UserActiveBoost, UserStreak
from app.reward_engine import LEVELS, get_level
from app.schemas import BoostActivate
from app.services import active_boost, category_or_404, notify, total_sats_earned

router = APIRouter(prefix="/api/rewards", tags=["rewards"])

BOOST_MULTIPLIER = 2.0
BOOST_DURATION_DAYS = 30


@router.get("/summary")
def rewards_summary(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    total = total_sats_earned(db, user.id)
    streak = db.query(UserStreak).filter(UserStreak.user_id == user.id).first()
    boost = active_boost(db, user.id)
    tx_count = db.query(func.count(Transaction.id)).filter(
        Transaction.user_id == user.id).scalar() or 0
    return {
        "total_sats_earned": total,
        "total_usd_earned": sats_to_usd(total),
        "transaction_count": tx_count,
        "level": get_level(total),
        "levels": LEVELS,
        "streak": {"current": streak.current_streak if streak else 0,
                   "longest": streak.longest_streak if streak else 0},
        "badges": badge_state(db, user.id),
        "active_boost": {"category": boost.category, "multiplier": boost.multiplier,
                         "expires_at": boost.expires_at} if boost else None,
    }


@router.get("/boosts")
def list_boosts(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    boost = active_boost(db, user.id)
    return {
        "active": {
            "category": boost.category,
            "multiplier": boost.multiplier,
            "expires_at": boost.expires_at,
            "days_remaining": max(0, (boost.expires_at - utcnow()).days),
        } if boost else None,
        "available": [
            {"category": c.category, "base_rate": c.base_rate,
             "boosted_rate": round(c.base_rate * BOOST_MULTIPLIER, 4), "icon": c.icon,
             "description": c.description,
             "is_active": bool(boost and boost.category == c.category)}
            for c in db.query(CategoryCashback).order_by(CategoryCashback.category)
        ],
    }


@router.post("/boosts/activate")
def activate_boost(body: BoostActivate, user: User = Depends(get_current_user),
                   db: Session = Depends(get_db)):
    category_or_404(db, body.category)
    expires = utcnow() + timedelta(days=BOOST_DURATION_DAYS)
    existing = db.query(UserActiveBoost).filter(UserActiveBoost.user_id == user.id).first()
    if existing:
        existing.category, existing.multiplier = body.category, BOOST_MULTIPLIER
        existing.activated_at, existing.expires_at = utcnow(), expires
    else:
        db.add(UserActiveBoost(user_id=user.id, category=body.category,
                               multiplier=BOOST_MULTIPLIER, expires_at=expires))
    notify(db, user.id, "Boost active",
           f"{body.category.title()} earns double sats for the next "
           f"{BOOST_DURATION_DAYS} days.", "reward", "flame")
    db.commit()
    return {"category": body.category, "multiplier": BOOST_MULTIPLIER, "expires_at": expires}
