"""
scraper/collectors/redbus.py

RedbusCollector — fetches route-level ratings and up to 100 recent reviews
for each operator across configured route directions via Playwright headless Chromium.

Responsibilities (tasks 5.1 – 5.6):
  5.1  RedbusCollector class skeleton with __init__ / collect_all /
       collect_route_operator.
  5.2  Iterate all route directions × 6 operators; collect route rating,
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
import json
import os
from datetime import date, datetime, timezone
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
from scraper.redbus_routes import ROUTES

__all__ = [
    "CaptchaDetected",
    "RedbusCollector",
        "ROUTES",
]

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------



def load_route_operators() -> dict[str, list[str]]:
    config_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "config", "route_operators.json")
    if not os.path.exists(config_path):
        return {}
    with open(config_path, "r") as f:
        return json.load(f)

def make_slug(name: str) -> str:
    import re
    slug = re.sub(r'[^a-zA-Z0-9]', '_', name).lower()
    return re.sub(r'_+', '_', slug).strip('_')

ROUTE_OPERATORS = load_route_operators()

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


    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def collect_all(self) -> dict:
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
            routes=len(ROUTES),
            sla_minutes=SLA_SECONDS // 60,
        )

        try:
            first = True
            for origin, destination in ROUTES:
                if sla_exceeded.is_set():
                    break
                
                route_key = f"{origin}|{destination}"
                target_operators = ROUTE_OPERATORS.get(route_key, [])
                if not target_operators:
                    continue

                if not first:
                    time.sleep(random.uniform(2, 8))
                first = False

                total += 1
                try:
                    results = self.collect_route(origin, destination, target_operators)
                    if results is None:
                        stale += 1
                    else:
                        success += 1
                except CaptchaDetected:
                    logger.warning("redbus_captcha_pausing_source", origin=origin, destination=destination)
                    break
        finally:
            timer.cancel()

        logger.info("redbus_collection_finished", total=total, success=success, stale=stale)
        return {"total": total, "success": success, "stale": stale}

    def collect_route(self, origin: str, destination: str, target_operators: list[str]) -> list[dict] | None:
        collected_at = datetime.now(tz=timezone.utc)
        
        route_id: int | None = get_route_id(self._conn, origin, destination)
        if route_id is None:
            return None

        # Resolve operator IDs for targets
        op_map = {}
        for op_name in target_operators:
            slug = make_slug(op_name)
            op_id = get_operator_id(self._conn, slug)
            if op_id is not None:
                op_map[slug] = {"name": op_name, "id": op_id}

        if not op_map:
            return []

        try:
            fetch_results = self._fetch_with_retry(origin, destination, op_map, collected_at)
        except CaptchaDetected:
            # Alert on the first operator ID arbitrarily for the captcha alert, or None
            first_op_id = next(iter(op_map.values()))["id"] if op_map else None
            insert_captcha_alert(self._conn, "redbus", first_op_id)
            raise
        except RetryExhausted as exc:
            for slug, info in op_map.items():
                stale_id = self._get_latest_snapshot_id(info["id"], route_id)
                if stale_id:
                    set_snapshot_stale(self._conn, "redbus_snapshots", stale_id)
            return None

        final_results = []
        for slug, info in op_map.items():
            result = fetch_results.get(slug)
            if not result or result.get("operator_absent"):
                upsert_redbus_snapshot(
                    conn=self._conn, operator_id=info["id"], route_id=route_id,
                    collected_at=collected_at, overall_rating=None, review_count=None
                )
                continue
                
            snapshot_id = upsert_redbus_snapshot(
                conn=self._conn, operator_id=info["id"], route_id=route_id,
                collected_at=collected_at, overall_rating=result["overall_rating"], review_count=result["review_count"]
            )
            insert_redbus_reviews(
                conn=self._conn, snapshot_id=snapshot_id, operator_id=info["id"],
                route_id=route_id, reviews=result["reviews"]
            )
            final_results.append(result)

        return final_results

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _fetch_with_retry(
        self, origin: str, destination: str, op_map: dict, collected_at: datetime, travel_date: date | None = None
    ) -> dict:
        @with_retry(max_retries=5, base_delay=2.0, max_delay=8.0, exceptions=(Exception,))
        def _do_fetch() -> dict:
            try:
                return self._fetch_playwright_data(origin, destination, op_map, collected_at, travel_date)
            except CaptchaDetected:
                raise _CaptchaPassthrough()
        try:
            return _do_fetch()
        except _CaptchaPassthrough:
            raise CaptchaDetected()

    def _fetch_playwright_data(
        self, origin: str, destination: str, op_map: dict, collected_at: datetime, travel_date: date | None = None
    ) -> dict:
        url = f"https://www.redbus.in/bus-tickets/{origin.lower()}-to-{destination.lower()}"
        if travel_date is not None:
            doj = travel_date.strftime("%d-%b-%Y")
            url = f"{url}?onward={doj}&doj={doj}&ref=home"
            
        user_agent = get_random_user_agent()
        log_http_request(logger, method="GET", url=url)
        t0 = time.monotonic()
        results = {slug: {"operator_absent": True} for slug in op_map}

        try:
            from playwright.sync_api import sync_playwright
            with sync_playwright() as pw:
                browser = pw.chromium.launch(headless=True)
                context = browser.new_context(user_agent=user_agent)
                page = context.new_page()
                try:
                    page.goto(url, wait_until="domcontentloaded", timeout=30_000)
                    if "captcha" in page.url.lower() or "captcha" in page.title().lower():
                        raise CaptchaDetected()

                    cards = page.query_selector_all('[class*="bus-item"], [class*="travels"]')
                    
                    # We will match cards to operators. Once matched, we don't need to match again.
                    matched_slugs = set()
                    
                    for card in cards:
                        if len(matched_slugs) == len(op_map):
                            break # Found all targeted operators
                            
                        card_text = card.inner_text().lower()
                        
                        # Find which operator this card belongs to
                        matched_slug = None
                        for slug, info in op_map.items():
                            if slug in matched_slugs:
                                continue
                            if info["name"].lower() in card_text:
                                matched_slug = slug
                                break
                                
                        if not matched_slug:
                            continue
                            
                        matched_slugs.add(matched_slug)
                        
                        overall_rating, review_count = None, None
                        rating_el = card.query_selector('[class*="rating"], [class*="star"]')
                        if rating_el:
                            try:
                                overall_rating = float(rating_el.inner_text().strip().replace(",", "."))
                            except: pass
                            
                        count_el = card.query_selector('[class*="review"], [class*="rating-count"]')
                        if count_el:
                            digits = "".join(c for c in count_el.inner_text().strip() if c.isdigit())
                            if digits:
                                review_count = int(digits)
                                
                        reviews = []
                        review_els = card.query_selector_all('[class*="review-item"], [class*="review-text"]')
                        for el in review_els[:MAX_REVIEWS]:
                            try:
                                text_el = el.query_selector('[class*="review-body"]') or el.query_selector("p")
                                review_text = text_el.inner_text().strip() if text_el else None
                                star_el = el.query_selector('[class*="star"], [aria-label]')
                                star_rating = None
                                if star_el:
                                    aria = star_el.get_attribute("aria-label") or ""
                                    digits_found = "".join(c for c in aria if c.isdigit())
                                    if digits_found:
                                        star_rating = int(digits_found[0])
                                reviews.append({
                                    "review_text": review_text, "star_rating": star_rating,
                                    "reviewed_at": None, "collected_at": collected_at
                                })
                            except: pass
                            
                        results[matched_slug] = {
                            "operator_absent": False,
                            "overall_rating": overall_rating,
                            "review_count": review_count,
                            "reviews": reviews
                        }
                finally:
                    context.close()
                    browser.close()
        except CaptchaDetected:
            raise
        except Exception as exc:
            log_http_error(logger, method="GET", url=url, error=str(exc), attempt=1)
            raise

        elapsed_ms = (time.monotonic() - t0) * 1000
        log_http_response(logger, method="GET", url=url, status_code=200, elapsed_ms=round(elapsed_ms, 2))
        return results

    def _get_latest_snapshot_id(self, operator_id: int, route_id: int) -> int | None:

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
