"""
scraper/db.py
SQLAlchemy 2.x Core — engine factory, session context manager, and DAL helpers.
All parameterised queries; no string interpolation of user-supplied values.

App-store and Google snapshots enforce one entry per calendar day (Asia/Kolkata).
A re-sync on the same day replaces that day's row and its reviews.
"""

from __future__ import annotations

import json
import os
from contextlib import contextmanager
from datetime import date, datetime, timezone
from typing import Any, Generator
from zoneinfo import ZoneInfo

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Connection, Engine

__all__ = [
    "get_engine",
    "get_session",
    "collection_date_ist",
    "upsert_app_store_snapshot",
    "insert_app_store_reviews",
    "replace_app_store_reviews",
    "upsert_google_snapshot",
    "insert_google_reviews",
    "replace_google_reviews",
    "upsert_redbus_snapshot",
    "insert_redbus_reviews",
    "set_snapshot_stale",
    "get_operator_id",
    "get_route_id",
    "insert_captcha_alert",
]

_IST = ZoneInfo("Asia/Kolkata")


def collection_date_ist(collected_at: object | None = None) -> date:
    """Calendar date in Asia/Kolkata for the one-entry-per-day key."""
    if collected_at is None:
        return datetime.now(tz=_IST).date()
    if isinstance(collected_at, date) and not isinstance(collected_at, datetime):
        return collected_at
    if isinstance(collected_at, datetime):
        dt = collected_at
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(_IST).date()
    return datetime.now(tz=_IST).date()

# ---------------------------------------------------------------------------
# Module-level engine singleton
# ---------------------------------------------------------------------------
_engine: Engine | None = None


def get_engine(database_url: str | None = None) -> Engine:
    """
    Return (and lazily create) the global SQLAlchemy engine.

    Priority order for the connection string:
    1. The *database_url* argument (if supplied)
    2. The DATABASE_URL environment variable

    Raises:
        ValueError: if no connection string is available.
    """
    global _engine
    if _engine is None:
        url = database_url or os.environ.get("DATABASE_URL")
        if not url:
            raise ValueError(
                "No database URL provided. Set DATABASE_URL env var or pass "
                "database_url to get_engine()."
            )
        _engine = create_engine(
            url,
            pool_pre_ping=True,
            future=True,
        )
    return _engine


@contextmanager
def get_session(
    database_url: str | None = None,
) -> Generator[Connection, None, None]:
    """
    Context manager that yields an open, auto-committing database connection.

    Usage::

        with get_session() as conn:
            result = conn.execute(text("SELECT 1"))
    """
    engine = get_engine(database_url)
    with engine.begin() as conn:
        yield conn


# ---------------------------------------------------------------------------
# DAL — App Store
# ---------------------------------------------------------------------------


