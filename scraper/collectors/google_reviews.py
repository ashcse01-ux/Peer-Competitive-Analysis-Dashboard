"""
scraper/collectors/google_reviews.py

GoogleReviewsCollector — fetches Google Knowledge Panel ratings and up to 50
recent reviews for each operator via Playwright headless Chromium.

Responsibilities (tasks 4.1 – 4.6):
  4.1  GoogleReviewsCollector class skeleton with __init__ / collect_all /
       collect_operator.
  4.2  Extract overall rating, review count, and up to 50 review snippets from
       the Google Search Knowledge Panel.
  4.3  Handle absent Knowledge Panel (null snapshot + log, panel_absent=True).
       Swallow exceptions from upsert_google_snapshot when panel is absent.
  4.4  Enforce a 30-minute collection SLA via threading.Timer; log WARNING and
       return partial results when exceeded.
  4.5  Wrap Playwright navigation in _fetch_with_retry using @with_retry
       (max_retries=5, base_delay=2.0, max_delay=8.0). On RetryExhausted,
       mark the most recent google snapshot stale and return None.
  4.6  Random 2–8 s sleep between operator requests (not before the first).
"""

from __future__ import annotations

import random
import threading
import time
import urllib.parse
from datetime import datetime, timezone
from typing import Any

from scraper.db import (
    get_operator_id,
    insert_google_reviews,
    set_snapshot_stale,
    upsert_google_snapshot,
)
from scraper.utils.logger import (
    get_logger,
    log_http_error,
    log_http_request,
    log_http_response,
)
from scraper.utils.retry import RetryExhausted, with_retry
from scraper.utils.user_agents import get_random_user_agent

__all__ = ["GoogleReviewsCollector", "OPERATOR_SEARCH_NAMES"]

# ---------------------------------------------------------------------------
# Operator search names (task 4.1)
# ---------------------------------------------------------------------------
OPERATOR_SEARCH_NAMES: dict[str, str] = {
    "freshbus": "FreshBus",
    "neugo": "Neugo",
    "flixbus": "FlixBus",
    "zingbus": "Zingbus",
    "leafy": "Leafy Bus",
    "intrcity": "IntrCity SmartBus",
}

# SLA constants
SLA_SECONDS = 30 * 60  # 30 minutes
MAX_REVIEWS = 50

# Selectors for Knowledge Panel elements
_RATING_SELECTORS = ["span.Aq14fc", "div.BHMmbe"]
_REVIEW_COUNT_SELECTOR = "span.hqzQac span"
_REVIEW_ITEM_SELECTORS = [
    "div.gws-localreviews__google-review",
    "div[data-review-id]",
    "div.jxjCjc",
]

logger = get_logger(__name__)


# ---------------------------------------------------------------------------
# GoogleReviewsCollector
# ---------------------------------------------------------------------------


