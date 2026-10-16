"""Test fixtures.

Every test gets a fresh in-memory database. The previous suite was a single
script sharing the development SQLite file, so tests could only run in one
order and a failure left state behind for the next run.

StaticPool is required: without it each connection to `sqlite:///:memory:` gets
its own private database, so the schema created on one connection is invisible
to the next.

Production runs on Postgres, and SQLite forgives things Postgres does not, so
the same suite also runs against a real server when TEST_DATABASE_URL is set
(CI does this). The schema is dropped and recreated per test either way.
"""
import os

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import main
from app import anomaly_detector, btc_service, rate_limit
from app.auth import hash_password
from app.database import Base, enforce_sqlite_foreign_keys, get_db
from app.models import User

TEST_BTC_PRICE = 50_000.0


@pytest.fixture
def engine():
    url = os.environ.get("TEST_DATABASE_URL")
    if url:
        eng = create_engine(url)
        Base.metadata.drop_all(bind=eng)
    else:
        eng = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        enforce_sqlite_foreign_keys(eng)
    Base.metadata.create_all(bind=eng)
    yield eng
    Base.metadata.drop_all(bind=eng)
    eng.dispose()


@pytest.fixture
def SessionLocal(engine):
    return sessionmaker(autocommit=False, autoflush=True, bind=engine)


@pytest.fixture
def db(SessionLocal):
    session = SessionLocal()
    yield session
    session.close()


@pytest.fixture
def client(engine, SessionLocal, monkeypatch):
    """TestClient wired to the in-memory database.

    Used as a context manager so the lifespan handler actually runs. The old
    suite did not do this, so category seeding never happened during tests and
    the suite only worked because `seed_demo.py` had populated the real database
    first.
    """
    monkeypatch.setattr(main, "engine", engine)
    monkeypatch.setattr(main, "SessionLocal", SessionLocal)

    def override_get_db():
        session = SessionLocal()
        try:
            yield session
        finally:
            session.close()

    main.app.dependency_overrides[get_db] = override_get_db

    # Deterministic price: no network call, and reward maths is assertable.
    btc_service.set_cached_price(TEST_BTC_PRICE)
    # Buckets are process-global; without this the register limit of 5/hour is
    # shared across every test in the run.
    rate_limit.reset()
    anomaly_detector.invalidate()

    with TestClient(main.app) as c:
        yield c

    main.app.dependency_overrides.clear()


def register(client, email="user@test.io", password="password123",
             display_name="Test User", referral_code=None):
    body = {"email": email, "password": password, "display_name": display_name}
    if referral_code:
        body["referral_code"] = referral_code
    return client.post("/api/auth/register", json=body)


def auth_header(client, **kwargs) -> dict:
    r = register(client, **kwargs)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture
def headers(client):
    return auth_header(client)


@pytest.fixture
def user_factory(db):
    def make(email: str, name: str = "Someone") -> User:
        user = User(email=email, password_hash=hash_password("password123"),
                    display_name=name)
        db.add(user)
        db.commit()
        db.refresh(user)
        return user
    return make
