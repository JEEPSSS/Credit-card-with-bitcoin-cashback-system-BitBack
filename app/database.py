from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import declarative_base, sessionmaker

from app.config import settings


def enforce_sqlite_foreign_keys(eng: Engine) -> None:
    """Make SQLite reject dangling foreign keys, as Postgres does.

    SQLite parses REFERENCES clauses and then ignores them unless this pragma
    is set on every connection. Without it, code that deletes a parent row and
    leaves children pointing at it passes every local test and fails only in
    production.
    """
    @event.listens_for(eng, "connect")
    def _on_connect(dbapi_connection, _record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


connect_args = {"check_same_thread": False} if settings.is_sqlite else {}
engine = create_engine(settings.database_url, connect_args=connect_args, pool_pre_ping=True)
if settings.is_sqlite:
    enforce_sqlite_foreign_keys(engine)

# autoflush stays on. With it off, a query issued between `session.add(obj)` and
# `session.commit()` does not see the pending object, so code that adds a row and
# then looks it up gets None and inserts a duplicate. That produced a hard
# IntegrityError on the referral signup path.
SessionLocal = sessionmaker(autocommit=False, autoflush=True, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
