"""
scraper/collectors/redbus.py

RedbusCollector — fetches route-level ratings and up to 100 recent reviews
for each operator across 22 route directions via Playwright headless Chromium.

Responsibilities (tasks 5.1 – 5.6):
  5.1  RedbusCollector class skeleton with __init__ / collect_all /
       collect_route_operator.
  5.2  Iterate all 22 route directions × 6 operators; collect route rating,
       review count, up to 100 reviews (text, star, date).
  5.3  Handle missing operator on route: record null snapshot + log.
  5.4  Detect CAPTCHA challenge (by URL pattern / page title); log event to
       captcha_alerts table; pause the entire source; alert admin via log.
  5.5  Apply exponential back-off on rate-limit/anti-bot; after 5 retries
       mark snapshot stale.
  5.6  Enforce 120-minute collection SLA via threading.Timer; log WARNING
       and break loop when exceeded.
"""

from __future__ import annotations

import random
import threading
import time
from datetime import datetime, timezone
from typing import Any

from scraper.db import (
    get_operator_id,
    get_route_id,
    insert_captcha_alert,
    insert_redbus_reviews,
    set_snapshot_stale,
    upsert_redbus_snapshot,
)
from scraper.utils.logger import (
    get_logger,
    log_http_error,
    log_http_request,
    log_http_response,
)
from scraper.utils.retry import RetryExhausted, with_retry
from scraper.utils.user_agents import get_random_user_agent

__all__ = [
    "CaptchaDetected",
    "RedbusCollector",
    "OPERATORS",
    "OPERATOR_REDBUS_NAMES",
    "ROUTES",
]

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

OPERATORS = ["freshbus", "neugo", "flixbus", "zingbus", "leafy", "intrcity"]

OPERATOR_REDBUS_NAMES: dict[str, str] = {
    "freshbus": "FreshBus",
    "neugo": "Neugo",
    "flixbus": "FlixBus",
    "zingbus": "Zingbus",
    "leafy": "Leafy",
    "intrcity": "IntrCity SmartBus",
}

ROUTES = [
    ("Bangalore", "Chennai"),
    ("Chennai", "Bangalore"),
    ("Bangalore", "Pondicherry"),
    ("Pondicherry", "Bangalore"),
    ("Bangalore", "Tirupati"),
    ("Tirupati", "Bangalore"),
    ("Visakhapatnam", "Vijayawada"),
    ("Vijayawada", "Visakhapatnam"),
    ("Hyderabad", "Guntur"),
    ("Guntur", "Hyderabad"),
    ("Hyderabad", "Vijayawada"),
    ("Vijayawada", "Hyderabad"),
    ("Vijayawada", "Tirupati"),
    ("Tirupati", "Vijayawada"),
    ("Chennai", "Tirupati"),
    ("Tirupati", "Chennai"),
    ("Hyderabad", "Eluru"),
    ("Eluru", "Hyderabad"),
    ("Bangalore", "Salem"),
    ("Salem", "Bangalore"),
    ("Bangalore", "Erode"),
    ("Erode", "Bangalore"),
]

SLA_SECONDS = 120 * 60  # 120 minutes
MAX_REVIEWS = 100

logger = get_logger(__name__)


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------


class CaptchaDetected(Exception):
    """Raised when a CAPTCHA challenge is detected on the Redbus page."""


class _CaptchaPassthrough(BaseException):
    """Internal sentinel: wraps CaptchaDetected to escape the retry loop.

    Because :func:`with_retry` only catches :class:`Exception` subclasses,
    using a :class:`BaseException`-derived wrapper lets CaptchaDetected escape
    the retry machinery without being retried.  The wrapper is unwrapped in
    ``_fetch_with_retry`` before propagating to callers.
    """


# ---------------------------------------------------------------------------
# RedbusCollector
# ---------------------------------------------------------------------------


