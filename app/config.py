"""Application settings.

Configuration is read once, validated once, and imported everywhere as
`settings`. The alternative - scattered `os.getenv` calls - means a typo in an
environment variable name fails silently at the point of use rather than loudly
at startup.
"""
from functools import lru_cache
from typing import Literal

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEV_SECRET = "dev-secret-change-me-before-deploying-anywhere"
# RFC 7518 s3.2: an HS256 key should be at least as long as the hash output.
MIN_SECRET_BYTES = 32


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

    # Where the caller's address comes from, for rate limiting. Behind a proxy
    # the socket peer is the proxy, so every user would share one bucket.
    #   direct            - the socket peer; for running with no proxy in front
    #   x-forwarded-for   - first entry; what Render says is the client, but a
    #                       client can prepend its own value to this header
    #   cf-connecting-ip  - set by Cloudflare, which overwrites any value the
    #                       client sent; Render's edge runs through Cloudflare
    # Check which is right for a deployment with GET /api/meta/client-ip.
    client_ip_source: Literal["direct", "x-forwarded-for", "cf-connecting-ip"] = (
        "x-forwarded-for")

    # Shown on the privacy policy page. Unset, the page tells readers to use
    # the contact route on the store listing.
    support_email: str | None = None

    # Bonuses are paid on signup, so they are worth money and belong in config
    # rather than buried as literals in the registration handler.
    referrer_bonus_sats: int = Field(default=5_000, ge=0)
    referral_welcome_sats: int = Field(default=2_500, ge=0)

    btc_price_cache_seconds: int = Field(default=60, ge=0)
    btc_price_fallback_usd: float = Field(default=65_000.0, gt=0)
    # The oldest live price a reward may be paid against in production. Older
    # than this and the transaction is declined rather than mispriced.
    btc_price_max_age_seconds: int = Field(default=1800, gt=0)

    # How many new transactions a user may accumulate before the fraud model is
    # refit. Scoring always runs; training does not.
    fraud_refit_interval: int = Field(default=25, ge=1)

    @model_validator(mode="after")
    def _refuse_unsafe_production_config(self) -> "Settings":
        """Production refuses to start on development defaults.

        One check over the whole model rather than one validator per field,
        because each rule depends on `environment` and they read best together.
        DEMO_MODE and the database used to be enforced only by DEPLOY.md; a
        deploy checklist is a request, a startup failure is a guarantee.
        """
        if self.environment != "production":
            return self
        problems = []
        if self.secret_key == DEV_SECRET:
            problems.append("SECRET_KEY is still the development default")
        elif len(self.secret_key.encode()) < MIN_SECRET_BYTES:
            problems.append(f"SECRET_KEY must be at least {MIN_SECRET_BYTES} bytes for HS256")
        if self.demo_mode:
            # Demo mode returns password-reset tokens in the API response, so
            # anyone who knows a registered email could take over the account.
            problems.append("DEMO_MODE must be false (it returns reset tokens to anyone)")
        if self.is_sqlite:
            problems.append("DATABASE_URL points at SQLite, which Render's disk does not keep")
        if problems:
            raise ValueError("Refusing to start with ENVIRONMENT=production: "
                             + "; ".join(problems))
        return self

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