def upsert_app_store_snapshot(
    conn: Connection,
    operator_id: int,
    source: str,
    collected_at: object,
    overall_rating: float | None,
    review_count: int | None,
    app_version: str | None,
    downloads: str | None = None,
    downloads_raw: int | None = None,
    star_1: int | None = None,
    star_2: int | None = None,
    star_3: int | None = None,
    star_4: int | None = None,
    star_5: int | None = None,
    play_topics: dict[str, Any] | None = None,
    ratings_count: int | None = None,
) -> int:
    """
    Upsert one app_store_snapshots row per (operator, source, IST day).

    Re-syncing the same day overwrites metrics and returns the existing id so
    callers can replace child reviews.

    ratings_count = people who left a star (Play: ratings)
    review_count  = written text reviews (Play: reviews)
    """
    day = collection_date_ist(collected_at)
    topics_json = json.dumps(play_topics or {})

    stmt = text(
        """
        INSERT INTO app_store_snapshots
            (operator_id, source, collected_at, collection_date,
             overall_rating, ratings_count, review_count, app_version,
             downloads, downloads_raw,
             star_1, star_2, star_3, star_4, star_5,
             play_topics, is_stale)
        VALUES
            (:operator_id, :source, :collected_at, :collection_date,
             :overall_rating, :ratings_count, :review_count, :app_version,
             :downloads, :downloads_raw,
             :star_1, :star_2, :star_3, :star_4, :star_5,
             CAST(:play_topics AS jsonb), FALSE)
        ON CONFLICT (operator_id, source, collection_date) DO UPDATE SET
            collected_at   = EXCLUDED.collected_at,
            overall_rating = EXCLUDED.overall_rating,
            ratings_count  = EXCLUDED.ratings_count,
            review_count   = EXCLUDED.review_count,
            app_version    = EXCLUDED.app_version,
            downloads      = EXCLUDED.downloads,
            downloads_raw  = EXCLUDED.downloads_raw,
            star_1         = EXCLUDED.star_1,
            star_2         = EXCLUDED.star_2,
            star_3         = EXCLUDED.star_3,
            star_4         = EXCLUDED.star_4,
            star_5         = EXCLUDED.star_5,
            play_topics    = EXCLUDED.play_topics,
            is_stale       = FALSE
        RETURNING id
        """
    )
    row = conn.execute(
        stmt,
        {
            "operator_id": operator_id,
            "source": source,
            "collected_at": collected_at,
            "collection_date": day,
            "overall_rating": overall_rating,
            "ratings_count": ratings_count,
            "review_count": review_count,
            "app_version": app_version,
            "downloads": downloads,
            "downloads_raw": downloads_raw,
            "star_1": star_1,
            "star_2": star_2,
            "star_3": star_3,
            "star_4": star_4,
            "star_5": star_5,
            "play_topics": topics_json,
        },
    ).fetchone()
    return int(row[0])


def insert_app_store_reviews(
    conn: Connection,
    snapshot_id: int,
    operator_id: int,
    source: str,
    reviews: list[dict],
) -> int:
    """
    Bulk-insert app store reviews and return the count inserted.

    Each dict in *reviews* must contain:
        review_text  (str | None)
        star_rating  (int | None)
        reviewed_at  (datetime-like | None)
        collected_at (datetime-like)
    """
    if not reviews:
        return 0

    stmt = text(
        """
        INSERT INTO app_store_reviews
            (snapshot_id, operator_id, source, review_text, star_rating, reviewed_at, collected_at)
        VALUES
            (:snapshot_id, :operator_id, :source, :review_text, :star_rating, :reviewed_at, :collected_at)
        """
    )
    params = [
        {
            "snapshot_id": snapshot_id,
            "operator_id": operator_id,
            "source": source,
            "review_text": r.get("review_text"),
            "star_rating": r.get("star_rating"),
            "reviewed_at": r.get("reviewed_at"),
            "collected_at": r["collected_at"],
        }
        for r in reviews
    ]
    conn.execute(stmt, params)
    return len(params)


def replace_app_store_reviews(
    conn: Connection,
    snapshot_id: int,
    operator_id: int,
    source: str,
    reviews: list[dict],
) -> int:
    """Delete existing reviews for a snapshot, then insert the new set."""
    conn.execute(
        text("DELETE FROM app_store_reviews WHERE snapshot_id = :snapshot_id"),
        {"snapshot_id": snapshot_id},
    )
    return insert_app_store_reviews(conn, snapshot_id, operator_id, source, reviews)


# ---------------------------------------------------------------------------
# DAL — Google Reviews
# ---------------------------------------------------------------------------


