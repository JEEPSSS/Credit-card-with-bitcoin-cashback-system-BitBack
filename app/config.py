"""Application settings.

Configuration is read once, validated once, and imported everywhere as
`settings`. The alternative - scattered `os.getenv` calls - means a typo in an
environment variable name fails silently at the point of use rather than loudly
at startup.
"""
from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEV_SECRET = "dev-secret-change-me"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: Literal["development", "production"] = "development"

    # Postgres in production, SQLite fallback so the project runs with zero setup.
    database_url: str = "sqlite:///./bitback.db"

    secret_key: str = DEV_SECRET
    access_token_expire_minutes: int = Field(default=1440, gt=0)

    # Mobile clients send no Origin header, so the default is permissive for LAN
    # device testing. Set explicit origins before exposing the API publicly.
    cors_origins: list[str] = ["*"]

    # Returns password-reset tokens directly in the API response so the flow can
    # be demonstrated without an email provider. Never enable in production: it
    # hands an account takeover to anyone who knows an email address.
    demo_mode: bool = True

    # Bonuses are paid on signup, so they are worth money and belong in config
    # rather than buried as literals in the registration handler.
    referrer_bonus_sats: int = Field(default=5_000, ge=0)
    referral_welcome_sats: int = Field(default=2_500, ge=0)

    btc_price_cache_seconds: int = Field(default=60, ge=0)
    btc_price_fallback_usd: float = Field(default=65_000.0, gt=0)

    # How many new transactions a user may accumulate before the fraud model is
    # refit. Scoring always runs; training does not.
    fraud_refit_interval: int = Field(default=25, ge=1)

    @field_validator("secret_key")
    @classmethod
    def _reject_dev_secret_in_production(cls, v: str, info) -> str:
        if info.data.get("environment") == "production" and v == DEV_SECRET:
            raise ValueError(
                "SECRET_KEY is still the development default. Set a real one before "
                "running with ENVIRONMENT=production."
            )
        return v

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
