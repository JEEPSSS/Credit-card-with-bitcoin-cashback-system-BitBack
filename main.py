import csv
import io
import json
import random
import secrets
import string
import time
from collections import defaultdict
from datetime import date, datetime, timedelta

import pyotp
from fastapi import Depends, FastAPI, HTTPException, Query, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.anomaly_detector import get_fraud_summary, score_transaction
from app.auth import (create_access_token, decode_token, get_current_user,
                      hash_password, verify_password)
from app.database import Base, SessionLocal, engine, get_db
from app.gamification import BADGES, badge_state, check_badges, update_streak
from app.ml_forecast import forecast_earnings
from app.models import (AutoWithdrawConfig, CategoryCashback, Notification,
                        PriceAlert, Referral, ReferralCode, RewardEvent,
                        SavingsGoal, Transaction, TransactionRiskScore, User,
                        UserActiveBoost, UserRoundUpConfig, UserStreak,
                        UserTOTP, WalletBalance, WalletTransaction)
from app.reward_engine import LEVELS, SATS_PER_BTC, calculate_reward, get_level, round_up_sats
from app.schemas import *  # noqa: F403
from app.smart_recommender import recommend_boost
from app.spending_persona import classify_persona
from app.btc_service import get_btc_price, sats_to_usd

app = FastAPI(title="BitBack API", version="1.0.0",
              description="Bitcoin cashback card simulation backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],          # LAN device testing; tighten for deployment
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SEED_CATEGORIES = [
    ("dining", 0.03, "utensils", "Restaurants and cafes"),
    ("transport", 0.015, "car", "Rides, fuel, transit"),
    ("shopping", 0.02, "shopping-bag", "Retail and online shopping"),
    ("entertainment", 0.02, "gamepad-2", "Streaming, gaming, events"),
    ("groceries", 0.02, "carrot", "Supermarkets and food delivery"),
    ("travel", 0.03, "plane", "Airlines, hotels, bookings"),
    ("health", 0.015, "heart-pulse", "Pharmacy, gym, medical"),
    ("education", 0.01, "book-open", "Courses, books, supplies"),
    ("bills", 0.01, "file-text", "Utilities, subscriptions, rent"),
    ("general", 0.015, "credit-card", "Everything else"),
]


@app.on_event("startup")
def startup():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        if db.query(CategoryCashback).count() == 0:
            db.add_all([CategoryCashback(category=c, base_rate=r, icon=i, description=d)
                        for c, r, i, d in SEED_CATEGORIES])
            db.commit()
    finally:
        db.close()


# ---------------------------------------------------------------- rate limits
_hits: dict[str, list[float]] = defaultdict(list)


def rate_limit(key: str, limit: int, window: int = 60):
    now = time.time()
    _hits[key] = [t for t in _hits[key] if now - t < window]
    if len(_hits[key]) >= limit:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS,
                            "Too many attempts. Wait a minute and try again.")
    _hits[key].append(now)


def notify(db: Session, user_id: int, title: str, message: str, type_: str, icon: str):
    db.add(Notification(user_id=user_id, title=title, message=message, type=type_, icon=icon))


def total_sats_earned(db: Session, user_id: int) -> int:
    return int(db.query(func.coalesce(func.sum(RewardEvent.btc_amount), 0))
               .filter(RewardEvent.user_id == user_id).scalar() or 0)


def get_wallet(db: Session, user_id: int) -> WalletBalance:
    w = db.query(WalletBalance).filter(WalletBalance.user_id == user_id).first()
    if w is None:
        w = WalletBalance(user_id=user_id, btc_balance=0.0)
        db.add(w)
        db.flush()
    return w


def active_boost(db: Session, user_id: int) -> UserActiveBoost | None:
    b = db.query(UserActiveBoost).filter(UserActiveBoost.user_id == user_id).first()
    if b and b.expires_at > datetime.utcnow():
        return b
    return None


