from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import Notification, PriceAlert, User
from app.schemas import AlertCreate

router = APIRouter(prefix="/api", tags=["alerts & notifications"])

MAX_ALERTS_PER_USER = 20


@router.get("/alerts")
def list_alerts(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.query(PriceAlert).filter(PriceAlert.user_id == user.id)\
        .order_by(PriceAlert.created_at.desc()).all()
    return [{"id": a.id, "target_price": a.target_price, "direction": a.direction,
             "is_triggered": a.is_triggered, "triggered_at": a.triggered_at,
             "created_at": a.created_at} for a in rows]


@router.post("/alerts")
def create_alert(body: AlertCreate, user: User = Depends(get_current_user),
                 db: Session = Depends(get_db)):
    # Alerts are evaluated on a timer over every untriggered row, so an
    # unbounded number of them per user is a shared cost, not a private one.
    open_alerts = db.query(PriceAlert).filter(
        PriceAlert.user_id == user.id, PriceAlert.is_triggered.is_(False)).count()
    if open_alerts >= MAX_ALERTS_PER_USER:
        raise HTTPException(
            400, f"You already have {MAX_ALERTS_PER_USER} alerts waiting. Delete one first.")

    alert = PriceAlert(user_id=user.id, target_price=body.target_price,
                       direction=body.direction)
    db.add(alert)
    db.commit()
    db.refresh(alert)
    return {"id": alert.id, "target_price": alert.target_price,
            "direction": alert.direction, "is_triggered": False}


@router.delete("/alerts/{alert_id}")
def delete_alert(alert_id: int, user: User = Depends(get_current_user),
                 db: Session = Depends(get_db)):
    alert = db.query(PriceAlert).filter(
        PriceAlert.id == alert_id, PriceAlert.user_id == user.id).first()
    if alert is None:
        raise HTTPException(404, "That alert no longer exists.")
    db.delete(alert)
    db.commit()
    return {"message": "Alert deleted."}


@router.get("/notifications")
def list_notifications(page: int = Query(1, ge=1), per_page: int = Query(30, ge=1, le=100),
                       user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    mine = db.query(Notification).filter(Notification.user_id == user.id)
    total = mine.count()
    unread = mine.filter(Notification.is_read.is_(False)).count()
    rows = (mine.order_by(Notification.created_at.desc())
            .offset((page - 1) * per_page).limit(per_page).all())
    return {
        "total": total, "unread_count": unread, "page": page, "per_page": per_page,
        "has_more": page * per_page < total,
        "items": [{"id": n.id, "title": n.title, "message": n.message, "type": n.type,
                   "icon": n.icon, "is_read": n.is_read, "created_at": n.created_at}
                  for n in rows],
    }


@router.post("/notifications/read-all")
def read_all(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    marked = db.query(Notification).filter(
        Notification.user_id == user.id,
        Notification.is_read.is_(False),
    ).update({"is_read": True})
    db.commit()
    return {"marked_read": marked}
