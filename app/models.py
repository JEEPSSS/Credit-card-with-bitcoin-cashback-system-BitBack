from datetime import datetime, date
from sqlalchemy import (
    Column, Integer, String, Float, Boolean, DateTime, Date, ForeignKey, Text, Index
)
from sqlalchemy.orm import relationship
from app.database import Base


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    display_name = Column(String(120), nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

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
    currency = Column(String(8), default="USD")
    category = Column(String(40), index=True, nullable=False)
    merchant = Column(String(120), nullable=False)
    btc_price_at_time = Column(Float, nullable=False)
    sats_earned = Column(Integer, default=0)
    status = Column(String(20), default="completed")
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    user = relationship("User", back_populates="transactions")
    reward = relationship("RewardEvent", uselist=False, back_populates="transaction")
    risk_score = relationship("TransactionRiskScore", uselist=False, cascade="all, delete-orphan")


class RewardEvent(Base):
    __tablename__ = "reward_events"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    transaction_id = Column(Integer, ForeignKey("transactions.id"), nullable=False)
    btc_amount = Column(Integer, nullable=False)          # satoshis
    btc_price = Column(Float, nullable=False)
    cashback_rate = Column(Float, nullable=False)
    level_multiplier = Column(Float, default=1.0)
    boost_multiplier = Column(Float, default=1.0)
    category = Column(String(40), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    user = relationship("User", back_populates="rewards")
    transaction = relationship("Transaction", back_populates="reward")


class WalletBalance(Base):
    __tablename__ = "wallet_balances"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    btc_balance = Column(Float, default=0.0)              # satoshis
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class WalletTransaction(Base):
    __tablename__ = "wallet_transactions"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    amount_sats = Column(Integer, nullable=False)
    type = Column(String(30), nullable=False)
    status = Column(String(20), default="confirmed")
    tx_hash = Column(String(80))
    destination_address = Column(String(120), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)


class UserStreak(Base):
    __tablename__ = "user_streaks"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    current_streak = Column(Integer, default=0)
    longest_streak = Column(Integer, default=0)
    last_transaction_date = Column(Date, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class UserActiveBoost(Base):
    __tablename__ = "user_active_boosts"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    category = Column(String(40), nullable=False)
    multiplier = Column(Float, default=2.0)
    activated_at = Column(DateTime, default=datetime.utcnow)
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
    earned_at = Column(DateTime, default=datetime.utcnow)
    __table_args__ = (Index("ix_user_badge_unique", "user_id", "badge_key", unique=True),)


class SavingsGoal(Base):
    __tablename__ = "savings_goals"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    name = Column(String(120), nullable=False)
    target_sats = Column(Integer, nullable=False)
    current_sats = Column(Integer, default=0)
    icon = Column(String(16), default="target")
    is_completed = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)


class UserRoundUpConfig(Base):
    __tablename__ = "roundup_configs"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    is_enabled = Column(Boolean, default=False)
    multiplier = Column(Float, default=1.0)


class AutoWithdrawConfig(Base):
    __tablename__ = "auto_withdraw_configs"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    is_enabled = Column(Boolean, default=False)
    threshold_sats = Column(Integer, default=100000)
    destination_address = Column(String(120), nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ReferralCode(Base):
    __tablename__ = "referral_codes"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    code = Column(String(16), unique=True, index=True, nullable=False)
    total_referrals = Column(Integer, default=0)
    total_sats_earned = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)


class Referral(Base):
    __tablename__ = "referrals"
    id = Column(Integer, primary_key=True)
    referrer_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    referee_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    reward_sats = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)


class PriceAlert(Base):
    __tablename__ = "price_alerts"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    target_price = Column(Float, nullable=False)
    direction = Column(String(10), nullable=False)
    is_triggered = Column(Boolean, default=False)
    triggered_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class Notification(Base):
    __tablename__ = "notifications"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    title = Column(String(120), nullable=False)
    message = Column(String(400), nullable=False)
    type = Column(String(30), default="system")
    icon = Column(String(40), default="bell")
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)


class UserTOTP(Base):
    __tablename__ = "user_totp"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    secret_key = Column(String(64), nullable=False)
    backup_codes = Column(Text, default="[]")
    is_enabled = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class TransactionRiskScore(Base):
    __tablename__ = "transaction_risk_scores"
    id = Column(Integer, primary_key=True)
    transaction_id = Column(Integer, ForeignKey("transactions.id"), unique=True, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    risk_score = Column(Integer, default=0)
    is_anomaly = Column(Boolean, default=False)
    features_used = Column(Text, default="{}")
    model_version = Column(String(40), default="iforest-v1")
    created_at = Column(DateTime, default=datetime.utcnow)