# ------------------------------------------------------------------ auth
@app.post("/api/auth/register", response_model=TokenResponse)
def register(body: RegisterRequest, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == body.email.lower()).first():
        raise HTTPException(400, "That email is already registered.")
    user = User(email=body.email.lower(), password_hash=hash_password(body.password),
                display_name=body.display_name)
    db.add(user)
    db.flush()

    db.add_all([
        WalletBalance(user_id=user.id, btc_balance=0.0),
        UserStreak(user_id=user.id),
        UserRoundUpConfig(user_id=user.id, is_enabled=False, multiplier=1.0),
        AutoWithdrawConfig(user_id=user.id, is_enabled=False, threshold_sats=100_000),
        ReferralCode(user_id=user.id,
                     code="".join(random.choices(string.ascii_uppercase + string.digits, k=8))),
    ])

    if body.referral_code:
        rc = db.query(ReferralCode).filter(ReferralCode.code == body.referral_code.upper()).first()
        if rc and rc.user_id != user.id:
            REFERRER_BONUS, WELCOME_BONUS = 5000, 2500
            rc.total_referrals += 1
            rc.total_sats_earned += REFERRER_BONUS
            db.add(Referral(referrer_id=rc.user_id, referee_id=user.id, reward_sats=REFERRER_BONUS))
            ref_wallet = get_wallet(db, rc.user_id)
            ref_wallet.btc_balance += REFERRER_BONUS
            db.add_all([
                WalletTransaction(user_id=rc.user_id, amount_sats=REFERRER_BONUS, type="referral_bonus"),
                WalletTransaction(user_id=user.id, amount_sats=WELCOME_BONUS, type="referral_welcome"),
            ])
            get_wallet(db, user.id).btc_balance += WELCOME_BONUS
            notify(db, rc.user_id, "Referral bonus",
                   f"{user.display_name} joined with your code. You earned {REFERRER_BONUS:,} sats.",
                   "reward", "gift")

    notify(db, user.id, "Welcome to BitBack",
           "Your card is ready. Every purchase now earns bitcoin.", "system", "sparkles")
    db.commit()
    return TokenResponse(access_token=create_access_token(user.id),
                         user={"id": user.id, "email": user.email, "display_name": user.display_name})


@app.post("/api/auth/login", response_model=TokenResponse)
def login(body: LoginRequest, request: Request, db: Session = Depends(get_db)):
    rate_limit(f"login:{request.client.host}", 5)
    user = db.query(User).filter(User.email == body.email.lower()).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "That email and password don't match.")

    totp = db.query(UserTOTP).filter(UserTOTP.user_id == user.id, UserTOTP.is_enabled.is_(True)).first()
    if totp:
        return TokenResponse(access_token="", requires_2fa=True,
                             challenge_token=create_access_token(user.id, "2fa", minutes=5))
    return TokenResponse(access_token=create_access_token(user.id),
                         user={"id": user.id, "email": user.email, "display_name": user.display_name})


