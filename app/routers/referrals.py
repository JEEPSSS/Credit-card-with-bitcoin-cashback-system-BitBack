from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.config import settings
from app.database import get_db
from app.models import ReferralCode, User
from app.services import get_or_create_referral_code

router = APIRouter(prefix="/api/referral", tags=["referrals"])


@router.get("")
def my_referral(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rc = get_or_create_referral_code(db, user.id)
    db.commit()
    return {"code": rc.code, "total_referrals": rc.total_referrals,
            "total_sats_earned": rc.total_sats_earned,
            "referrer_bonus": settings.referrer_bonus_sats,
            "welcome_bonus": settings.referral_welcome_sats}


@router.get("/leaderboard")
def referral_leaderboard(limit: int = Query(10, ge=1, le=50),
                         user: User = Depends(get_current_user),
                         db: Session = Depends(get_db)):
    """Top referrers by count.

    Authenticated: it exposes other users' display names, so it should not be
    readable by anyone who can reach the host.
    """
    rows = (db.query(ReferralCode, User)
            .join(User, User.id == ReferralCode.user_id)
            .filter(ReferralCode.total_referrals > 0)
            .order_by(ReferralCode.total_referrals.desc())
            .limit(limit).all())
    return [{"rank": i + 1, "display_name": u.display_name,
             "total_referrals": rc.total_referrals,
             "total_sats_earned": rc.total_sats_earned}
            for i, (rc, u) in enumerate(rows)]
