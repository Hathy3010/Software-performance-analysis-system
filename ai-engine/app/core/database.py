import logging
from contextlib import contextmanager
from typing import Generator

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker
from tenacity import retry, stop_after_attempt, wait_exponential, before_sleep_log

from app.config import get_settings

logger = logging.getLogger(__name__)

_engine = None
_SessionLocal = None


def _build_engine():
    settings = get_settings()
    return create_engine(
        settings.database_url,
        pool_pre_ping=True,
        pool_size=3,
        max_overflow=5,
        connect_args={"connect_timeout": 10},
    )


@retry(
    stop=stop_after_attempt(10),
    wait=wait_exponential(multiplier=1, min=2, max=30),
    before_sleep=before_sleep_log(logger, logging.WARNING),
)
def init_db() -> None:
    """Verify DB connectivity on startup — retries until Postgres is ready."""
    global _engine, _SessionLocal
    _engine = _build_engine()
    with _engine.connect() as conn:
        conn.execute(text("SELECT 1"))
    _SessionLocal = sessionmaker(bind=_engine, autocommit=False, autoflush=False)
    logger.info("Database connection established")


@contextmanager
def get_db_session() -> Generator[Session, None, None]:
    if _SessionLocal is None:
        raise RuntimeError("Database not initialized — call init_db() first")
    session: Session = _SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
