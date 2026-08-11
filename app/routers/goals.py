from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.clock import utcnow
from app.database import get_db
from app.models import SavingsGoal, User
from app.schemas import GoalAllocate, GoalCreate
from app.services import credit_wallet, get_wallet, notify

router = APIRouter(prefix="/api/goals", tags=["goals"])


def _serialise(g: SavingsGoal) -> dict:
    return {
        "id": g.id, "name": g.name, "target_sats": g.target_sats,
        "current_sats": g.current_sats, "icon": g.icon,
        "is_completed": g.is_completed,
        "progress": round(min(1.0, g.current_sats / g.target_sats), 4) if g.target_sats else 0,
        "created_at": g.created_at,
    }


def _owned_goal(db: Session, goal_id: int, user_id: int) -> SavingsGoal:
    goal = db.query(SavingsGoal).filter(
        SavingsGoal.id == goal_id, SavingsGoal.user_id == user_id).first()
    if goal is None:
        raise HTTPException(404, "That goal no longer exists.")
    return goal


@router.get("")
def list_goals(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.query(SavingsGoal).filter(SavingsGoal.user_id == user.id)\
        .order_by(SavingsGoal.created_at.desc()).all()
    return [_serialise(g) for g in rows]


@router.post("")
def create_goal(body: GoalCreate, user: User = Depends(get_current_user),
                db: Session = Depends(get_db)):
    goal = SavingsGoal(user_id=user.id, name=body.name,
                       target_sats=body.target_sats, icon=body.icon)
    db.add(goal)
    db.commit()
    db.refresh(goal)
    return _serialise(goal)


@router.post("/{goal_id}/allocate")
def allocate_goal(goal_id: int, body: GoalAllocate, user: User = Depends(get_current_user),
                  db: Session = Depends(get_db)):
    goal = _owned_goal(db, goal_id, user.id)
    wallet = get_wallet(db, user.id, for_update=True)
    if wallet.balance_sats < body.sats:
        raise HTTPException(400, f"You have {wallet.balance_sats:,} sats available.")

    credit_wallet(db, user.id, -body.sats, "goal_allocation")
    goal.current_sats += body.sats
    if goal.current_sats >= goal.target_sats and not goal.is_completed:
        goal.is_completed, goal.completed_at = True, utcnow()
        notify(db, user.id, "Goal reached", f"You funded {goal.name} in full.",
               "reward", "trophy")
    db.commit()
    return {"id": goal.id, "current_sats": goal.current_sats,
            "is_completed": goal.is_completed, "wallet_balance_sats": wallet.balance_sats}


@router.delete("/{goal_id}")
def delete_goal(goal_id: int, user: User = Depends(get_current_user),
                db: Session = Depends(get_db)):
    goal = _owned_goal(db, goal_id, user.id)
    returned = goal.current_sats
    if returned:
        credit_wallet(db, user.id, returned, "goal_allocation")
    db.delete(goal)
    db.commit()
    return {"message": "Goal deleted.", "sats_returned": returned}
