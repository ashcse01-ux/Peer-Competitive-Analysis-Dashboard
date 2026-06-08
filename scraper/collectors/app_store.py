"""
scraper/collectors/app_store.py

AppStoreCollector — fetches app metadata and the 200 most recent reviews for
each operator from both Google Play and the Apple App Store.

Responsibilities (tasks 3.1 – 3.5):
  3.1  AppStoreCollector class skeleton with __init__ / collect_all /
       collect_operator.
  3.2  Collect overall rating, review count, app version, and 200 most recent
       reviews (text, star rating, review date) per operator per store.
  3.3  Handle missing / unavailable apps (null snapshot + log, no stale flag)
       and transient errors (exponential back-off via @with_retry).
  3.4  On retry exhaustion (RetryExhausted), mark the most recent snapshot as
       stale and continue the pipeline without re-raising.
  3.5  Enforce a 60-minute collection SLA across collect_all(); log a WARNING
       if the wall-clock time exceeds the limit.
"""

from __future__ import annotations

import json
import platform
import signal
import threading
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import structlog

from scraper.db import (
    get_operator_id,
    insert_app_store_reviews,
    set_snapshot_stale,
    upsert_app_store_snapshot,
)
from scraper.utils.logger import (
    get_logger,
    log_http_error,
    log_http_request,
    log_http_response,
)
from scraper.utils.retry import RetryExhausted, with_retry

__all__ = ["AppStoreCollector", "OPERATOR_APP_IDS"]

# ---------------------------------------------------------------------------
# App IDs for each operator on each platform (loaded from config)
# ---------------------------------------------------------------------------
_CONFIG_PATH = Path(__file__).resolve().parent.parent / "config" / "app_ids.json"


def _load_operator_app_ids() -> dict[str, dict[str, str | None]]:
    with open(_CONFIG_PATH, encoding="utf-8") as f:
        return json.load(f)


OPERATOR_APP_IDS: dict[str, dict[str, str | None]] = _load_operator_app_ids()


def _itunes_lookup(app_id: str) -> dict[str, Any]:
    """Fetch authoritative iOS rating and review count from Apple iTunes API."""
    url = f"https://itunes.apple.com/lookup?id={app_id}&country=in"
    req = urllib.request.Request(url, headers={"User-Agent": "FreshBus-Dashboard/1.0"})
    with urllib.request.urlopen(req, timeout=20) as resp:
        data = json.loads(resp.read())
    results = data.get("results") or []
    if not results:
        return {}
    item = results[0]
    return {
        "overall_rating": item.get("averageUserRating"),
        "review_count": item.get("userRatingCount"),
        "app_version": item.get("version"),
    }

# SLA constants
SLA_SECONDS = 60 * 60  # 60 minutes
REVIEW_FETCH_COUNT = 200

# Sources
GOOGLE_PLAY = "google_play"
IOS_APP_STORE = "ios_app_store"

logger: structlog.stdlib.BoundLogger = get_logger(__name__)


# ---------------------------------------------------------------------------
# Timeout helpers (task 3.5)
# ---------------------------------------------------------------------------

class _SLAExceeded(Exception):
    """Raised internally when the 60-minute SLA is breached."""


def _make_timeout_context(seconds: int):
    """
    Return a context manager that raises _SLAExceeded after *seconds* on Unix,
    or uses a threading.Timer to set a flag on Windows.

    On Unix we rely on signal.SIGALRM (precise, in-thread).
    On Windows we use a threading.Timer that sets an Event; the main loop
    checks the event periodically via _check_timeout().
    """
    if platform.system() != "Windows":
        return _UnixAlarmContext(seconds)
    return _ThreadingTimerContext(seconds)


class _UnixAlarmContext:
    """SIGALRM-based timeout for Unix/macOS."""

    def __init__(self, seconds: int) -> None:
        self._seconds = seconds
        self._old_handler = None

    def __enter__(self) -> "_UnixAlarmContext":
        def _handler(signum, frame):
            raise _SLAExceeded(
                f"Collection exceeded the {self._seconds // 60}-minute SLA."
            )

        self._old_handler = signal.signal(signal.SIGALRM, _handler)
        signal.alarm(self._seconds)
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> bool:
        signal.alarm(0)  # cancel the alarm
        if self._old_handler is not None:
            signal.signal(signal.SIGALRM, self._old_handler)
        return False  # do not suppress exceptions