class GoogleReviewsCollector:
    """Collects Google Knowledge Panel ratings and reviews for all operators.

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
        """Collect Google reviews data for every operator.

        Enforces a 30-minute wall-clock SLA using threading.Timer.  If the
        collection overruns the limit, a WARNING is logged and the method
        returns whatever data has been gathered so far.

        Random sleep of 2–8 seconds is applied *between* operator requests
        (not before the first).

        Returns
        -------
        dict
            ``{"total": int, "success": int, "stale_operators": list[str]}``
        """
        total = 0
        success = 0
        stale_operators: list[str] = []
        sla_exceeded = threading.Event()

        def _on_sla_exceeded():
            sla_exceeded.set()

        timer = threading.Timer(SLA_SECONDS, _on_sla_exceeded)
        timer.daemon = True
        timer.start()

        logger.info(
            "google_reviews_collection_started",
            operators=list(OPERATOR_SEARCH_NAMES.keys()),
            sla_minutes=SLA_SECONDS // 60,
        )

        try:
            first = True
            for operator_slug in OPERATOR_SEARCH_NAMES:
                if sla_exceeded.is_set():
                    logger.warning(
                        "google_reviews_sla_exceeded",
                        completed_so_far=success,
                        total_attempts=total,
                        sla_minutes=SLA_SECONDS // 60,
                    )
                    break

                # Random sleep between operators (not before the first)
                if not first:
                    sleep_seconds = random.uniform(2, 8)
                    time.sleep(sleep_seconds)
                first = False

                total += 1
                result = self.collect_operator(operator_slug)
                if result is None:
                    stale_operators.append(operator_slug)
                else:
                    success += 1

        finally:
            timer.cancel()

        logger.info(
            "google_reviews_collection_finished",
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

    def collect_operator(self, operator_slug: str) -> dict | None:
        """Collect Google reviews data for one operator.

        Parameters
        ----------
        operator_slug:
            One of the keys in :data:`OPERATOR_SEARCH_NAMES`.

        Returns
        -------
        dict | None
            Result dict on success or when panel is absent; ``None`` when
            the snapshot was marked stale due to retry exhaustion or when the
            operator is not found in the DB.
        """
        operator_name = OPERATOR_SEARCH_NAMES.get(operator_slug)
        if operator_name is None:
            logger.warning(
                "google_reviews_unknown_operator",
                operator_slug=operator_slug,
            )
            return None

        collected_at = datetime.now(tz=timezone.utc)

        # Resolve operator_id from DB
        operator_id: int | None = get_operator_id(self._conn, operator_slug)
        if operator_id is None:
            logger.warning(
                "operator_not_found_in_db",
                operator_slug=operator_slug,
                source="google_reviews",
            )
            return None

        # Attempt to fetch data with retry
        try:
            fetch_result = self._fetch_with_retry(
                operator_slug=operator_slug,
                operator_name=operator_name,
                collected_at=collected_at,
            )
        except RetryExhausted as exc:
            logger.error(
                "google_reviews_retries_exhausted",
                operator_slug=operator_slug,
                last_error=str(exc.last_exception),
            )
            stale_id = self._get_latest_snapshot_id(operator_id)
            if stale_id is not None:
                set_snapshot_stale(self._conn, "google_review_snapshots", stale_id)
                logger.warning(
                    "google_snapshot_marked_stale",
                    operator_slug=operator_slug,
                    snapshot_id=stale_id,
                )
            return None

        overall_rating: float | None = fetch_result.get("overall_rating")
        review_count: int | None = fetch_result.get("review_count")
        reviews: list[dict] = fetch_result.get("reviews", [])

        # Absent Knowledge Panel (task 4.3)
        if overall_rating is None and review_count is None:
            logger.warning(
                "google_knowledge_panel_absent",
                operator_slug=operator_slug,
            )
            try:
                upsert_google_snapshot(
                    conn=self._conn,
                    operator_id=operator_id,
                    collected_at=collected_at,
                    overall_rating=None,
                    review_count=None,
                )
            except Exception as exc:
                logger.error(
                    "google_snapshot_upsert_failed",
                    operator_slug=operator_slug,
                    error=str(exc),
                )
            return {
                "operator_slug": operator_slug,
                "overall_rating": None,
                "review_count": None,
                "reviews_inserted": 0,
                "panel_absent": True,
            }

        # Persist snapshot and reviews
        snapshot_id = upsert_google_snapshot(
            conn=self._conn,
            operator_id=operator_id,
            collected_at=collected_at,
            overall_rating=overall_rating,
            review_count=review_count,
        )

        reviews_inserted = insert_google_reviews(
            conn=self._conn,
            snapshot_id=snapshot_id,
            operator_id=operator_id,
            reviews=reviews,
        )

        logger.info(
            "google_reviews_operator_collected",
            operator_slug=operator_slug,
            overall_rating=overall_rating,
            review_count=review_count,
            reviews_inserted=reviews_inserted,
            snapshot_id=snapshot_id,
        )

        return {
            "operator_slug": operator_slug,
            "overall_rating": overall_rating,
            "review_count": review_count,
            "reviews_inserted": reviews_inserted,
            "snapshot_id": snapshot_id,
        }

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _fetch_with_retry(
        self,
        operator_slug: str,
        operator_name: str,
        collected_at: datetime,
    ) -> dict:
        """Wrap the Playwright data fetch in the retry decorator (task 4.5)."""

        @with_retry(max_retries=5, base_delay=2.0, max_delay=8.0)
        def _do_fetch() -> dict:
            return self._fetch_playwright_data(
                operator_slug=operator_slug,
                operator_name=operator_name,
                collected_at=collected_at,
            )

        return _do_fetch()

    def _fetch_playwright_data(
        self,
        operator_slug: str,
        operator_name: str,
        collected_at: datetime,
    ) -> dict:
        """Open a headless Chromium browser and scrape the Google Knowledge Panel.

        Returns
        -------
        dict
            ``{"overall_rating": float|None, "review_count": int|None, "reviews": list}``
        """
        search_query = urllib.parse.quote(operator_name)
        url = f"https://www.google.com/search?q={search_query}+reviews"
        user_agent = get_random_user_agent()

        log_http_request(logger, method="GET", url=url)
        t0 = time.monotonic()

        overall_rating: float | None = None
        review_count: int | None = None
        reviews: list[dict] = []

        try:
            from playwright.sync_api import sync_playwright  # lazy import
            with sync_playwright() as pw:
                browser = pw.chromium.launch(headless=True)
                context = browser.new_context(user_agent=user_agent)
                page = context.new_page()

                try:
                    page.goto(url, wait_until="domcontentloaded", timeout=30_000)

                    # Extract overall rating — try primary selector then fallback
                    rating_el = None
                    for selector in _RATING_SELECTORS:
                        rating_el = page.query_selector(selector)
                        if rating_el:
                            break

                    if rating_el:
                        rating_text = rating_el.inner_text().strip()
                        try:
                            overall_rating = float(rating_text.replace(",", "."))
                        except ValueError:
                            logger.warning(
                                "google_rating_parse_error",
                                operator_slug=operator_slug,
                                raw_text=rating_text,
                            )

                    # Extract review count
                    count_el = page.query_selector(_REVIEW_COUNT_SELECTOR)
                    if count_el:
                        count_text = count_el.inner_text().strip()
                        # Strip non-numeric characters (commas, spaces, letters)
                        digits = "".join(c for c in count_text if c.isdigit())
                        if digits:
                            try:
                                review_count = int(digits)
                            except ValueError:
                                logger.warning(
                                    "google_review_count_parse_error",
                                    operator_slug=operator_slug,
                                    raw_text=count_text,
                                )

                    # Extract review snippets (up to MAX_REVIEWS)
                    review_els = []
                    for selector in _REVIEW_ITEM_SELECTORS:
                        review_els = page.query_selector_all(selector)
                        if review_els:
                            break

                    for el in review_els[:MAX_REVIEWS]:
                        try:
                            text_el = el.query_selector("span[data-expandable-section]") or \
                                      el.query_selector("div.Jtu6Td") or \
                                      el.query_selector("span.review-full-text") or \
                                      el.query_selector("span")
                            review_text = text_el.inner_text().strip() if text_el else None

                            # Attempt to parse star rating from aria-label or data attributes
                            star_el = el.query_selector("span[aria-label]")
                            star_rating: int | None = None
                            if star_el:
                                aria = star_el.get_attribute("aria-label") or ""
                                digits_found = "".join(c for c in aria if c.isdigit())
                                if digits_found:
                                    star_rating = int(digits_found[0])  # first digit

                            reviews.append({
                                "review_text": review_text,
                                "star_rating": star_rating,
                                "reviewed_at": None,
                                "collected_at": collected_at,
                            })
                        except Exception:
                            # Skip malformed review elements
                            continue

                finally:
                    context.close()
                    browser.close()

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

        return {
            "overall_rating": overall_rating,
            "review_count": review_count,
            "reviews": reviews,
        }

    def _get_latest_snapshot_id(self, operator_id: int) -> int | None:
        """Return the most recent google_review_snapshots.id for the operator."""
        from sqlalchemy import text

        stmt = text(
            """
            SELECT id
            FROM   google_review_snapshots
            WHERE  operator_id = :operator_id
            ORDER  BY collected_at DESC
            LIMIT  1
            """
        )
        row = self._conn.execute(stmt, {"operator_id": operator_id}).fetchone()
        return int(row[0]) if row else None
