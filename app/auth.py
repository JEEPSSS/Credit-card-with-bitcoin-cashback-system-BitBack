"""Password hashing and JWT issuing/verification.

PyJWT rather than python-jose: python-jose has not shipped a release since
3.3.0 (2021) and that version carries CVE-2024-33663 (algorithm confusion,
allowing a token signed with an attacker-chosen algorithm to be accepted) and
CVE-2024-33664 (a compressed-payload decompression bomb). Neither is acceptable
in a system whose subject is financial software.

Tokens carry a `purpose` claim so a short-lived password-reset token cannot be
replayed as a session token, or a 2FA challenge token used to skip the second
factor. The purpose is checked on every decode.
"""
from datetime import timedelta

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.clock import utcnow
from app.config import settings
from app.database import get_db
from app.models import User

ALGORITHM = "HS256"
BCRYPT_MAX_BYTES = 72  # bcrypt silently truncates beyond this

bearer = HTTPBearer(auto_error=False)


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode()[:BCRYPT_MAX_BYTES], bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode()[:BCRYPT_MAX_BYTES], hashed.encode())
    except (ValueError, TypeError):
        return False


def create_access_token(user_id: int, purpose: str = "access", minutes: int | None = None) -> str:
    expire = utcnow() + timedelta(minutes=minutes or settings.access_token_expire_minutes)
    return jwt.encode(
        {"sub": str(user_id), "purpose": purpose, "exp": expire},
        settings.secret_key,
        algorithm=ALGORITHM,
    )


def decode_token(token: str, expected_purpose: str = "access") -> int:
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        # `from None`: the underlying error distinguishes an expired token from a
        # forged one, which is not something the caller should learn.
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, "Your session expired. Sign in again.") from None
    if payload.get("purpose") != expected_purpose:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "That token can't be used here.")
    try:
        return int(payload["sub"])
    except (KeyError, TypeError, ValueError):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "That token isn't valid.") from None


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    if creds is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sign in to continue.")
    user = db.query(User).filter(User.id == decode_token(creds.credentials)).first()
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "That account is no longer active.")
    return user
