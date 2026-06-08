"""
api/deps.py — FastAPI dependency injection helpers.
"""
from __future__ import annotations
from typing import Generator
from scraper.db import get_session
from sqlalchemy.engine import Connection


def get_db() -> Generator[Connection, None, None]:
    """Yield an open SQLAlchemy connection for use in route handlers."""
    with get_session() as conn:
        yield conn
