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

import re
import random
import threading
import time
import urllib.parse
from datetime import datetime, timezone
from typing import Any

from scraper.db import (
    get_operator_id,
    replace_google_reviews,
    set_snapshot_stale,
    upsert_google_snapshot,
)
from scraper.play_topics import histogram_from_reviews
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
    "freshbus": "Fresh Bus Private Limited",
    "neugo": "NueGo Greencell Express bus company",
    "flixbus": "FlixBus India bus company",
    "zingbus": "zingbus transportation service Gurugram",
    "yolobus": "YOLO bus company Nanakramguda Hyderabad",
    "intrcity": "IntrCity SmartBus",
    "leafybus": "LeafyBus LEAFYMOBILITY Private Limited",
}

OPERATOR_SEARCH_URLS: dict[str, str] = {
    "freshbus": "https://www.google.com/search?q=Fresh+Bus+Private+Limited+Reviews&hl=en&gl=in",
    "zingbus": "https://www.google.com/search?q=Zingbus+google+reviews&hl=en&gl=in",
    "flixbus": "https://www.google.com/search?q=FlixBus+India+reviews&hl=en&gl=in",
    "intrcity": "https://www.google.com/search?q=IntrCity+SmartBus+reviews&hl=en&gl=in",
    "neugo": "https://www.google.com/search?q=NueGo+electric+bus+company+reviews&hl=en&gl=in",
    "yolobus": "https://www.google.com/search?q=YOLO+bus+company+Hyderabad+reviews&hl=en&gl=in",
    "leafybus": "https://www.google.com/search?q=LeafyBus+LEAFYMOBILITY+reviews&hl=en&gl=in",
}

OPERATOR_MAPS_URLS: dict[str, str] = {
    "freshbus": "https://www.google.com/maps/search/Fresh+Bus+Private+Limited",
    "zingbus": "https://www.google.com/maps/search/zingbus+Gurugram",
    "flixbus": "https://www.google.com/maps/search/FlixBus+India",
    "intrcity": "https://www.google.com/maps/search/IntrCity+SmartBus",
    "neugo": "https://www.google.com/maps/search/NueGo+bus",
    "yolobus": "https://www.google.com/maps/search/YOLO+bus+Hyderabad",
    "leafybus": "https://www.google.com/maps/search/LeafyBus",
}

_DESKTOP_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)

_RATED_RE = re.compile(r"Rated\s+(\d(?:[.,]\d)?)\s+out of\s+5", re.I)
_RATING_VALUE_RE = re.compile(r'"ratingValue"\s*:\s*"?(\d(?:\.\d)?)"?', re.I)
_REVIEW_COUNT_JSON_RE = re.compile(r'"reviewCount"\s*:\s*"?(\d{2,})"?', re.I)
_GOOGLE_REVIEWS_RE = re.compile(r"([\d,]+)\s+Google reviews", re.I)
_REVIEWS_PAREN_RE = re.compile(r"(\d(?:[.,]\d)?)\s*\(([\d,]+)\s*reviews?\)", re.I)
_STARS_LABEL_RE = re.compile(r"([1-5][.,]\d)\s+stars?", re.I)
_REVIEWS_COUNT_LABEL_RE = re.compile(r"([\d,]+)\s+(?:Google\s+)?reviews", re.I)
_MAPS_NULL_PAIR_RE = re.compile(r"\[null,([1-5]\.\d),(\d{2,})\]")
SLA_SECONDS = 30 * 60  # 30 minutes
MAX_REVIEWS = 50

# Selectors for Knowledge Panel elements
_RATING_SELECTORS = [
    "span.Aq14fc",
    "div.BHMmbe",
    "div.F7nice span",
    "[data-attrid='kc:/collection/knowledge_panels/local_reviewable:star_score'] span",
    "span[aria-hidden='true'].yi40Hd",
]
_REVIEW_COUNT_SELECTOR = "span.hqzQac span"
_REVIEW_COUNT_FALLBACKS = ["span.hqzQac", "a span.Y0A0hc", ".z5jxId"]
_REVIEW_ITEM_SELECTORS = [
    "div.gws-localreviews__google-review",
    "div[data-review-id]",
    "div.jxjCjc",
]

logger = get_logger(__name__)