class RedbusCollector:
    """Collects Redbus route-level ratings and reviews for all operators.

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
        """Collect Redbus data for every route × operator combination.

        Enforces a 120-minute wall-clock SLA using threading.Timer.  If the
        collection overruns the limit, a WARNING is logged and the method
        returns whatever data has been gathered so far.

        Random sleep of 2–8 seconds is applied *between* requests (not before
        the first).  If a CAPTCHA is detected, the source is paused immediately
        and the loop is broken.

        Returns
        -------
        dict
            ``{"total": int, "success": int, "stale": int}``
        """
        total = 0
        success = 0
        stale = 0
        sla_exceeded = threading.Event()

        def _on_sla_exceeded() -> None:
            sla_exceeded.set()

        timer = threading.Timer(SLA_SECONDS, _on_sla_exceeded)
        timer.daemon = True
        timer.start()

        logger.info(
            "redbus_collection_started",
            operators=OPERATORS,
            routes=len(ROUTES),
            sla_minutes=SLA_SECONDS // 60,
        )

        try:
            first = True
            for origin, destination in ROUTES:
                for operator_slug in OPERATORS:
                    if sla_exceeded.is_set():
                        logger.warning(
                            "redbus_sla_exceeded",
                            completed_so_far=success,
                            total_attempts=total,
                            sla_minutes=SLA_SECONDS // 60,
                        )
                        break

                    # Random sleep between requests (not before the first)
                    if not first:
                        sleep_seconds = random.uniform(2, 8)
                        time.sleep(sleep_seconds)
                    first = False

                    total += 1
                    try:
                        result = self.collect_route_operator(
                            origin, destination, operator_slug
                        )
                    except CaptchaDetected:
                        logger.warning(
                            "redbus_captcha_pausing_source",
                            origin=origin,
                            destination=destination,
                            operator_slug=operator_slug,
                        )
                        break

                    if result is None:
                        stale += 1
                    else:
                        success += 1

                else:
                    # Inner loop completed normally; continue to next route
                    continue
                # Inner loop was broken (CAPTCHA or SLA); break outer loop too
                break

        finally:
            timer.cancel()

        logger.info(
            "redbus_collection_finished",
            total=total,
            success=success,
            stale=stale,
        )

        return {
            "total": total,
            "success": success,
            "stale": stale,
        }

    def collect_route_operator(
        self,
        origin: str,
        destination: str,
        operator_slug: str,
    ) -> dict | None:
        """Collect Redbus data for one route direction × operator combination.

        Parameters
        ----------
        origin:
            Origin city name (e.g. "Bangalore").
        destination:
            Destination city name (e.g. "Chennai").
        operator_slug:
            One of the keys in :data:`OPERATOR_REDBUS_NAMES`.

        Returns
        -------
        dict | None
            Result dict on success or when operator is absent on the route;
            ``None`` when the snapshot was marked stale due to retry exhaustion
            or when the operator / route is not found in the DB.

        Raises
        ------
        CaptchaDetected
            If a CAPTCHA is detected during Playwright navigation; a
            captcha_alert record is inserted before re-raising so the caller
            can pause the source.
        """
        operator_id: int | None = get_operator_id(self._conn, operator_slug)
        if operator_id is None:
            logger.warning(
                "operator_not_found_in_db",
                operator_slug=operator_slug,
                source="redbus",
            )
            return None

        route_id: int | None = get_route_id(self._conn, origin, destination)
        if route_id is None:
            logger.warning(
                "route_not_found_in_db",
                origin=origin,
                destination=destination,
                source="redbus",
            )
            return None

        operator_name = OPERATOR_REDBUS_NAMES.get(operator_slug, operator_slug)
        collected_at = datetime.now(tz=timezone.utc)

        try:
            fetch_result = self._fetch_with_retry(
                origin=origin,
                destination=destination,
                operator_slug=operator_slug,
                operator_name=operator_name,
                collected_at=collected_at,
            )
        except CaptchaDetected:
            insert_captcha_alert(self._conn, "redbus", operator_id)
            raise
        except RetryExhausted as exc:
            logger.error(
                "redbus_retries_exhausted",
                origin=origin,
                destination=destination,
                operator_slug=operator_slug,
                last_error=str(exc.last_exception),
            )
            stale_id = self._get_latest_snapshot_id(operator_id, route_id)
            if stale_id is not None:
                set_snapshot_stale(self._conn, "redbus_snapshots", stale_id)
                logger.warning(
                    "redbus_snapshot_marked_stale",
                    operator_slug=operator_slug,
                    origin=origin,
                    destination=destination,
                    snapshot_id=stale_id,
                )
            return None

        # Operator absent on this route
        if fetch_result.get("operator_absent"):
            logger.warning(
                "redbus_operator_absent_on_route",
                operator_slug=operator_slug,
                origin=origin,
                destination=destination,
            )
            upsert_redbus_snapshot(
                conn=self._conn,
                operator_id=operator_id,
                route_id=route_id,
                collected_at=collected_at,
                overall_rating=None,
                review_count=None,
            )
            return {
                "operator_slug": operator_slug,
                "origin": origin,
                "destination": destination,
                "overall_rating": None,
                "review_count": None,
                "reviews_inserted": 0,
                "operator_absent": True,
            }

        overall_rating: float | None = fetch_result.get("overall_rating")
        review_count: int | None = fetch_result.get("review_count")
        reviews: list[dict] = fetch_result.get("reviews", [])

        snapshot_id = upsert_redbus_snapshot(
            conn=self._conn,
            operator_id=operator_id,
            route_id=route_id,
            collected_at=collected_at,
            overall_rating=overall_rating,
            review_count=review_count,
        )

        reviews_inserted = insert_redbus_reviews(
            conn=self._conn,
            snapshot_id=snapshot_id,
            operator_id=operator_id,
            route_id=route_id,
            reviews=reviews,
        )

        logger.info(
            "redbus_route_operator_collected",
            operator_slug=operator_slug,
            origin=origin,
            destination=destination,
            overall_rating=overall_rating,
            review_count=review_count,
            reviews_inserted=reviews_inserted,
            snapshot_id=snapshot_id,
        )

        return {
            "operator_slug": operator_slug,
            "origin": origin,
            "destination": destination,
            "overall_rating": overall_rating,
            "review_count": review_count,
            "reviews_inserted": reviews_inserted,
            "snapshot_id": snapshot_id,
            "operator_absent": False,
        }

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _fetch_with_retry(
        self,
        origin: str,
        destination: str,
        operator_slug: str,
        operator_name: str,
        collected_at: datetime,
    ) -> dict:
        """Wrap the Playwright data fetch in the retry decorator (task 5.5).

        CaptchaDetected is not retried — it propagates immediately to the
        caller so the captcha alert can be recorded and the source paused.
        """

        @with_retry(
            max_retries=5,
            base_delay=2.0,
            max_delay=8.0,
            # Exclude CaptchaDetected so it propagates without retry
            exceptions=(Exception,),
        )
        def _do_fetch() -> dict:
            try:
                return self._fetch_playwright_data(
                    origin=origin,
                    destination=destination,
                    operator_slug=operator_slug,
                    operator_name=operator_name,
                    collected_at=collected_at,
                )
            except CaptchaDetected:
                # Re-raise as a non-retryable sentinel by wrapping; unwrap below
                raise _CaptchaPassthrough()

        try:
            return _do_fetch()
        except _CaptchaPassthrough:
            raise CaptchaDetected()

    def _fetch_playwright_data(
        self,
        origin: str,
        destination: str,
        operator_slug: str,
        operator_name: str,
        collected_at: datetime,
    ) -> dict:
        """Open a headless Chromium browser and scrape the Redbus route page.

        Parameters
        ----------
        origin:
            Origin city name (e.g. "Bangalore").
        destination:
            Destination city name (e.g. "Chennai").
        operator_slug:
            Internal slug used for logging.
        operator_name:
            Display name used to identify the operator on the Redbus page.
        collected_at:
            UTC timestamp to attach to each review dict.

        Returns
        -------
        dict
            ``{"overall_rating": float|None, "review_count": int|None,
               "reviews": list, "operator_absent": bool}``

        Raises
        ------
        CaptchaDetected
            If the browser is redirected to a CAPTCHA challenge page.
        """
        url = (
            f"https://www.redbus.in/bus-tickets/"
            f"{origin.lower()}-to-{destination.lower()}"
        )
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

                    # CAPTCHA detection
                    if "captcha" in page.url.lower() or "captcha" in page.title().lower():
                        raise CaptchaDetected()

                    # Locate operator card using text matching
                    operator_el = page.query_selector(
                        f"text={operator_name}"
                    ) or page.query_selector(
                        f'[class*="travels"][title*="{operator_name}"]'
                    )

                    if operator_el is None:
                        # Try a broader text search within bus-cards
                        cards = page.query_selector_all('[class*="bus-item"], [class*="travels"]')
                        for card in cards:
                            card_text = card.inner_text()
                            if operator_name.lower() in card_text.lower():
                                operator_el = card
                                break

                    if operator_el is None:
                        return {
                            "overall_rating": None,
                            "review_count": None,
                            "reviews": [],
                            "operator_absent": True,
                        }

                    # Extract rating
                    rating_el = operator_el.query_selector(
                        '[class*="rating"], [class*="star"]'
                    )
                    if rating_el:
                        rating_text = rating_el.inner_text().strip()
                        try:
                            overall_rating = float(rating_text.replace(",", "."))
                        except ValueError:
                            logger.warning(
                                "redbus_rating_parse_error",
                                operator_slug=operator_slug,
                                raw_text=rating_text,
                            )

                    # Extract review count
                    count_el = operator_el.query_selector(
                        '[class*="review"], [class*="rating-count"]'
                    )
                    if count_el:
                        count_text = count_el.inner_text().strip()
                        digits = "".join(c for c in count_text if c.isdigit())
                        if digits:
                            try:
                                review_count = int(digits)
                            except ValueError:
                                logger.warning(
                                    "redbus_review_count_parse_error",
                                    operator_slug=operator_slug,
                                    raw_text=count_text,
                                )

                    # Extract reviews (up to MAX_REVIEWS)
                    review_els = operator_el.query_selector_all(
                        '[class*="review-item"], [class*="review-text"]'
                    )
                    if not review_els:
                        # Try page-level review elements
                        review_els = page.query_selector_all(
                            '[class*="review-item"], [class*="review-text"]'
                        )

                    for el in review_els[:MAX_REVIEWS]:
                        try:
                            text_el = (
                                el.query_selector('[class*="review-body"]')
                                or el.query_selector("p")
                                or el.query_selector("span")
                            )
                            review_text = (
                                text_el.inner_text().strip() if text_el else None
                            )

                            star_el = el.query_selector(
                                '[class*="star"], [aria-label]'
                            )
                            star_rating: int | None = None
                            if star_el:
                                aria = star_el.get_attribute("aria-label") or ""
                                digits_found = "".join(
                                    c for c in aria if c.isdigit()
                                )
                                if digits_found:
                                    star_rating = int(digits_found[0])

                            date_el = el.query_selector(
                                '[class*="date"], [class*="time"]'
                            )
                            reviewed_at = (
                                date_el.inner_text().strip() if date_el else None
                            )

                            reviews.append(
                                {
                                    "review_text": review_text,
                                    "star_rating": star_rating,
                                    "reviewed_at": reviewed_at,
                                    "collected_at": collected_at,
                                }
                            )
                        except Exception:
                            continue

                finally:
                    context.close()
                    browser.close()

        except CaptchaDetected:
            raise
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
            "operator_absent": False,
        }

    def _get_latest_snapshot_id(
        self,
        operator_id: int,
        route_id: int,
    ) -> int | None:
        """Return the most recent redbus_snapshots.id for the operator + route."""
        from sqlalchemy import text

        stmt = text(
            """
            SELECT id
            FROM   redbus_snapshots
            WHERE  operator_id = :operator_id
              AND  route_id    = :route_id
            ORDER  BY collected_at DESC
            LIMIT  1
            """
        )
        row = self._conn.execute(
            stmt, {"operator_id": operator_id, "route_id": route_id}
        ).fetchone()
        return int(row[0]) if row else None
