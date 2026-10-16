from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.btc_service import get_btc_price
from app.database import get_db
from app.models import CategoryCashback
from app.reward_engine import SATS_PER_BTC

router = APIRouter(prefix="/api", tags=["market"])


@router.get("/btc/price")
def btc_price():
    """Current BTC price. A pure read - alert evaluation runs on a timer."""
    data = get_btc_price()
    price = data["price"]
    return {
        "price": price,
        "change_24h": data["change_24h"],
        "currency": "USD",
        "sats_per_dollar": int(SATS_PER_BTC / price) if price else 0,
        # So the client can say "price from 12 minutes ago" instead of
        # presenting an old or fallback number as live.
        "stale": data["stale"],
        "age_seconds": data["age_seconds"],
    }


@router.get("/categories")
def categories(db: Session = Depends(get_db)):
    return [
        {"category": c.category, "base_rate": c.base_rate,
         "icon": c.icon, "description": c.description}
        for c in db.query(CategoryCashback).order_by(CategoryCashback.category)
    ]