def upsert_google_snapshot(
    conn: Connection,
    operator_id: int,
    collected_at: object,
    overall_rating: float | None,
    review_count: int | None,
    star_1: int | None = None,
    star_2: int | None = None,
    star_3: int | None = None,
    star_4: int | None = None,
    star_5: int | None = None,
) -> int:
    """Upsert one google_review_snapshots row per (operator, IST day)."""
    day = collection_date_ist(collected_at)
    stmt = text(
        """
        INSERT INTO google_review_snapshots
            (operator_id, collected_at, collection_date,
             overall_rating, review_count,
             star_1, star_2, star_3, star_4, star_5, is_stale)
        VALUES
            (:operator_id, :collected_at, :collection_date,
             :overall_rating, :review_count,
             :star_1, :star_2, :star_3, :star_4, :star_5, FALSE)
        ON CONFLICT (operator_id, collection_date) DO UPDATE SET
            collected_at   = EXCLUDED.collected_at,
            overall_rating = EXCLUDED.overall_rating,
            review_count   = EXCLUDED.review_count,
            star_1         = EXCLUDED.star_1,
            star_2         = EXCLUDED.star_2,
            star_3         = EXCLUDED.star_3,
            star_4         = EXCLUDED.star_4,
            star_5         = EXCLUDED.star_5,
            is_stale       = FALSE
        RETURNING id
        """
    )
    row = conn.execute(
        stmt,
        {
            "operator_id": operator_id,
            "collected_at": collected_at,
            "collection_date": day,
            "overall_rating": overall_rating,
            "review_count": review_count,
            "star_1": star_1,
            "star_2": star_2,
            "star_3": star_3,
            "star_4": star_4,
            "star_5": star_5,
        },
    ).fetchone()
    return int(row[0])


def insert_google_reviews(
    conn: Connection,
    snapshot_id: int,
    operator_id: int,
    reviews: list[dict],
) -> int:
    """
    Bulk-insert Google reviews and return the count inserted.

    Each dict in *reviews* must contain:
        review_text  (str | None)
        star_rating  (int | None)
        reviewed_at  (datetime-like | None)
        collected_at (datetime-like)
    """
    if not reviews:
        return 0

    stmt = text(
        """
        INSERT INTO google_reviews
            (snapshot_id, operator_id, review_text, star_rating, reviewed_at, collected_at)
        VALUES
            (:snapshot_id, :operator_id, :review_text, :star_rating, :reviewed_at, :collected_at)
        """
    )
    params = [
        {
            "snapshot_id": snapshot_id,
            "operator_id": operator_id,
            "review_text": r.get("review_text"),
            "star_rating": r.get("star_rating"),
            "reviewed_at": r.get("reviewed_at"),
            "collected_at": r["collected_at"],
        }
        for r in reviews
    ]
    conn.execute(stmt, params)
    return len(params)


def replace_google_reviews(
    conn: Connection,
    snapshot_id: int,
    operator_id: int,
    reviews: list[dict],
) -> int:
    """Delete existing reviews for a snapshot, then insert the new set."""
    conn.execute(
        text("DELETE FROM google_reviews WHERE snapshot_id = :snapshot_id"),
        {"snapshot_id": snapshot_id},
    )
    return insert_google_reviews(conn, snapshot_id, operator_id, reviews)


# ---------------------------------------------------------------------------
# DAL — Redbus
# ---------------------------------------------------------------------------


def upsert_redbus_snapshot(
    conn: Connection,
    operator_id: int,
    route_id: int,
    collected_at: object,
    overall_rating: float | None,
    review_count: int | None,
) -> int:
    """
    Insert a new redbus_snapshots row and return the generated id.
    """
    stmt = text(
        """
        INSERT INTO redbus_snapshots
            (operator_id, route_id, collected_at, overall_rating, review_count)
        VALUES
            (:operator_id, :route_id, :collected_at, :overall_rating, :review_count)
        RETURNING id
        """
    )
    row = conn.execute(
        stmt,
        {
            "operator_id": operator_id,
            "route_id": route_id,
            "collected_at": collected_at,
            "overall_rating": overall_rating,
            "review_count": review_count,
        },
    ).fetchone()
    return int(row[0])


