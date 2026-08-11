import json
import secrets

import pyotp
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.auth import (
    create_access_token,
    decode_token,
    get_current_user,
    hash_password,
    verify_password,
)
from app.config import settings
from app.database import get_db
from app.models import AutoWithdrawConfig, User, UserRoundUpConfig, UserStreak, UserTOTP
from app.rate_limit import client_ip, rate_limit
from app.schemas import (
    ForgotPasswordRequest,
    LoginRequest,
    RegisterRequest,
    ResetPasswordRequest,
    TokenResponse,
    TOTPAuthenticate,
    TOTPVerify,
    UserOut,
)
from app.services import award_referral, get_or_create_referral_code, get_wallet, notify

router = APIRouter(prefix="/api/auth", tags=["auth"])

BACKUP_CODE_COUNT = 8


def _session(user: User) -> TokenResponse:
    return TokenResponse(
        access_token=create_access_token(user.id),
        user={"id": user.id, "email": user.email, "display_name": user.display_name},
    )


@router.post("/register", response_model=TokenResponse)
def register(body: RegisterRequest, request: Request, db: Session = Depends(get_db)):
    # Registration pays out a welcome bonus and a referrer bonus, so it is a
    # value-bearing endpoint and needs the same protection as login. Without
    # this an attacker can self-refer in a loop and mint sats.
    rate_limit(f"register:{client_ip(request)}", 5, window=3600)

    if db.query(User).filter(User.email == body.email.lower()).first():
        raise HTTPException(400, "That email is already registered.")

    user = User(
        email=body.email.lower(),
        password_hash=hash_password(body.password),
        display_name=body.display_name,
    )
    db.add(user)
    db.flush()

    # get_wallet is the single creation path for a wallet; calling it here means
    # the referral credit below finds the same row instead of inserting a second.
    get_wallet(db, user.id)
    db.add_all([
        UserStreak(user_id=user.id),
        UserRoundUpConfig(user_id=user.id, is_enabled=False, multiplier=1.0),
        AutoWithdrawConfig(user_id=user.id, is_enabled=False, threshold_sats=100_000),
    ])
    get_or_create_referral_code(db, user.id)

    if body.referral_code:
        award_referral(db, user, body.referral_code)

    notify(db, user.id, "Welcome to BitBack",
           "Your card is ready. Every purchase now earns bitcoin.", "system", "sparkles")
    db.commit()
    return _session(user)


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, request: Request, db: Session = Depends(get_db)):
    rate_limit(f"login:{client_ip(request)}", 5)
    user = db.query(User).filter(User.email == body.email.lower()).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "That email and password don't match.")

    totp = db.query(UserTOTP).filter(
        UserTOTP.user_id == user.id, UserTOTP.is_enabled.is_(True)).first()
    if totp:
        return TokenResponse(
            access_token="", requires_2fa=True,
            challenge_token=create_access_token(user.id, "2fa", minutes=5),
        )
    return _session(user)


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user


@router.post("/forgot-password")
def forgot_password(body: ForgotPasswordRequest, request: Request, db: Session = Depends(get_db)):
    rate_limit(f"forgot:{client_ip(request)}", 3)
    user = db.query(User).filter(User.email == body.email.lower()).first()
    response = {"message": "If that email has an account, a reset link is on its way."}

    # The response must not reveal whether the address is registered, so the
    # token is only ever included in demo mode - where the absence of an email
    # provider is the whole point. In any other configuration the shape is
    # identical for both cases and the endpoint cannot enumerate accounts.
    if user and settings.demo_mode:
        response["reset_token"] = create_access_token(user.id, "reset", minutes=15)
    return response


@router.post("/reset-password")
def reset_password(body: ResetPasswordRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == decode_token(body.token, "reset")).first()
    if not user:
        raise HTTPException(400, "That reset link is no longer valid.")
    user.password_hash = hash_password(body.new_password)
    db.commit()
    return {"message": "Password updated. Sign in with your new password."}


# ---------------------------------------------------------------------- 2FA
@router.post("/2fa/setup")
def totp_setup(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    record = db.query(UserTOTP).filter(UserTOTP.user_id == user.id).first()
    if record and record.is_enabled:
        raise HTTPException(400, "Two-factor authentication is already on.")
    secret = pyotp.random_base32()
    codes = ["-".join(secrets.token_hex(2).upper() for _ in range(2))
             for _ in range(BACKUP_CODE_COUNT)]
    if record:
        record.secret_key, record.backup_codes, record.is_enabled = secret, json.dumps(codes), False
    else:
        db.add(UserTOTP(user_id=user.id, secret_key=secret, backup_codes=json.dumps(codes)))
    db.commit()
    uri = pyotp.TOTP(secret).provisioning_uri(name=user.email, issuer_name="BitBack")
    return {"secret": secret, "otpauth_uri": uri, "backup_codes": codes}


@router.post("/2fa/verify")
def totp_verify(body: TOTPVerify, user: User = Depends(get_current_user),
                db: Session = Depends(get_db)):
    record = db.query(UserTOTP).filter(UserTOTP.user_id == user.id).first()
    if not record:
        raise HTTPException(400, "Start the setup first.")
    if not pyotp.TOTP(record.secret_key).verify(body.code, valid_window=1):
        raise HTTPException(400, "That code isn't right. Check your authenticator app.")
    record.is_enabled = True
    notify(db, user.id, "Two-factor enabled",
           "Your account now needs a code at sign-in.", "system", "lock")
    db.commit()
    return {"message": "Two-factor authentication is on.", "is_enabled": True}


@router.post("/2fa/disable")
def totp_disable(body: TOTPVerify, user: User = Depends(get_current_user),
                 db: Session = Depends(get_db)):
    record = db.query(UserTOTP).filter(UserTOTP.user_id == user.id).first()
    if not record or not record.is_enabled:
        raise HTTPException(400, "Two-factor authentication isn't on.")
    if not pyotp.TOTP(record.secret_key).verify(body.code, valid_window=1):
        raise HTTPException(400, "That code isn't right.")
    record.is_enabled = False
    db.commit()
    return {"message": "Two-factor authentication is off.", "is_enabled": False}


@router.post("/2fa/authenticate", response_model=TokenResponse)
def totp_authenticate(body: TOTPAuthenticate, request: Request, db: Session = Depends(get_db)):
    rate_limit(f"2fa:{client_ip(request)}", 10)
    user_id = decode_token(body.challenge_token, "2fa")
    record = db.query(UserTOTP).filter(UserTOTP.user_id == user_id).first()
    user = db.query(User).filter(User.id == user_id).first()
    if not record or not user:
        raise HTTPException(400, "That sign-in attempt expired. Start again.")

    codes = json.loads(record.backup_codes or "[]")
    if pyotp.TOTP(record.secret_key).verify(body.code, valid_window=1):
        pass
    elif body.code.upper() in codes:
        codes.remove(body.code.upper())          # single use
        record.backup_codes = json.dumps(codes)
    else:
        raise HTTPException(400, "That code isn't right.")
    db.commit()
    return _session(user)


@router.get("/2fa/status")
def totp_status(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    record = db.query(UserTOTP).filter(UserTOTP.user_id == user.id).first()
    return {"is_enabled": bool(record and record.is_enabled)}
