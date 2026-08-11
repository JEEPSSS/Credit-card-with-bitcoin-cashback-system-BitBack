"""Endpoints backed by the analytical models in `app/`."""
import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.anomaly_detector import get_fraud_summary
from app.auth import get_current_user
from app.btc_service import sats_to_usd
from app.database import get_db
from app.ml_forecast import forecast_earnings
from app.models import Transaction, TransactionRiskScore, User
from app.smart_recommender import recommend_boost
from app.spending_persona import classify_persona

router = APIRouter(prefix="/api", tags=["models"])


@router.get("/forecast")
def forecast(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    result = forecast_earnings(db, user.id)
    if result.get("has_enough_data"):
        result["predicted_usd_30d"] = sats_to_usd(result["predicted_sats_30d"])
    return result


@router.get("/fraud/summary")
def fraud_summary(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return get_fraud_summary(db, user.id)


@router.get("/fraud/flagged")
def fraud_flagged(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = (db.query(TransactionRiskScore, Transaction)
            .join(Transaction, Transaction.id == TransactionRiskScore.transaction_id)
            .filter(TransactionRiskScore.user_id == user.id,
                    TransactionRiskScore.is_anomaly.is_(True))
            .order_by(TransactionRiskScore.risk_score.desc()).all())
    return [{"transaction_id": t.id, "merchant": t.merchant, "category": t.category,
             "amount_fiat": t.amount_fiat, "risk_score": s.risk_score,
             "model_version": s.model_version, "features": json.loads(s.features_used),
             "created_at": t.created_at} for s, t in rows]


@router.get("/fraud/score/{transaction_id}")
def fraud_score(transaction_id: int, user: User = Depends(get_current_user),
                db: Session = Depends(get_db)):
    score = db.query(TransactionRiskScore).filter(
        TransactionRiskScore.transaction_id == transaction_id,
        TransactionRiskScore.user_id == user.id).first()
    if score is None:
        raise HTTPException(404, "No risk score for that transaction.")
    return {"transaction_id": transaction_id, "risk_score": score.risk_score,
            "is_anomaly": score.is_anomaly, "model_version": score.model_version,
            "features": json.loads(score.features_used)}


@router.get("/ai/boost-recommendation")
def boost_recommendation(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return recommend_boost(db, user.id)


@router.get("/ai/persona")
def persona(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return classify_persona(db, user.id)
