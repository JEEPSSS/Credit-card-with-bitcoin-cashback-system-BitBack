"""ORM models.

Two conventions run through this file.

Satoshi amounts are `BigInteger`, never `Float`. A satoshi is the indivisible
unit, so the type should say so - and reading a float balance back with `int()`
truncates toward zero, which loses a satoshi the first time any non-integer
value reaches the column. `Integer` is not enough either: Postgres `INTEGER` is
four bytes and overflows at 2^31 sats, which is only 21.47 BTC.

Timestamps are naive UTC via `app.clock.utcnow`. See that module for why
`datetime.utcnow` and `date.today` are both avoided.
"""
from sqlalchemy import (
    BigInteger,
    Boolean,
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from app.clock import utcnow
from app.database import Base


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    display_name = Column(String(120), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    transactions = relationship("Transaction", back_populates="user", cascade="all, delete-orphan")
    rewards = relationship("RewardEvent", back_populates="user", cascade="all, delete-orphan")
    wallet = relationship("WalletBalance", uselist=False, cascade="all, delete-orphan")
    streak = relationship("UserStreak", uselist=False, cascade="all, delete-orphan")
    wallet_transactions = relationship("WalletTransaction", cascade="all, delete-orphan")
    active_boost = relationship("UserActiveBoost", uselist=False, cascade="all, delete-orphan")
    savings_goals = relationship("SavingsGoal", cascade="all, delete-orphan")
    roundup_config = relationship("UserRoundUpConfig", uselist=False, cascade="all, delete-orphan")
    auto_withdraw = relationship("AutoWithdrawConfig", uselist=False, cascade="all, delete-orphan")
    referral_code = relationship("ReferralCode", uselist=False, cascade="all, delete-orphan")
    price_alerts = relationship("PriceAlert", cascade="all, delete-orphan")
    notifications = relationship("Notification", cascade="all, delete-orphan")
    totp = relationship("UserTOTP", uselist=False, cascade="all, delete-orphan")
    badges = relationship("UserBadge", cascade="all, delete-orphan")


class Transaction(Base):
    __tablename__ = "transactions"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    amount_fiat = Column(Float, nullable=False)
    currency = Column(String(8), default="USD", nullable=False)
    category = Column(String(40), index=True, nullable=False)
    merchant = Column(String(120), nullable=False)
    btc_price_at_time = Column(Float, nullable=False)
    sats_earned = Column(BigInteger, default=0, nullable=False)
    status = Column(String(20), default="completed", nullable=False)
    # Client-supplied replay guard. A double-tap on "Confirm", or a retry after a
    # timeout, must not pay out twice.
    idempotency_key = Column(String(64), nullable=True)
    created_at = Column(DateTime, default=utcnow, index=True, nullable=False)

    user = relationship("User", back_populates="transactions")
    reward = relationship("RewardEvent", uselist=False, back_populates="transaction")
    risk_score = relationship("TransactionRiskScore", uselist=False, cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("user_id", "idempotency_key", name="uq_transaction_idempotency"),
        Index("ix_transaction_user_created", "user_id", "created_at"),
    )


class RewardEvent(Base):
    __tablename__ = "reward_events"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    transaction_id = Column(Integer, ForeignKey("transactions.id"), nullable=False)
    btc_amount = Column(BigInteger, nullable=False)          # satoshis
    # The BTC price at the moment of earning. Required to value a reward at fair
    # market value on receipt rather than at today's price.
    btc_price = Column(Float, nullable=False)
    cashback_rate = Column(Float, nullable=False)
    level_multiplier = Column(Float, default=1.0, nullable=False)
    boost_multiplier = Column(Float, default=1.0, nullable=False)
    category = Column(String(40), nullable=False)
    created_at = Column(DateTime, default=utcnow, index=True, nullable=False)

    user = relationship("User", back_populates="rewards")
    transaction = relationship("Transaction", back_populates="reward")

    __table_args__ = (Index("ix_reward_user_created", "user_id", "created_at"),)


class WalletBalance(Base):
    __tablename__ = "wallet_balances"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    balance_sats = Column(BigInteger, default=0, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)


class WalletTransaction(Base):
    __tablename__ = "wallet_transactions"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    amount_sats = Column(BigInteger, nullable=False)
    type = Column(String(30), nullable=False)
    status = Column(String(20), default="confirmed", nullable=False)
    tx_hash = Column(String(80))
    destination_address = Column(String(120), nullable=True)
    created_at = Column(DateTime, default=utcnow, index=True, nullable=False)

    __table_args__ = (Index("ix_wallet_tx_user_created", "user_id", "created_at"),)


class UserStreak(Base):
    __tablename__ = "user_streaks"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    current_streak = Column(Integer, default=0, nullable=False)
    longest_streak = Column(Integer, default=0, nullable=False)
    last_transaction_date = Column(Date, nullable=True)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)


class UserActiveBoost(Base):
    __tablename__ = "user_active_boosts"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    category = Column(String(40), nullable=False)
    multiplier = Column(Float, default=2.0, nullable=False)
    activated_at = Column(DateTime, default=utcnow, nullable=False)
    expires_at = Column(DateTime, nullable=False)


class CategoryCashback(Base):
    __tablename__ = "category_cashback"
    id = Column(Integer, primary_key=True)
    category = Column(String(40), unique=True, nullable=False)
    base_rate = Column(Float, nullable=False)
    icon = Column(String(40), nullable=False)
    description = Column(String(160), nullable=False)


class UserBadge(Base):
    __tablename__ = "user_badges"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    badge_key = Column(String(40), nullable=False)
    earned_at = Column(DateTime, default=utcnow, nullable=False)
    __table_args__ = (Index("ix_user_badge_unique", "user_id", "badge_key", unique=True),)


class SavingsGoal(Base):
    __tablename__ = "savings_goals"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    name = Column(String(120), nullable=False)
    target_sats = Column(BigInteger, nullable=False)
    current_sats = Column(BigInteger, default=0, nullable=False)
    icon = Column(String(16), default="target", nullable=False)
    is_completed = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    completed_at = Column(DateTime, nullable=True)


class UserRoundUpConfig(Base):
    __tablename__ = "roundup_configs"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    is_enabled = Column(Boolean, default=False, nullable=False)
    multiplier = Column(Float, default=1.0, nullable=False)


class AutoWithdrawConfig(Base):
    __tablename__ = "auto_withdraw_configs"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    is_enabled = Column(Boolean, default=False, nullable=False)
    threshold_sats = Column(BigInteger, default=100_000, nullable=False)
    destination_address = Column(String(120), nullable=True)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)


