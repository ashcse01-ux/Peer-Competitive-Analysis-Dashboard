"""
On-demand Redbus SRP sync job with progress tracking.

Sync replaces that travel day's rows in srp.db with a fresh scrape.
No fixed schedule — user/API can trigger anytime.
"""

from __future__ import annotations

import threading
import traceback
from copy import deepcopy
from datetime import datetime, timedelta
from typing import Any, Callable
from zoneinfo import ZoneInfo

_LOCK = threading.Lock()
_JOB: dict[str, Any] = {
    "status": "idle",  # idle | running | completed | error
    "percent": 0,
    "phase": "idle",
    "current": 0,
    "total": 0,
    "route_label": "",
    "message": "Ready",
    "travel_date": None,
    "travel_date_iso": None,
    "error": None,
    "started_at": None,
    "finished_at": None,
    "last_scraped_at": None,
}


def get_job_status() -> dict[str, Any]:
    with _LOCK:
        return deepcopy(_JOB)


def _set(**kwargs: Any) -> None:
    with _LOCK:
        _JOB.update(kwargs)


def _default_travel_date_iso() -> str:
    """Tomorrow in Asia/Kolkata (matches scraper default)."""
    now = datetime.now(ZoneInfo("Asia/Kolkata"))
    return (now + timedelta(days=1)).strftime("%Y-%m-%d")


def _iso_to_scraper_date(iso: str) -> str:
    return datetime.strptime(iso, "%Y-%m-%d").strftime("%d-%b-%Y")


def _iso_to_stamp(iso: str) -> str:
    return iso.replace("-", "")


def start_sync_async(*, travel_date_iso: str | None = None) -> dict[str, Any]:
    """Start scrape+replace in a daemon thread. Returns current status."""
    with _LOCK:
        if _JOB["status"] == "running":
            return deepcopy(_JOB)

    iso = travel_date_iso or _default_travel_date_iso()
    try:
        scraper_date = _iso_to_scraper_date(iso)
    except ValueError as exc:
        raise ValueError(f"travel_date must be YYYY-MM-DD: {exc}") from exc

    _set(
        status="running",
        percent=0,
        phase="starting",
        current=0,
        total=0,
        route_label="",
        message="Starting Redbus SRP sync…",
        travel_date=scraper_date,
        travel_date_iso=iso,
        error=None,
        started_at=datetime.now(ZoneInfo("Asia/Kolkata")).isoformat(timespec="seconds"),
        finished_at=None,
        last_scraped_at=None,
    )

    thread = threading.Thread(
        target=_run_job,
        kwargs={"travel_date_iso": iso, "scraper_date": scraper_date},
        daemon=True,
        name="redbus-srp-sync",
    )
    thread.start()
    return get_job_status()


def _run_job(*, travel_date_iso: str, scraper_date: str) -> None:
    from scraper.redbus_scraper import ROUTES_LIST, run_scrape
    from scraper.parse_operators import replace_day_from_html
    from scraper.srp_pipeline import latest_scraped_at

    date_stamp = _iso_to_stamp(travel_date_iso)
    total_routes = max(len(ROUTES_LIST), 1)

    def on_progress(current: int, total: int, route_label: str, phase: str) -> None:
        # Reserve 0–92% for scrape routes, 92–100% for DB replace/parse
        if phase == "scraping":
            pct = int((current / max(total, 1)) * 92)
            msg = f"Scraping {route_label} ({current}/{total})"
        elif phase == "route_done":
            pct = int((current / max(total, 1)) * 92)
            msg = f"Saved {route_label} ({current}/{total})"
        else:
            pct = int(_JOB.get("percent") or 0)
            msg = route_label or phase
        _set(
            percent=min(pct, 92),
            phase=phase,
            current=current,
            total=total,
            route_label=route_label,
            message=msg,
        )

    try:
        _set(total=total_routes, message=f"Scraping {total_routes} routes for {scraper_date}…")
        run_scrape(
            date=scraper_date,
            headed=False,
            force=True,
            run_parse=False,
            progress_callback=on_progress,
        )

        _set(phase="replacing", percent=93, message="Removing previous listings for this travel day…")
        replace_day_from_html(travel_date_iso=travel_date_iso, date_stamp=date_stamp)

        meta = latest_scraped_at()
        _set(
            status="completed",
            percent=100,
            phase="done",
            message="Sync complete — latest scrape is the final SRP for this travel day.",
            finished_at=datetime.now(ZoneInfo("Asia/Kolkata")).isoformat(timespec="seconds"),
            last_scraped_at=meta,
            current=total_routes,
            total=total_routes,
        )
    except Exception as exc:
        _set(
            status="error",
            phase="error",
            message=f"Sync failed: {exc}",
            error=str(exc),
            finished_at=datetime.now(ZoneInfo("Asia/Kolkata")).isoformat(timespec="seconds"),
        )
        traceback.print_exc()
