from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class RequestModel(BaseModel):
    """Base for every request body.

    Python's JSON parser accepts the non-standard tokens NaN and Infinity, and
    pydantic accepts them as floats unless told otherwise. An Infinity target
    price was stored, then crashed every later read of that user's alerts,
    because it cannot be written back out as JSON.
    """
    model_config = ConfigDict(allow_inf_nan=False)


# Every bitcoin there will ever be, in sats. Nothing in this system can
# legitimately exceed it, and it fits a BIGINT with room to spare - an
# unbounded int reached Postgres and failed there as "bigint out of range".
MAX_SATS = 21_000_000 * 100_000_000
MAX_SPEND_USD = 1_000_000


# --- auth ---
class RegisterRequest(RequestModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    display_name: str = Field(min_length=1, max_length=120)
    referral_code: str | None = None


class LoginRequest(RequestModel):
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
class TransactionCreate(RequestModel):
    amount_fiat: float = Field(gt=0, le=MAX_SPEND_USD)
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


class RewardPreviewRequest(RequestModel):
    amount_fiat: float = Field(gt=0, le=MAX_SPEND_USD)
    category: str


# --- wallet, goals, config ---
class WalletOut(BaseModel):
    balance_sats: int
    balance_btc: float
    balance_usd: float
    btc_price: float
    updated_at: datetime | None = None


class PageMeta(BaseModel):
    total: int
    page: int
    per_page: int
    has_more: bool


class TransactionPage(PageMeta):
    items: list[TransactionOut]


class GoalCreate(RequestModel):
    name: str = Field(min_length=1, max_length=120)
    target_sats: int = Field(gt=0, le=MAX_SATS)
    icon: str = "target"


class GoalAllocate(RequestModel):
    sats: int = Field(gt=0, le=MAX_SATS)


class RoundUpUpdate(RequestModel):
    is_enabled: bool
    multiplier: float = Field(ge=1.0, le=3.0)


class AutoWithdrawUpdate(RequestModel):
    is_enabled: bool
    threshold_sats: int = Field(ge=1000, le=MAX_SATS)
    destination_address: str | None = None


class BoostActivate(RequestModel):
    category: str


class AlertCreate(RequestModel):
    target_price: float = Field(gt=0, le=100_000_000)
    direction: Literal["above", "below"]


# --- security ---
class TOTPVerify(RequestModel):
    code: str = Field(min_length=6, max_length=6)


class TOTPAuthenticate(RequestModel):
    challenge_token: str
    code: str


class DeleteAccountRequest(RequestModel):
    password: str = Field(min_length=1, max_length=128)


class ForgotPasswordRequest(RequestModel):
    email: EmailStr


class ResetPasswordRequest(RequestModel):
    token: str
    new_password: str = Field(min_length=8, max_length=128)


# --- survey (Chapter 3.6) ---
class SurveyResponseCreate(RequestModel):
    source: Literal["app", "web"]
    screen_active_trader: bool
    # Whether the respondent has actually used the prototype or seen a
    # walkthrough of it. Q4-Q7 presuppose specific screens, so they're only
    # collected when this is true. The in-app channel always sends true
    # (reaching this screen implies exposure); the web channel asks it
    # explicitly. None only for a screened-out respondent's row.
    has_used_app: bool | None = None
    q1: int | None = Field(None, ge=1, le=5)
    q2: int | None = Field(None, ge=1, le=5)
    q3: int | None = Field(None, ge=1, le=5)
    q4: int | None = Field(None, ge=1, le=5)
    q5: int | None = Field(None, ge=1, le=5)
    q6: int | None = Field(None, ge=1, le=5)
    q7: int | None = Field(None, ge=1, le=5)
    q8: Literal["much_less", "less", "equally", "more", "much_more"] | None = None
    q9: str | None = Field(None, max_length=2000)
    q10: str | None = Field(None, max_length=2000)


class SurveyResponseOut(BaseModel):
    id: int
    screened_out: bool


class SurveySummary(BaseModel):
    total_responses: int
    screened_out: int
    included: int
    # Of `included`, how many actually answered Q4-Q7 (used_app_count) vs.
    # only the concept items (included - used_app_count). The two Likert
    # means groups below are computed over different denominators for
    # exactly this reason -- q1/q2/q3 over all of `included`, q4-q7 over
    # only `used_app_count` of them.
    used_app_count: int
    # Included responses stored before has_used_app existed. They count
    # towards Q1-Q3; their Q4-Q7 answers are reported only in
    # `legacy_app_items`, apart from the grounded ones.
    legacy_count: int
    by_source: dict[str, int]
    # Per item: n, median, q1, q3 (interquartile range), mean, distribution.
    likert: dict[str, dict]
    # The means alone, for anything already reading this field.
    likert_means: dict[str, float | None]
    legacy_app_items: dict[str, dict]
    q8_distribution: dict[str, int]
