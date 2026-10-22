"""Production must refuse to start on settings that are only safe in development."""
import pytest
from pydantic import ValidationError

from app.config import DEV_SECRET, Settings

SAFE = {"environment": "production", "secret_key": "k" * 64,
        "demo_mode": False, "database_url": "postgresql://u:p@db/bitback"}


def build(**overrides) -> Settings:
    return Settings(_env_file=None, **{**SAFE, **overrides})


def test_a_correctly_configured_production_starts():
    assert build().environment == "production"


@pytest.mark.parametrize("override,reason", [
    ({"secret_key": DEV_SECRET}, "SECRET_KEY"),
    ({"secret_key": "short"}, "32 bytes"),
    ({"demo_mode": True}, "DEMO_MODE"),
    ({"database_url": "sqlite:///./bitback.db"}, "SQLite"),
])
def test_production_refuses_each_development_default(override, reason):
    with pytest.raises(ValidationError, match=reason):
        build(**override)


def test_production_with_nothing_set_refuses_to_start(monkeypatch):
    """The realistic failure: ENVIRONMENT flipped, nothing else configured."""
    for var in ("SECRET_KEY", "DEMO_MODE", "DATABASE_URL"):
        monkeypatch.delenv(var, raising=False)
    with pytest.raises(ValidationError):
        Settings(_env_file=None, environment="production")


def test_development_accepts_its_own_defaults():
    assert Settings(_env_file=None).demo_mode is True


EMAIL = {"resend_api_key": "re_test", "email_from": "BitBack <no-reply@example.com>",
         "public_base_url": "https://bitback.example"}


def test_production_accepts_a_complete_email_configuration():
    assert build(**EMAIL).email_enabled


@pytest.mark.parametrize("missing", sorted(EMAIL))
def test_production_refuses_half_an_email_configuration(missing):
    with pytest.raises(ValidationError, match="must be set together"):
        build(**{k: v for k, v in EMAIL.items() if k != missing})


def test_production_refuses_reset_links_over_plain_http():
    with pytest.raises(ValidationError, match="https"):
        build(**{**EMAIL, "public_base_url": "http://bitback.example"})
