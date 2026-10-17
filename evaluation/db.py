"""A throwaway in-memory database per evaluation run.

Every suite gets its own, so runs never touch `bitback.db`, never see each
other's rows, and repeat exactly given the same seed.
"""
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base


def fresh_session() -> Session:
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine)()