def insert_redbus_reviews(
    conn: Connection,
    snapshot_id: int,
    operator_id: int,
    route_id: int,
    reviews: list[dict],
) -> int:
    """
    Bulk-insert Redbus reviews and return the count inserted.

    Each dict in *reviews* must contain:
        review_text  (str | None)
        star_rating  (int | None)
        reviewed_at  (datetime-like | None)
        collected_at (datetime-like)
    """
    if not reviews:
        return 0

    stmt = text(
        """
        INSERT INTO redbus_reviews
            (snapshot_id, operator_id, route_id, review_text, star_rating, reviewed_at, collected_at)
        VALUES
            (:snapshot_id, :operator_id, :route_id, :review_text, :star_rating, :reviewed_at, :collected_at)
        """
    )
    params = [
        {
            "snapshot_id": snapshot_id,
            "operator_id": operator_id,
            "route_id": route_id,
            "review_text": r.get("review_text"),
            "star_rating": r.get("star_rating"),
            "reviewed_at": r.get("reviewed_at"),
            "collected_at": r["collected_at"],
        }
        for r in reviews
    ]
    conn.execute(stmt, params)
    return len(params)


# ---------------------------------------------------------------------------
# DAL — Stale flag
# ---------------------------------------------------------------------------

_VALID_SNAPSHOT_TABLES = frozenset(
    {"app_store_snapshots", "google_review_snapshots", "redbus_snapshots"}
)


def set_snapshot_stale(conn: Connection, table: str, snapshot_id: int) -> None:
    """
    Mark a snapshot row as stale (is_stale = TRUE).

    Parameters
    ----------
    conn:        Open SQLAlchemy connection.
    table:       One of 'app_store_snapshots', 'google_review_snapshots',
                 'redbus_snapshots'.
    snapshot_id: Primary key of the snapshot to mark.

    Raises
    ------
    ValueError: if *table* is not one of the allowed snapshot table names.
    """
    if table not in _VALID_SNAPSHOT_TABLES:
        raise ValueError(
            f"Invalid snapshot table '{table}'. "
            f"Must be one of: {sorted(_VALID_SNAPSHOT_TABLES)}"
        )
    # Table name is validated against a whitelist above — safe to interpolate.
    stmt = text(f"UPDATE {table} SET is_stale = TRUE WHERE id = :snapshot_id")  # noqa: S608
    conn.execute(stmt, {"snapshot_id": snapshot_id})


# ---------------------------------------------------------------------------
# DAL — Reference lookups
# ---------------------------------------------------------------------------


def get_operator_id(conn: Connection, slug: str) -> int | None:
    """
    Return the operator's integer id for *slug*, or None if not found.
    """
    stmt = text("SELECT id FROM operators WHERE slug = :slug")
    row = conn.execute(stmt, {"slug": slug}).fetchone()
    return int(row[0]) if row else None


def get_route_id(conn: Connection, origin: str, destination: str) -> int | None:
    """
    Return the route's integer id for the given origin/destination pair,
    or None if not found.
    """
    stmt = text(
        "SELECT id FROM routes WHERE origin = :origin AND destination = :destination"
    )
    row = conn.execute(stmt, {"origin": origin, "destination": destination}).fetchone()
    return int(row[0]) if row else None


# ---------------------------------------------------------------------------
# DAL — CAPTCHA alerts
# ---------------------------------------------------------------------------


def insert_captcha_alert(
    conn: Connection,
    source: str,
    operator_id: int | None = None,
) -> int:
    """
    Record a CAPTCHA detection event and return the new alert id.

    Parameters
    ----------
    conn:        Open SQLAlchemy connection.
    source:      Scraper source string (e.g. 'redbus', 'google_reviews').
    operator_id: Optional operator FK; None for source-level alerts.

    Returns
    -------
    int: The newly created captcha_alert id.
    """
    stmt = text(
        """
        INSERT INTO captcha_alerts (source, operator_id, detected_at)
        VALUES (:source, :operator_id, NOW())
        RETURNING id
        """
    )
    row = conn.execute(
        stmt,
        {"source": source, "operator_id": operator_id},
    ).fetchone()
    return int(row[0])
