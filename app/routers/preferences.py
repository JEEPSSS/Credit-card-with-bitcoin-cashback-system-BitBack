"""Round-up and auto-withdraw settings."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import AutoWithdrawConfig, User, UserRoundUpConfig
from app.schemas import AutoWithdrawUpdate, RoundUpUpdate

router = APIRouter(prefix="/api", tags=["preferences"])


def _get_or_create(db: Session, model, user_id: int):
    row = db.query(model).filter(model.user_id == user_id).first()
    if row is None:
        row = model(user_id=user_id)
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


@router.get("/roundup/config")
def get_roundup(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    c = _get_or_create(db, UserRoundUpConfig, user.id)
    return {"is_enabled": c.is_enabled, "multiplier": c.multiplier}


@router.put("/roundup/config")
def set_roundup(body: RoundUpUpdate, user: User = Depends(get_current_user),
                db: Session = Depends(get_db)):
    c = _get_or_create(db, UserRoundUpConfig, user.id)
    c.is_enabled, c.multiplier = body.is_enabled, body.multiplier
    db.commit()
    return {"is_enabled": c.is_enabled, "multiplier": c.multiplier}


@router.get("/auto-withdraw/config")
def get_auto_withdraw(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    c = _get_or_create(db, AutoWithdrawConfig, user.id)
    return {"is_enabled": c.is_enabled, "threshold_sats": c.threshold_sats,
            "destination_address": c.destination_address}


@router.put("/auto-withdraw/config")
def set_auto_withdraw(body: AutoWithdrawUpdate, user: User = Depends(get_current_user),
                      db: Session = Depends(get_db)):
    if body.is_enabled and not body.destination_address:
        raise HTTPException(400, "Add a destination address before turning this on.")
    c = _get_or_create(db, AutoWithdrawConfig, user.id)
    c.is_enabled = body.is_enabled
    c.threshold_sats = body.threshold_sats
    c.destination_address = body.destination_address
    db.commit()
    return {"is_enabled": c.is_enabled, "threshold_sats": c.threshold_sats,
            "destination_address": c.destination_address}
