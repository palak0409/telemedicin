"""
SQLAlchemy engine and request-scoped sessions.

READ COMMITTED isolation is used deliberately: appointment booking locks the
doctor's row and then checks for overlapping appointments. Under MySQL's default
REPEATABLE READ, that check could read from a snapshot taken before the lock was
acquired and miss an appointment committed by a concurrent request.
"""
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings

engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    pool_recycle=3600,
    isolation_level="READ COMMITTED",
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