class ReferralCode(Base):
    __tablename__ = "referral_codes"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    code = Column(String(16), unique=True, index=True, nullable=False)
    total_referrals = Column(Integer, default=0, nullable=False)
    total_sats_earned = Column(BigInteger, default=0, nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)


class Referral(Base):
    __tablename__ = "referrals"
    id = Column(Integer, primary_key=True)
    referrer_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    referee_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    reward_sats = Column(BigInteger, default=0, nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)


class PriceAlert(Base):
    __tablename__ = "price_alerts"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    target_price = Column(Float, nullable=False)
    direction = Column(String(10), nullable=False)
    is_triggered = Column(Boolean, default=False, nullable=False)
    triggered_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)


class Notification(Base):
    __tablename__ = "notifications"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    title = Column(String(120), nullable=False)
    message = Column(String(400), nullable=False)
    type = Column(String(30), default="system", nullable=False)
    icon = Column(String(40), default="bell", nullable=False)
    is_read = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=utcnow, index=True, nullable=False)

    __table_args__ = (Index("ix_notification_user_created", "user_id", "created_at"),)


class UserTOTP(Base):
    __tablename__ = "user_totp"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    secret_key = Column(String(64), nullable=False)
    backup_codes = Column(Text, default="[]", nullable=False)
    is_enabled = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)


class TransactionRiskScore(Base):
    __tablename__ = "transaction_risk_scores"
    id = Column(Integer, primary_key=True)
    transaction_id = Column(Integer, ForeignKey("transactions.id"), unique=True, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    risk_score = Column(Integer, default=0, nullable=False)
    is_anomaly = Column(Boolean, default=False, nullable=False)
    features_used = Column(Text, default="{}", nullable=False)
    model_version = Column(String(40), default="iforest-v1", nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)


class SurveyResponse(Base):
    """The Chapter 3.6 usability-validation instrument.

    Deliberately not tied to `User`: a respondent never has to hold a BitBack
    account to take the survey, so there is no `user_id` here. `source`
    records which of the two delivery channels a response came in through
    (the in-app screen, or the standalone web page) so the two can be
    analysed together or split apart. A respondent who screens out as an
    active trader (Chapter 3.1's segment definition excludes them) still gets
    a row, with `screened_out=True` and every question left null, so the
    funnel itself is measurable rather than silently discarded.
    """
    __tablename__ = "survey_responses"

    id = Column(Integer, primary_key=True)
    source = Column(String(10), nullable=False)  # "app" | "web"
    screened_out = Column(Boolean, default=False, nullable=False)
    q1 = Column(Integer, nullable=True)
    q2 = Column(Integer, nullable=True)
    q3 = Column(Integer, nullable=True)
    q4 = Column(Integer, nullable=True)
    q5 = Column(Integer, nullable=True)
    q6 = Column(Integer, nullable=True)
    q7 = Column(Integer, nullable=True)
    q8 = Column(String(20), nullable=True)
    q9 = Column(Text, nullable=True)
    q10 = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utcnow, index=True, nullable=False)
