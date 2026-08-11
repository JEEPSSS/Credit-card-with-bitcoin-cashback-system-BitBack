from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from app.config import settings

connect_args = {"check_same_thread": False} if settings.is_sqlite else {}
engine = create_engine(settings.database_url, connect_args=connect_args, pool_pre_ping=True)

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