class _ThreadingTimerContext:
    """threading.Timer-based timeout for Windows (best-effort)."""

    def __init__(self, seconds: int) -> None:
        self._seconds = seconds
        self._exceeded = threading.Event()
        self._timer: threading.Timer | None = None

    def __enter__(self) -> "_ThreadingTimerContext":
        self._exceeded.clear()
        self._timer = threading.Timer(
            self._seconds, self._exceeded.set
        )
        self._timer.daemon = True
        self._timer.start()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> bool:
        if self._timer is not None:
            self._timer.cancel()
        return False

    def check(self) -> None:
        """Call periodically; raises _SLAExceeded if timer has fired."""
        if self._exceeded.is_set():
            raise _SLAExceeded(
                f"Collection exceeded the {self._seconds // 60}-minute SLA."
            )


# ---------------------------------------------------------------------------
# AppStoreCollector
# ---------------------------------------------------------------------------


class AppStoreCollector:
    """Collects app store data for all configured operators.

    Parameters
    ----------
    db_connection:
        An open SQLAlchemy :class:`~sqlalchemy.engine.Connection` (inside a
        transaction) used for all database writes.
    """

    def __init__(self, db_connection: Any) -> None:
        self._conn = db_connection

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def collect_all(self) -> dict:
        """Collect app store data for every operator on both stores.

        Enforces a 60-minute wall-clock SLA.  If the collection overruns the
        limit, a WARNING is logged and the method returns whatever data has
        been gathered so far.

        Returns
        -------
        dict
            ``{"total": int, "success": int, "stale_operators": list[str]}``
        """
        start_ts = time.monotonic()
        total = 0
        success = 0
        stale_operators: list[str] = []

        timeout_ctx = _make_timeout_context(SLA_SECONDS)

        logger.info(
            "app_store_collection_started",
            operators=list(OPERATOR_APP_IDS.keys()),
            sources=[GOOGLE_PLAY, IOS_APP_STORE],
            sla_minutes=SLA_SECONDS // 60,
        )

        try:
            with timeout_ctx:
                for operator_slug, app_ids in OPERATOR_APP_IDS.items():
                    for source in (GOOGLE_PLAY, IOS_APP_STORE):
                        # Windows: check timer flag between iterations
                        if isinstance(timeout_ctx, _ThreadingTimerContext):
                            timeout_ctx.check()

                        total += 1
                        result = self.collect_operator(operator_slug, source)
                        if result is None:
                            stale_operators.append(f"{operator_slug}:{source}")
                        else:
                            success += 1

        except _SLAExceeded:
            elapsed_min = (time.monotonic() - start_ts) / 60
            logger.warning(
                "app_store_sla_exceeded",
                elapsed_minutes=round(elapsed_min, 2),
                sla_minutes=SLA_SECONDS // 60,
                completed_so_far=success,
                total_attempts=total,
            )

        elapsed_total = time.monotonic() - start_ts
        logger.info(
            "app_store_collection_finished",
            elapsed_seconds=round(elapsed_total, 2),
            total=total,
            success=success,
            stale_count=len(stale_operators),
            stale_operators=stale_operators,
        )

        return {
            "total": total,
            "success": success,
            "stale_operators": stale_operators,
        }

    def collect_operator(
        self, operator_slug: str, source: str
    ) -> dict | None:
        """Collect app store data for one operator from one store.

        Parameters
        ----------
        operator_slug:
            One of the keys in :data:`OPERATOR_APP_IDS`.
        source:
            ``'google_play'`` or ``'ios_app_store'``.

        Returns
        -------
        dict | None
            Result dict on success; ``None`` when the snapshot was marked
            stale (retry exhaustion).  Missing-app cases return a dict with
            null metric fields and do **not** return None.
        """
        collected_at = datetime.now(tz=timezone.utc)

        app_ids = OPERATOR_APP_IDS.get(operator_slug, {})
        app_id: str | None = app_ids.get(source)

        # ----------------------------------------------------------------
        # Resolve operator_id from DB
        # ----------------------------------------------------------------
        operator_id: int | None = get_operator_id(self._conn, operator_slug)
        if operator_id is None:
            logger.warning(
                "operator_not_found_in_db",
                operator_slug=operator_slug,
                source=source,
            )
            # Cannot persist without a valid FK — skip silently.
            return None

        # ----------------------------------------------------------------
        # Missing app_id — record null snapshot and move on (task 3.3)
        # ----------------------------------------------------------------
        if app_id is None:
            logger.info(
                "app_id_not_configured",
                operator_slug=operator_slug,
                source=source,
                note="Inserting null snapshot; not marking stale.",
            )
            upsert_app_store_snapshot(
                conn=self._conn,
                operator_id=operator_id,
                source=source,
                collected_at=collected_at,
                overall_rating=None,
                review_count=None,
                app_version=None,
            )
            return {
                "operator_slug": operator_slug,
                "source": source,
                "overall_rating": None,
                "review_count": None,
                "app_version": None,
                "reviews_inserted": 0,
                "app_absent": True,
            }

        # ----------------------------------------------------------------
        # Fetch with retry (tasks 3.2, 3.3)
        # ----------------------------------------------------------------
        snapshot_id: int | None = None

        try:
            fetch_result = self._fetch_with_retry(
                operator_slug=operator_slug,
                source=source,
                app_id=app_id,
                collected_at=collected_at,
            )
        except RetryExhausted as exc:
            # ----------------------------------------------------------------
            # Retry exhaustion — mark stale and continue (task 3.4)
            # ----------------------------------------------------------------
            logger.error(
                "app_store_retries_exhausted",
                operator_slug=operator_slug,
                source=source,
                app_id=app_id,
                last_error=str(exc.last_exception),
            )
            # Try to find the most recent snapshot for this operator+source
            # so we can mark it stale.
            stale_id = self._get_latest_snapshot_id(operator_id, source)
            if stale_id is not None:
                set_snapshot_stale(self._conn, "app_store_snapshots", stale_id)
                logger.warning(
                    "app_store_snapshot_marked_stale",
                    operator_slug=operator_slug,
                    source=source,
                    snapshot_id=stale_id,
                )
            return None

        # ----------------------------------------------------------------
        # Unpack fetch result and persist
        # ----------------------------------------------------------------
        overall_rating: float | None = fetch_result.get("overall_rating")
        review_count: int | None = fetch_result.get("review_count")
        app_version: str | None = fetch_result.get("app_version")
        reviews: list[dict] = fetch_result.get("reviews", [])

        snapshot_id = upsert_app_store_snapshot(
            conn=self._conn,
            operator_id=operator_id,
            source=source,
            collected_at=collected_at,
            overall_rating=overall_rating,
            review_count=review_count,
            app_version=app_version,
        )

        reviews_inserted = insert_app_store_reviews(
            conn=self._conn,
            snapshot_id=snapshot_id,
            operator_id=operator_id,
            source=source,
            reviews=reviews,
        )

        logger.info(
            "app_store_operator_collected",
            operator_slug=operator_slug,
            source=source,
            overall_rating=overall_rating,
            review_count=review_count,
            app_version=app_version,
            reviews_inserted=reviews_inserted,
            snapshot_id=snapshot_id,
        )

        return {
            "operator_slug": operator_slug,
            "source": source,
            "overall_rating": overall_rating,
            "review_count": review_count,
            "app_version": app_version,
            "reviews_inserted": reviews_inserted,
            "snapshot_id": snapshot_id,
        }

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _fetch_with_retry(
        self,
        operator_slug: str,
        source: str,
        app_id: str,
        collected_at: datetime,
    ) -> dict:
        """Wrap the actual network fetch in the retry decorator.

        The decorator is applied at call-time so the ``operator_slug``/
        ``source``/``app_id`` closure values are captured correctly for
        each invocation.
        """

        @with_retry(max_retries=5, base_delay=2.0, max_delay=8.0)
        def _do_fetch() -> dict:
            if source == GOOGLE_PLAY:
                return self._fetch_google_play(operator_slug, app_id, collected_at)
            elif source == IOS_APP_STORE:
                return self._fetch_ios(operator_slug, app_id, collected_at)
            else:
                raise ValueError(f"Unknown source: {source!r}")

        return _do_fetch()

    # ------------------------------------------------------------------ Google Play

    def _fetch_google_play(
        self, operator_slug: str, app_id: str, collected_at: datetime
    ) -> dict:
        """Fetch metadata + reviews from Google Play using google-play-scraper."""
        from google_play_scraper import app as gplay_app
        from google_play_scraper import reviews as gplay_reviews
        from google_play_scraper import Sort

        url = f"https://play.google.com/store/apps/details?id={app_id}"

        # --- fetch app metadata ---
        log_http_request(logger, method="GET", url=url)
        t0 = time.monotonic()
        try:
            app_info = gplay_app(app_id, lang="en", country="in")
        except Exception as exc:
            elapsed_ms = (time.monotonic() - t0) * 1000
            log_http_error(
                logger,
                method="GET",
                url=url,
                error=str(exc),
                attempt=1,
            )
            raise

        elapsed_ms = (time.monotonic() - t0) * 1000
        log_http_response(
            logger,
            method="GET",
            url=url,
            status_code=200,
            elapsed_ms=round(elapsed_ms, 2),
        )

        if app_info is None:
            logger.info(
                "google_play_app_not_found",
                operator_slug=operator_slug,
                app_id=app_id,
            )
            return {
                "overall_rating": None,
                "review_count": None,
                "app_version": None,
                "reviews": [],
                "app_absent": True,
            }

        overall_rating: float | None = app_info.get("score")
        review_count: int | None = app_info.get("reviews")
        app_version: str | None = app_info.get("version")

        # --- fetch reviews ---
        reviews_url = f"{url}&showAllReviews=true"
        log_http_request(logger, method="GET", url=reviews_url)
        t0 = time.monotonic()
        try:
            raw_reviews, _ = gplay_reviews(
                app_id,
                lang="en",
                country="in",
                sort=Sort.NEWEST,
                count=REVIEW_FETCH_COUNT,
            )
        except Exception as exc:
            elapsed_ms = (time.monotonic() - t0) * 1000
            log_http_error(
                logger,
                method="GET",
                url=reviews_url,
                error=str(exc),
                attempt=1,
            )
            raise

        elapsed_ms = (time.monotonic() - t0) * 1000
        log_http_response(
            logger,
            method="GET",
            url=reviews_url,
            status_code=200,
            elapsed_ms=round(elapsed_ms, 2),
        )

        reviews = [
            {
                "review_text": r.get("content"),
                "star_rating": r.get("score"),
                "reviewed_at": r.get("at"),
                "collected_at": collected_at,
            }
            for r in (raw_reviews or [])
        ]

        return {
            "overall_rating": overall_rating,
            "review_count": review_count,
            "app_version": app_version,
            "reviews": reviews,
        }

    # ------------------------------------------------------------------ iOS App Store

    def _fetch_ios(
        self, operator_slug: str, app_id: str, collected_at: datetime
    ) -> dict:
        """Fetch metadata + reviews from the Apple App Store using app-store-scraper."""
        from app_store_scraper import AppStore

        url = f"https://apps.apple.com/in/app/id{app_id}"
        log_http_request(logger, method="GET", url=url)
        t0 = time.monotonic()

        try:
            store = AppStore(country="in", app_name=operator_slug, app_id=app_id)
            store.review(how_many=REVIEW_FETCH_COUNT)
        except Exception as exc:
            elapsed_ms = (time.monotonic() - t0) * 1000
            log_http_error(
                logger,
                method="GET",
                url=url,
                error=str(exc),
                attempt=1,
            )
            raise

        elapsed_ms = (time.monotonic() - t0) * 1000
        log_http_response(
            logger,
            method="GET",
            url=url,
            status_code=200,
            elapsed_ms=round(elapsed_ms, 2),
        )

        raw_reviews: list[dict] = store.reviews or []

        # Authoritative rating/count from iTunes Lookup API (not app-store-scraper metadata).
        meta = _itunes_lookup(app_id)
        overall_rating: float | None = meta.get("overall_rating")
        review_count: int | None = meta.get("review_count")
        app_version: str | None = meta.get("app_version")

        reviews = [
            {
                "review_text": r.get("review"),
                "star_rating": r.get("rating"),
                "reviewed_at": r.get("date"),
                "collected_at": collected_at,
            }
            for r in raw_reviews
        ]

        return {
            "overall_rating": overall_rating,
            "review_count": review_count,
            "app_version": app_version,
            "reviews": reviews,
        }

    # ------------------------------------------------------------------ DB helpers

    def _get_latest_snapshot_id(
        self, operator_id: int, source: str
    ) -> int | None:
        """Return the most recent app_store_snapshots.id for the given pair."""
        from sqlalchemy import text

        stmt = text(
            """
            SELECT id
            FROM   app_store_snapshots
            WHERE  operator_id = :operator_id
              AND  source      = :source
            ORDER  BY collected_at DESC
            LIMIT  1
            """
        )
        row = self._conn.execute(
            stmt, {"operator_id": operator_id, "source": source}
        ).fetchone()
        return int(row[0]) if row else None
