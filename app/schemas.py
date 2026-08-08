from datetime import datetime
from typing import Any, Literal
from pydantic import BaseModel, EmailStr, Field, ConfigDict


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# --- auth ---
class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    display_name: str = Field(min_length=1, max_length=120)
    referral_code: str | None = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    requires_2fa: bool = False
    challenge_token: str | None = None
    user: dict | None = None


class UserOut(ORMModel):
    id: int
    email: str
    display_name: str
    created_at: datetime


# --- transactions ---
class TransactionCreate(BaseModel):
    amount_fiat: float = Field(gt=0, le=1_000_000)
    category: str
    merchant: str = Field(min_length=1, max_length=120)


class TransactionOut(ORMModel):
    id: int
    amount_fiat: float
    currency: str
    category: str
    merchant: str
    btc_price_at_time: float
    sats_earned: int
    status: str
    created_at: datetime


class RewardBreakdown(BaseModel):
    base_sats: int
    level_bonus: int
    boost_bonus: int
    total_sats: int
    cashback_rate: float
    effective_rate: float
    level_multiplier: float
    boost_multiplier: float
    usd_value: float


class TransactionResult(BaseModel):
    transaction: TransactionOut
    reward: RewardBreakdown
    round_up: dict | None = None
    new_badges: list[dict] = []
    streak: dict
    level: dict
    wallet_balance_sats: int
    risk: dict


class RewardPreviewRequest(BaseModel):
    amount_fiat: float = Field(gt=0)
    category: str


# --- wallet, goals, config ---
class WalletOut(BaseModel):
    balance_sats: int
    balance_btc: float
    balance_usd: float
    btc_price: float
    updated_at: datetime | None = None


class GoalCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    target_sats: int = Field(gt=0)
    icon: str = "target"


class GoalAllocate(BaseModel):
    sats: int = Field(gt=0)


class RoundUpUpdate(BaseModel):
    is_enabled: bool
    multiplier: float = Field(ge=1.0, le=3.0)


class AutoWithdrawUpdate(BaseModel):
    is_enabled: bool
    threshold_sats: int = Field(ge=1000)
    destination_address: str | None = None


class BoostActivate(BaseModel):
    category: str


class AlertCreate(BaseModel):
    target_price: float = Field(gt=0)
    direction: Literal["above", "below"]


# --- security ---
class TOTPVerify(BaseModel):
    code: str = Field(min_length=6, max_length=6)


class TOTPAuthenticate(BaseModel):
    challenge_token: str
    code: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(min_length=8, max_length=128)