def parse_google_rating_html(html: str) -> tuple[float | None, int | None]:
    """Pull overall rating + review count from Search/Maps HTML."""
    if not html:
        return None, None
    rating: float | None = None
    count: int | None = None

    rated = _RATED_RE.search(html)
    if rated:
        try:
            rating = float(rated.group(1).replace(",", "."))
        except ValueError:
            rating = None

    if rating is None:
        m = _RATING_VALUE_RE.search(html)
        if m:
            try:
                rating = float(m.group(1))
            except ValueError:
                rating = None

    if rating is None:
        m = _STARS_LABEL_RE.search(html)
        if m:
            try:
                rating = float(m.group(1).replace(",", "."))
            except ValueError:
                rating = None

    if rating is None or count is None:
        m = _MAPS_NULL_PAIR_RE.search(html)
        if m:
            if rating is None:
                try:
                    rating = float(m.group(1))
                except ValueError:
                    pass
            if count is None:
                count = int(m.group(2))

    paren = _REVIEWS_PAREN_RE.search(html)
    if paren:
        if rating is None:
            try:
                rating = float(paren.group(1).replace(",", "."))
            except ValueError:
                pass
        digits = paren.group(2).replace(",", "")
        if digits.isdigit():
            count = int(digits)

    if count is None:
        m = _REVIEW_COUNT_JSON_RE.search(html)
        if m:
            count = int(m.group(1))
    if count is None:
        m = _GOOGLE_REVIEWS_RE.search(html)
        if m:
            digits = m.group(1).replace(",", "")
            if digits.isdigit():
                count = int(digits)
    if count is None:
        m = _REVIEWS_COUNT_LABEL_RE.search(html)
        if m:
            digits = m.group(1).replace(",", "")
            if digits.isdigit() and int(digits) >= 10:
                count = int(digits)

    if rating is not None and not (1.0 <= rating <= 5.0):
        rating = None
    return rating, count


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
        hist = fetch_result.get("histogram") or histogram_from_reviews(reviews)

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

        # Persist snapshot and replace same-day reviews
        snapshot_id = upsert_google_snapshot(
            conn=self._conn,
            operator_id=operator_id,
            collected_at=collected_at,
            overall_rating=overall_rating,
            review_count=review_count,
            star_1=hist.get("star_1"),
            star_2=hist.get("star_2"),
            star_3=hist.get("star_3"),
            star_4=hist.get("star_4"),
            star_5=hist.get("star_5"),
        )

        reviews_inserted = replace_google_reviews(
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

    def _dismiss_consent(self, page: Any) -> None:
        for selector in (
            'button#L2AGLb',
            'button:has-text("Accept all")',
            'button:has-text("I agree")',
            'button:has-text("Accept")',
        ):
            try:
                btn = page.query_selector(selector)
                if btn:
                    btn.click(timeout=1500)
                    page.wait_for_timeout(400)
                    return
            except Exception:
                continue

    def _extract_from_page(self, page: Any, collected_at: datetime) -> dict:
        overall_rating: float | None = None
        review_count: int | None = None
        reviews: list[dict] = []

        try:
            aria_payload = page.evaluate(
                """() => {
                  const labels = [...document.querySelectorAll('[aria-label]')]
                    .map(e => e.getAttribute('aria-label') || '');
                  const rated = labels.find(l => /Rated\\s+\\d/.test(l) || /\\d(?:[.,]\\d)?\\s+stars?/i.test(l)) || '';
                  const count = labels.find(l => /\\d[\\d,]*\\s+(Google\\s+)?reviews/i.test(l)) || '';
                  return { rated, count };
                }"""
            )
            if aria_payload:
                rated_text = aria_payload.get("rated") or ""
                m = _RATED_RE.search(rated_text) or _STARS_LABEL_RE.search(rated_text)
                if m:
                    overall_rating = float(m.group(1).replace(",", "."))
                cm = re.search(r"([\d,]+)", aria_payload.get("count") or "")
                if cm:
                    review_count = int(cm.group(1).replace(",", ""))
        except Exception:
            pass

        html = page.content() or ""
        html_rating, html_count = parse_google_rating_html(html)
        if overall_rating is None:
            overall_rating = html_rating
        if review_count is None:
            review_count = html_count

        if overall_rating is None:
            for selector in _RATING_SELECTORS + ["span.ceNzKf", "div.F7nice", "span.fontDisplayLarge"]:
                el = page.query_selector(selector)
                if not el:
                    continue
                raw = (el.get_attribute("aria-label") or el.inner_text() or "").strip()
                m = re.search(r"(\d(?:[.,]\d)?)", raw)
                if m:
                    try:
                        val = float(m.group(1).replace(",", "."))
                    except ValueError:
                        continue
                    if 1.0 <= val <= 5.0:
                        overall_rating = val
                        break

        if review_count is None:
            for selector in [_REVIEW_COUNT_SELECTOR, *_REVIEW_COUNT_FALLBACKS, "span.F7nice span", "button[jsaction*='review']"]:
                el = page.query_selector(selector)
                if not el:
                    continue
                digits = "".join(c for c in (el.inner_text() or "") if c.isdigit())
                if digits and len(digits) >= 2:
                    review_count = int(digits)
                    break

        review_els = []
        for selector in _REVIEW_ITEM_SELECTORS + ["div.MyEned", "span.wiI7pd", "div.OA1nbd"]:
            review_els = page.query_selector_all(selector)
            if review_els:
                break
        for el in review_els[:MAX_REVIEWS]:
            try:
                text_el = (
                    el.query_selector("span[data-expandable-section]")
                    or el.query_selector("div.Jtu6Td")
                    or el.query_selector("span.review-full-text")
                    or el.query_selector("span.wiI7pd")
                    or el.query_selector("span")
                )
                review_text = text_el.inner_text().strip() if text_el else (el.inner_text() or "").strip()
                star_el = el.query_selector("span[aria-label]")
                star_rating: int | None = None
                if star_el:
                    aria = star_el.get_attribute("aria-label") or ""
                    sm = re.search(r"Rated\s+([1-5])", aria, re.I) or re.search(
                        r"\b([1-5])(?:[.,]\d)?\s+stars?\b", aria, re.I
                    )
                    if sm:
                        star_rating = int(sm.group(1))
                if review_text:
                    reviews.append({
                        "review_text": review_text[:2000],
                        "star_rating": star_rating,
                        "reviewed_at": None,
                        "collected_at": collected_at,
                    })
            except Exception:
                continue

        return {
            "overall_rating": overall_rating,
            "review_count": review_count,
            "reviews": reviews,
        }

    def _open_and_extract(self, page: Any, url: str, collected_at: datetime) -> dict:
        try:
            page.goto(url, wait_until="commit", timeout=60_000)
        except Exception:
            page.goto(url, wait_until="domcontentloaded", timeout=60_000)
        self._dismiss_consent(page)
        try:
            page.wait_for_timeout(4000)
        except Exception:
            pass
        return self._extract_from_page(page, collected_at)

    def _fetch_playwright_data(
        self,
        operator_slug: str,
        operator_name: str,
        collected_at: datetime,
        search_url: str | None = None,
    ) -> dict:
        search_query = urllib.parse.quote(operator_name)
        url = search_url or OPERATOR_SEARCH_URLS.get(operator_slug) or (
            f"https://www.google.com/search?q={search_query}+reviews&hl=en&gl=in"
        )
        maps_url = OPERATOR_MAPS_URLS.get(operator_slug)
        user_agent = _DESKTOP_UA

        log_http_request(logger, method="GET", url=url)
        t0 = time.monotonic()

        overall_rating: float | None = None
        review_count: int | None = None
        reviews: list[dict] = []

        try:
            from playwright.sync_api import sync_playwright
            with sync_playwright() as pw:
                launch_args = ["--disable-blink-features=AutomationControlled"]
                try:
                    browser = pw.chromium.launch(
                        headless=True,
                        channel="chrome",
                        args=launch_args,
                    )
                except Exception:
                    browser = pw.chromium.launch(headless=True, args=launch_args)
                context = browser.new_context(
                    user_agent=user_agent,
                    locale="en-IN",
                    timezone_id="Asia/Kolkata",
                    viewport={"width": 1440, "height": 900},
                    extra_http_headers={"Accept-Language": "en-IN,en;q=0.9"},
                )
                context.add_init_script(
                    "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
                )
                page = context.new_page()
                try:
                    extracted: dict = {
                        "overall_rating": None,
                        "review_count": None,
                        "reviews": [],
                    }
                    if maps_url:
                        log_http_request(logger, method="GET", url=maps_url)
                        extracted = self._open_and_extract(page, maps_url, collected_at)
                    if extracted.get("overall_rating") is None:
                        extracted = self._open_and_extract(page, url, collected_at)
                    overall_rating = extracted.get("overall_rating")
                    review_count = extracted.get("review_count")
                    reviews = extracted.get("reviews") or []
                    if overall_rating is None:
                        logger.warning(
                            "google_panel_parse_miss slug=%s title=%s",
                            operator_slug,
                            page.title(),
                        )
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

        hist = histogram_from_reviews(reviews)
        return {
            "overall_rating": overall_rating,
            "review_count": review_count,
            "histogram": hist,
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
