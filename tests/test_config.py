"""Production must refuse to start on settings that are only safe in development."""
import pytest
from pydantic import ValidationError

from app.config import DEV_SECRET, Settings

SAFE = {"environment": "production", "secret_key": "a-real-secret",
        "demo_mode": False, "database_url": "postgresql://u:p@db/bitback"}


def build(**overrides) -> Settings:
    return Settings(_env_file=None, **{**SAFE, **overrides})


def test_a_correctly_configured_production_starts():
    assert build().environment == "production"


@pytest.mark.parametrize("override,reason", [
    ({"secret_key": DEV_SECRET}, "SECRET_KEY"),
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