@app.get("/api/auth/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user


@app.post("/api/auth/forgot-password")
def forgot_password(body: ForgotPasswordRequest, request: Request, db: Session = Depends(get_db)):
    rate_limit(f"forgot:{request.client.host}", 3)
    user = db.query(User).filter(User.email == body.email.lower()).first()
    # Always the same shape so the endpoint can't be used to enumerate accounts.
    response = {"message": "If that email has an account, a reset link is on its way."}
    if user:
        response["reset_token"] = create_access_token(user.id, "reset", minutes=15)
    return response


@app.post("/api/auth/reset-password")
def reset_password(body: ResetPasswordRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == decode_token(body.token, "reset")).first()
    if not user:
        raise HTTPException(400, "That reset link is no longer valid.")
    user.password_hash = hash_password(body.new_password)
    db.commit()
    return {"message": "Password updated. Sign in with your new password."}


# ------------------------------------------------------------------ 2FA
@app.post("/api/auth/2fa/setup")
def totp_setup(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    record = db.query(UserTOTP).filter(UserTOTP.user_id == user.id).first()
    if record and record.is_enabled:
        raise HTTPException(400, "Two-factor authentication is already on.")
    secret = pyotp.random_base32()
    codes = ["-".join(secrets.token_hex(2).upper() for _ in range(2)) for _ in range(8)]
    if record:
        record.secret_key, record.backup_codes, record.is_enabled = secret, json.dumps(codes), False
    else:
        db.add(UserTOTP(user_id=user.id, secret_key=secret, backup_codes=json.dumps(codes)))
    db.commit()
    uri = pyotp.TOTP(secret).provisioning_uri(name=user.email, issuer_name="BitBack")
    return {"secret": secret, "otpauth_uri": uri, "backup_codes": codes}


@app.post("/api/auth/2fa/verify")
def totp_verify(body: TOTPVerify, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    record = db.query(UserTOTP).filter(UserTOTP.user_id == user.id).first()
    if not record:
        raise HTTPException(400, "Start the setup first.")
    if not pyotp.TOTP(record.secret_key).verify(body.code, valid_window=1):
        raise HTTPException(400, "That code isn't right. Check your authenticator app.")
    record.is_enabled = True
    notify(db, user.id, "Two-factor enabled", "Your account now needs a code at sign-in.", "system", "lock")
    db.commit()
    return {"message": "Two-factor authentication is on.", "is_enabled": True}


@app.post("/api/auth/2fa/disable")
def totp_disable(body: TOTPVerify, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    record = db.query(UserTOTP).filter(UserTOTP.user_id == user.id).first()
    if not record or not record.is_enabled:
        raise HTTPException(400, "Two-factor authentication isn't on.")
    if not pyotp.TOTP(record.secret_key).verify(body.code, valid_window=1):
        raise HTTPException(400, "That code isn't right.")
    record.is_enabled = False
    db.commit()
    return {"message": "Two-factor authentication is off.", "is_enabled": False}


@app.post("/api/auth/2fa/authenticate", response_model=TokenResponse)
def totp_authenticate(body: TOTPAuthenticate, db: Session = Depends(get_db)):
    user_id = decode_token(body.challenge_token, "2fa")
    record = db.query(UserTOTP).filter(UserTOTP.user_id == user_id).first()
    user = db.query(User).filter(User.id == user_id).first()
    if not record or not user:
        raise HTTPException(400, "That sign-in attempt expired. Start again.")

    codes = json.loads(record.backup_codes or "[]")
    if pyotp.TOTP(record.secret_key).verify(body.code, valid_window=1):
        pass
    elif body.code.upper() in codes:
        codes.remove(body.code.upper())
        record.backup_codes = json.dumps(codes)
    else:
        raise HTTPException(400, "That code isn't right.")
    db.commit()
    return TokenResponse(access_token=create_access_token(user.id),
                         user={"id": user.id, "email": user.email, "display_name": user.display_name})


@app.get("/api/auth/2fa/status")
def totp_status(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    r = db.query(UserTOTP).filter(UserTOTP.user_id == user.id).first()
    return {"is_enabled": bool(r and r.is_enabled)}


# ------------------------------------------------------------------ prices
@app.get("/api/btc/price")
def btc_price(db: Session = Depends(get_db)):
    data = get_btc_price()
    price = data["price"]
    pending = db.query(PriceAlert).filter(PriceAlert.is_triggered.is_(False)).all()
    for a in pending:
        if (a.direction == "above" and price >= a.target_price) or \
           (a.direction == "below" and price <= a.target_price):
            a.is_triggered, a.triggered_at = True, datetime.utcnow()
            notify(db, a.user_id, "Price alert",
                   f"Bitcoin is {a.direction} ${a.target_price:,.0f}. It's now ${price:,.0f}.",
                   "alert", "bell")
    if pending:
        db.commit()
    return {"price": price, "change_24h": data["change_24h"], "currency": "USD",
            "sats_per_dollar": int(SATS_PER_BTC / price) if price else 0}


@app.get("/api/categories")
def categories(db: Session = Depends(get_db)):
    return [{"category": c.category, "base_rate": c.base_rate, "icon": c.icon,
             "description": c.description} for c in db.query(CategoryCashback).all()]


# ------------------------------------------------------------------ transactions
@app.post("/api/transactions", response_model=TransactionResult)
def create_transaction(body: TransactionCreate, user: User = Depends(get_current_user),
                       db: Session = Depends(get_db)):
    rate_limit(f"tx:{user.id}", 20)
    cat = db.query(CategoryCashback).filter(CategoryCashback.category == body.category).first()
    if not cat:
        raise HTTPException(400, "Pick a category from the list.")

    price = get_btc_price()["price"]
    earned_before = total_sats_earned(db, user.id)
    level = get_level(earned_before)
    boost = active_boost(db, user.id)
    boost_mult = boost.multiplier if boost and boost.category == body.category else 1.0

    reward = calculate_reward(body.amount_fiat, body.category, price, cat.base_rate,
                              level["multiplier"], boost_mult)

    tx = Transaction(user_id=user.id, amount_fiat=body.amount_fiat, category=body.category,
                     merchant=body.merchant, btc_price_at_time=price,
                     sats_earned=reward["total_sats"], created_at=datetime.utcnow())
    db.add(tx)
    db.flush()

    db.add(RewardEvent(user_id=user.id, transaction_id=tx.id, btc_amount=reward["total_sats"],
                       btc_price=price, cashback_rate=cat.base_rate,
                       level_multiplier=level["multiplier"], boost_multiplier=boost_mult,
                       category=body.category))

    wallet = get_wallet(db, user.id)
    wallet.btc_balance += reward["total_sats"]
    db.add(WalletTransaction(user_id=user.id, amount_sats=reward["total_sats"], type="cashback",
                             tx_hash=secrets.token_hex(16)))

    round_up_info = None
    cfg = db.query(UserRoundUpConfig).filter(UserRoundUpConfig.user_id == user.id).first()
    if cfg and cfg.is_enabled:
        spare_usd, spare_sats = round_up_sats(body.amount_fiat, cfg.multiplier, price)
        if spare_sats > 0:
            wallet.btc_balance += spare_sats
            db.add(WalletTransaction(user_id=user.id, amount_sats=spare_sats, type="round_up",
                                     tx_hash=secrets.token_hex(16)))
            round_up_info = {"spare_usd": spare_usd, "sats": spare_sats, "multiplier": cfg.multiplier}

    streak = update_streak(db, user.id)
    earned_after = earned_before + reward["total_sats"]
    new_level = get_level(earned_after)
    new_badges = check_badges(db, user.id, earned_after, new_level["key"])
    risk = score_transaction(db, user.id, tx)

    notify(db, user.id, f"+{reward['total_sats']:,} sats",
           f"{body.merchant} · ${body.amount_fiat:,.2f} at {reward['effective_rate'] * 100:.2f}% back",
           "reward", "bitcoin")
    if new_level["key"] != level["key"]:
        notify(db, user.id, f"{new_level['name']} unlocked",
               f"Your cashback multiplier is now {new_level['multiplier']}x.", "reward", "trending-up")
    for b in new_badges:
        notify(db, user.id, f"Badge earned: {b['name']}", b["description"], "reward", b["icon"])
    if risk.is_anomaly:
        notify(db, user.id, "Unusual transaction",
               f"{body.merchant} scored {risk.risk_score}/100 for risk. Review it if it wasn't you.",
               "alert", "shield-alert")

    db.commit()
    db.refresh(tx)
    return TransactionResult(
        transaction=TransactionOut.model_validate(tx),
        reward=RewardBreakdown(**reward),
        round_up=round_up_info,
        new_badges=new_badges,
        streak={"current": streak.current_streak, "longest": streak.longest_streak},
        level=new_level,
        wallet_balance_sats=int(wallet.btc_balance),
        risk={"score": risk.risk_score, "is_anomaly": risk.is_anomaly,
              "model": risk.model_version, "features": json.loads(risk.features_used)},
    )


@app.get("/api/transactions")
def list_transactions(page: int = 1, per_page: int = 20, category: str | None = None,
                      user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    q = db.query(Transaction).filter(Transaction.user_id == user.id)
    if category:
        q = q.filter(Transaction.category == category)
    total = q.count()
    rows = q.order_by(Transaction.created_at.desc()).offset((page - 1) * per_page).limit(per_page).all()
    return {"total": total, "page": page, "per_page": per_page,
            "has_more": page * per_page < total,
            "items": [TransactionOut.model_validate(t).model_dump() for t in rows]}


@app.post("/api/rewards/preview")
def preview_reward(body: RewardPreviewRequest, user: User = Depends(get_current_user),
                   db: Session = Depends(get_db)):
    cat = db.query(CategoryCashback).filter(CategoryCashback.category == body.category).first()
    if not cat:
        raise HTTPException(400, "Pick a category from the list.")
    price = get_btc_price()["price"]
    level = get_level(total_sats_earned(db, user.id))
    boost = active_boost(db, user.id)
    mult = boost.multiplier if boost and boost.category == body.category else 1.0
    return calculate_reward(body.amount_fiat, body.category, price, cat.base_rate,
                            level["multiplier"], mult)


# ------------------------------------------------------------------ wallet
@app.get("/api/wallet", response_model=WalletOut)
def wallet(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    w = get_wallet(db, user.id)
    db.commit()
    price = get_btc_price()["price"]
    sats = int(w.btc_balance)
    return WalletOut(balance_sats=sats, balance_btc=round(sats / SATS_PER_BTC, 8),
                     balance_usd=sats_to_usd(sats, price), btc_price=price, updated_at=w.updated_at)


@app.get("/api/wallet/growth")
def wallet_growth(period: str = "30d", user: User = Depends(get_current_user),
                  db: Session = Depends(get_db)):
    days = {"7d": 7, "30d": 30, "90d": 90, "all": 365}.get(period, 30)
    since = datetime.utcnow() - timedelta(days=days)
    rows = db.query(WalletTransaction).filter(
        WalletTransaction.user_id == user.id).order_by(WalletTransaction.created_at).all()

    running, series, buckets = 0, [], defaultdict(int)
    for r in rows:
        if r.created_at < since:
            running += r.amount_sats
        else:
            buckets[r.created_at.date()] += r.amount_sats

    price = get_btc_price()["price"]
    start = since.date()
    for i in range(days + 1):
        d = start + timedelta(days=i)
        running += buckets.get(d, 0)
        series.append({"date": d.isoformat(), "sats": running,
                       "usd": round((running / SATS_PER_BTC) * price, 2)})
    return {"period": period, "points": series,
            "growth_sats": series[-1]["sats"] - series[0]["sats"] if series else 0}


@app.get("/api/wallet/transactions")
def wallet_transactions(limit: int = 30, user: User = Depends(get_current_user),
                        db: Session = Depends(get_db)):
    rows = db.query(WalletTransaction).filter(WalletTransaction.user_id == user.id)\
        .order_by(WalletTransaction.created_at.desc()).limit(limit).all()
    return [{"id": r.id, "amount_sats": r.amount_sats, "type": r.type, "status": r.status,
             "created_at": r.created_at} for r in rows]


# ------------------------------------------------------------------ rewards & boosts
@app.get("/api/rewards/summary")
def rewards_summary(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    total = total_sats_earned(db, user.id)
    level = get_level(total)
    streak = db.query(UserStreak).filter(UserStreak.user_id == user.id).first()
    boost = active_boost(db, user.id)
    tx_count = db.query(func.count(Transaction.id)).filter(Transaction.user_id == user.id).scalar() or 0
    return {
        "total_sats_earned": total,
        "total_usd_earned": sats_to_usd(total),
        "transaction_count": tx_count,
        "level": level,
        "levels": LEVELS,
        "streak": {"current": streak.current_streak if streak else 0,
                   "longest": streak.longest_streak if streak else 0},
        "badges": badge_state(db, user.id),
        "active_boost": {"category": boost.category, "multiplier": boost.multiplier,
                         "expires_at": boost.expires_at} if boost else None,
    }


@app.get("/api/rewards/boosts")
def list_boosts(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    boost = active_boost(db, user.id)
    return {
        "active": {"category": boost.category, "multiplier": boost.multiplier,
                   "expires_at": boost.expires_at,
                   "days_remaining": max(0, (boost.expires_at - datetime.utcnow()).days)} if boost else None,
        "available": [{"category": c.category, "base_rate": c.base_rate,
                       "boosted_rate": round(c.base_rate * 2, 4), "icon": c.icon,
                       "description": c.description,
                       "is_active": bool(boost and boost.category == c.category)}
                      for c in db.query(CategoryCashback).all()],
    }


@app.post("/api/rewards/boosts/activate")
def activate_boost(body: BoostActivate, user: User = Depends(get_current_user),
                   db: Session = Depends(get_db)):
    if not db.query(CategoryCashback).filter(CategoryCashback.category == body.category).first():
        raise HTTPException(400, "Pick a category from the list.")
    existing = db.query(UserActiveBoost).filter(UserActiveBoost.user_id == user.id).first()
    expires = datetime.utcnow() + timedelta(days=30)
    if existing:
        existing.category, existing.multiplier = body.category, 2.0
        existing.activated_at, existing.expires_at = datetime.utcnow(), expires
    else:
        db.add(UserActiveBoost(user_id=user.id, category=body.category, multiplier=2.0,
                               expires_at=expires))
    notify(db, user.id, "Boost active",
           f"{body.category.title()} earns double sats for the next 30 days.", "reward", "flame")
    db.commit()
    return {"category": body.category, "multiplier": 2.0, "expires_at": expires}


# ------------------------------------------------------------------ analytics
@app.get("/api/analytics/spending")
def spending(period: str = "30d", user: User = Depends(get_current_user),
             db: Session = Depends(get_db)):
    days = {"7d": 7, "30d": 30, "90d": 90, "all": 3650}.get(period, 30)
    since = datetime.utcnow() - timedelta(days=days)
    rows = db.query(
        Transaction.category, func.sum(Transaction.amount_fiat), func.sum(Transaction.sats_earned),
        func.count(Transaction.id),
    ).filter(Transaction.user_id == user.id, Transaction.created_at >= since)\
     .group_by(Transaction.category).all()

    icons = {c.category: c.icon for c in db.query(CategoryCashback).all()}
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


@app.get("/api/analytics/insights")
def insights(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    txs = db.query(Transaction).filter(Transaction.user_id == user.id).all()
    if not txs:
        return {"has_data": False, "message": "Your first transaction unlocks insights."}
    total_spent = sum(t.amount_fiat for t in txs)
    total_sats = sum(t.sats_earned for t in txs)
    by_cat = defaultdict(float)
    for t in txs:
        by_cat[t.category] += t.amount_fiat
    top = max(by_cat.items(), key=lambda kv: kv[1])
    span = max(1, (datetime.utcnow() - min(t.created_at for t in txs)).days)
    biggest = max(txs, key=lambda t: t.sats_earned)
    return {
        "has_data": True,
        "top_category": {"category": top[0], "total_spent": round(top[1], 2)},
        "average_transaction": round(total_spent / len(txs), 2),
        "daily_average_sats": int(total_sats / span),
        "biggest_reward": {"merchant": biggest.merchant, "sats": biggest.sats_earned,
                           "amount_fiat": biggest.amount_fiat},
        "effective_rate": round(total_sats / SATS_PER_BTC * get_btc_price()["price"] / total_spent, 4)
        if total_spent else 0,
        "projected_yearly_sats": int(total_sats / span * 365),
    }


@app.get("/api/analytics/recap")
def recap(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    since = datetime.utcnow() - timedelta(days=30)
    txs = db.query(Transaction).filter(Transaction.user_id == user.id,
                                       Transaction.created_at >= since).all()
    if not txs:
        return {"has_data": False, "message": "Come back after a month of spending."}
    total_sats = sum(t.sats_earned for t in txs)
    total_spent = sum(t.amount_fiat for t in txs)
    by_cat = defaultdict(int)
    for t in txs:
        by_cat[t.category] += t.sats_earned
    top_cat = max(by_cat.items(), key=lambda kv: kv[1])
    biggest = max(txs, key=lambda t: t.sats_earned)
    streak = db.query(UserStreak).filter(UserStreak.user_id == user.id).first()
    usd = sats_to_usd(total_sats)

    all_totals = [r[0] for r in db.query(func.sum(Transaction.sats_earned))
                  .filter(Transaction.created_at >= since).group_by(Transaction.user_id).all()]
    beaten = sum(1 for v in all_totals if (v or 0) < total_sats)
    percentile = int(round(beaten / len(all_totals) * 100)) if all_totals else 50

    return {
        "has_data": True,
        "period": "Last 30 days",
        "total_sats": total_sats,
        "total_usd": usd,
        "total_spent": round(total_spent, 2),
        "transaction_count": len(txs),
        "top_category": {"category": top_cat[0], "sats": top_cat[1]},
        "biggest_reward": {"merchant": biggest.merchant, "sats": biggest.sats_earned},
        "streak": streak.longest_streak if streak else 0,
        "percentile": percentile,
        "fun_facts": [
            f"That's {usd / 4.50:.1f} flat whites paid for by your own spending.",
            f"You averaged {total_sats // max(1, len(txs)):,} sats a transaction.",
            f"At this rate you'd stack {total_sats * 12:,} sats a year.",
        ],
    }


@app.get("/api/tax/report")
def tax_report(year: int = Query(default_factory=lambda: date.today().year),
               user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.query(RewardEvent).filter(
        RewardEvent.user_id == user.id,
        RewardEvent.created_at >= datetime(year, 1, 1),
        RewardEvent.created_at < datetime(year + 1, 1, 1),
    ).order_by(RewardEvent.created_at).all()

    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["Date", "Category", "Sats received", "BTC amount",
                "BTC price (USD)", "Fair market value (USD)", "Type"])
    for r in rows:
        w.writerow([r.created_at.strftime("%Y-%m-%d %H:%M:%S"), r.category, r.btc_amount,
                    f"{r.btc_amount / SATS_PER_BTC:.8f}", f"{r.btc_price:.2f}",
                    f"{(r.btc_amount / SATS_PER_BTC) * r.btc_price:.2f}", "Cashback reward"])
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]), media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="bitback-{year}.csv"'})


# ------------------------------------------------------------------ goals
@app.get("/api/goals")
def list_goals(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.query(SavingsGoal).filter(SavingsGoal.user_id == user.id)\
        .order_by(SavingsGoal.created_at.desc()).all()
    return [{"id": g.id, "name": g.name, "target_sats": g.target_sats,
             "current_sats": g.current_sats, "icon": g.icon, "is_completed": g.is_completed,
             "progress": round(min(1.0, g.current_sats / g.target_sats), 4) if g.target_sats else 0,
             "created_at": g.created_at} for g in rows]


@app.post("/api/goals")
def create_goal(body: GoalCreate, user: User = Depends(get_current_user),
                db: Session = Depends(get_db)):
    g = SavingsGoal(user_id=user.id, name=body.name, target_sats=body.target_sats, icon=body.icon)
    db.add(g)
    db.commit()
    db.refresh(g)
    return {"id": g.id, "name": g.name, "target_sats": g.target_sats, "current_sats": 0,
            "icon": g.icon, "is_completed": False, "progress": 0}


@app.post("/api/goals/{goal_id}/allocate")
def allocate_goal(goal_id: int, body: GoalAllocate, user: User = Depends(get_current_user),
                  db: Session = Depends(get_db)):
    g = db.query(SavingsGoal).filter(SavingsGoal.id == goal_id,
                                     SavingsGoal.user_id == user.id).first()
    if not g:
        raise HTTPException(404, "That goal no longer exists.")
    w = get_wallet(db, user.id)
    if w.btc_balance < body.sats:
        raise HTTPException(400, f"You have {int(w.btc_balance):,} sats available.")
    w.btc_balance -= body.sats
    g.current_sats += body.sats
    db.add(WalletTransaction(user_id=user.id, amount_sats=-body.sats, type="goal_allocation"))
    if g.current_sats >= g.target_sats and not g.is_completed:
        g.is_completed, g.completed_at = True, datetime.utcnow()
        notify(db, user.id, "Goal reached", f"You funded {g.name} in full.", "reward", "trophy")
    db.commit()
    return {"id": g.id, "current_sats": g.current_sats, "is_completed": g.is_completed,
            "wallet_balance_sats": int(w.btc_balance)}


@app.delete("/api/goals/{goal_id}")
def delete_goal(goal_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    g = db.query(SavingsGoal).filter(SavingsGoal.id == goal_id,
                                     SavingsGoal.user_id == user.id).first()
    if not g:
        raise HTTPException(404, "That goal no longer exists.")
    returned = g.current_sats
    if returned:
        get_wallet(db, user.id).btc_balance += returned
        db.add(WalletTransaction(user_id=user.id, amount_sats=returned, type="goal_allocation"))
    db.delete(g)
    db.commit()
    return {"message": "Goal deleted.", "sats_returned": returned}


# ------------------------------------------------------------------ configs
@app.get("/api/roundup/config")
def get_roundup(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    c = db.query(UserRoundUpConfig).filter(UserRoundUpConfig.user_id == user.id).first()
    if not c:
        c = UserRoundUpConfig(user_id=user.id)
        db.add(c)
        db.commit()
    return {"is_enabled": c.is_enabled, "multiplier": c.multiplier}


@app.put("/api/roundup/config")
def set_roundup(body: RoundUpUpdate, user: User = Depends(get_current_user),
                db: Session = Depends(get_db)):
    c = db.query(UserRoundUpConfig).filter(UserRoundUpConfig.user_id == user.id).first()
    if not c:
        c = UserRoundUpConfig(user_id=user.id)
        db.add(c)
    c.is_enabled, c.multiplier = body.is_enabled, body.multiplier
    db.commit()
    return {"is_enabled": c.is_enabled, "multiplier": c.multiplier}


@app.get("/api/auto-withdraw/config")
def get_auto_withdraw(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    c = db.query(AutoWithdrawConfig).filter(AutoWithdrawConfig.user_id == user.id).first()
    if not c:
        c = AutoWithdrawConfig(user_id=user.id)
        db.add(c)
        db.commit()
    return {"is_enabled": c.is_enabled, "threshold_sats": c.threshold_sats,
            "destination_address": c.destination_address}


@app.put("/api/auto-withdraw/config")
def set_auto_withdraw(body: AutoWithdrawUpdate, user: User = Depends(get_current_user),
                      db: Session = Depends(get_db)):
    c = db.query(AutoWithdrawConfig).filter(AutoWithdrawConfig.user_id == user.id).first()
    if not c:
        c = AutoWithdrawConfig(user_id=user.id)
        db.add(c)
    if body.is_enabled and not body.destination_address:
        raise HTTPException(400, "Add a destination address before turning this on.")
    c.is_enabled = body.is_enabled
    c.threshold_sats = body.threshold_sats
    c.destination_address = body.destination_address
    db.commit()
    return {"is_enabled": c.is_enabled, "threshold_sats": c.threshold_sats,
            "destination_address": c.destination_address}


# ------------------------------------------------------------------ referrals
@app.get("/api/referral")
def my_referral(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rc = db.query(ReferralCode).filter(ReferralCode.user_id == user.id).first()
    if not rc:
        rc = ReferralCode(user_id=user.id,
                          code="".join(random.choices(string.ascii_uppercase + string.digits, k=8)))
        db.add(rc)
        db.commit()
    return {"code": rc.code, "total_referrals": rc.total_referrals,
            "total_sats_earned": rc.total_sats_earned,
            "referrer_bonus": 5000, "welcome_bonus": 2500}


@app.get("/api/referral/leaderboard")
def referral_leaderboard(db: Session = Depends(get_db)):
    rows = db.query(ReferralCode, User).join(User, User.id == ReferralCode.user_id)\
        .order_by(ReferralCode.total_referrals.desc()).limit(10).all()
    return [{"rank": i + 1, "display_name": u.display_name, "total_referrals": rc.total_referrals,
             "total_sats_earned": rc.total_sats_earned} for i, (rc, u) in enumerate(rows)]


# ------------------------------------------------------------------ alerts & notifications
@app.get("/api/alerts")
def list_alerts(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.query(PriceAlert).filter(PriceAlert.user_id == user.id)\
        .order_by(PriceAlert.created_at.desc()).all()
    return [{"id": a.id, "target_price": a.target_price, "direction": a.direction,
             "is_triggered": a.is_triggered, "triggered_at": a.triggered_at,
             "created_at": a.created_at} for a in rows]


@app.post("/api/alerts")
def create_alert(body: AlertCreate, user: User = Depends(get_current_user),
                 db: Session = Depends(get_db)):
    a = PriceAlert(user_id=user.id, target_price=body.target_price, direction=body.direction)
    db.add(a)
    db.commit()
    db.refresh(a)
    return {"id": a.id, "target_price": a.target_price, "direction": a.direction,
            "is_triggered": False}


@app.delete("/api/alerts/{alert_id}")
def delete_alert(alert_id: int, user: User = Depends(get_current_user),
                 db: Session = Depends(get_db)):
    a = db.query(PriceAlert).filter(PriceAlert.id == alert_id,
                                    PriceAlert.user_id == user.id).first()
    if not a:
        raise HTTPException(404, "That alert no longer exists.")
    db.delete(a)
    db.commit()
    return {"message": "Alert deleted."}


@app.get("/api/notifications")
def list_notifications(page: int = 1, per_page: int = 30,
                       user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    q = db.query(Notification).filter(Notification.user_id == user.id)
    total = q.count()
    unread = q.filter(Notification.is_read.is_(False)).count()
    rows = q.order_by(Notification.created_at.desc())\
        .offset((page - 1) * per_page).limit(per_page).all()
    return {"total": total, "unread_count": unread, "page": page,
            "items": [{"id": n.id, "title": n.title, "message": n.message, "type": n.type,
                       "icon": n.icon, "is_read": n.is_read, "created_at": n.created_at}
                      for n in rows]}


@app.post("/api/notifications/read-all")
def read_all(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    n = db.query(Notification).filter(Notification.user_id == user.id,
                                      Notification.is_read.is_(False)).update({"is_read": True})
    db.commit()
    return {"marked_read": n}


# ------------------------------------------------------------------ AI endpoints
@app.get("/api/forecast")
def forecast(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    result = forecast_earnings(db, user.id)
    if result.get("has_enough_data"):
        result["predicted_usd_30d"] = sats_to_usd(result["predicted_sats_30d"])
    return result


@app.get("/api/fraud/summary")
def fraud_summary(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return get_fraud_summary(db, user.id)


@app.get("/api/fraud/flagged")
def fraud_flagged(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.query(TransactionRiskScore, Transaction)\
        .join(Transaction, Transaction.id == TransactionRiskScore.transaction_id)\
        .filter(TransactionRiskScore.user_id == user.id,
                TransactionRiskScore.is_anomaly.is_(True))\
        .order_by(TransactionRiskScore.risk_score.desc()).all()
    return [{"transaction_id": t.id, "merchant": t.merchant, "category": t.category,
             "amount_fiat": t.amount_fiat, "risk_score": s.risk_score,
             "model_version": s.model_version, "features": json.loads(s.features_used),
             "created_at": t.created_at} for s, t in rows]


@app.get("/api/fraud/score/{transaction_id}")
def fraud_score(transaction_id: int, user: User = Depends(get_current_user),
                db: Session = Depends(get_db)):
    s = db.query(TransactionRiskScore).filter(
        TransactionRiskScore.transaction_id == transaction_id,
        TransactionRiskScore.user_id == user.id).first()
    if not s:
        raise HTTPException(404, "No risk score for that transaction.")
    return {"transaction_id": transaction_id, "risk_score": s.risk_score,
            "is_anomaly": s.is_anomaly, "model_version": s.model_version,
            "features": json.loads(s.features_used)}


@app.get("/api/ai/boost-recommendation")
def boost_recommendation(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return recommend_boost(db, user.id)


@app.get("/api/ai/persona")
def persona(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return classify_persona(db, user.id)


@app.get("/api/health")
def health():
    return {"status": "ok", "time": datetime.utcnow()}
