"""Generate daily Play/iOS/Google snapshot history for date-filter demos."""
from __future__ import annotations

import json
import math
import random
from copy import deepcopy
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "dashboard" / "public" / "api-static"
DAYS = 35
TODAY = date(2026, 8, 6)
random.seed(42)


def _jitter(value: float | None, amp: float = 0.08) -> float | None:
    if value is None:
        return None
    return round(max(1.0, min(5.0, value + random.uniform(-amp, amp))), 2)


def _jitter_int(value: int | None, pct: float = 0.03) -> int | None:
    if value is None:
        return None
    delta = max(1, int(abs(value) * pct))
    return max(0, value + random.randint(-delta, delta))


def _walk_day(base: dict, day: date, source: str) -> dict:
    row = deepcopy(base)
    age = (TODAY - day).days
    # Slight drift older days look a bit worse/less volume
    drift = -0.01 * (age % 7)
    rating = base.get("overall_rating")
    if rating is not None:
        row["overall_rating"] = round(max(1.0, min(5.0, float(rating) + drift + random.uniform(-0.05, 0.05))), 2)

    for key in ("review_count", "star_1", "star_2", "star_3", "star_4", "star_5", "downloads_raw"):
        if key in row and row[key] is not None:
            row[key] = _jitter_int(int(row[key]), 0.025)

    if row.get("downloads_raw"):
        raw = row["downloads_raw"]
        if raw >= 1_000_000:
            row["downloads"] = f"{raw // 1_000_000:,}+".replace(",", ",") if False else f"{raw:,}+"
            # Keep store-style labels near original
            row["downloads"] = base.get("downloads") or f"{raw:,}+"

    topics = row.get("play_topics") or {}
    if source == "google_play" and topics:
        row["play_topics"] = {
            k: round(max(1.0, min(5.0, float(v) + drift + random.uniform(-0.08, 0.08))), 2)
            if v is not None else None
            for k, v in topics.items()
        }

    ts = datetime(day.year, day.month, day.day, 10, 0, tzinfo=timezone.utc)
    row["collection_date"] = day.isoformat()
    row["cycle_timestamp"] = ts.isoformat()
    return row


def main() -> None:
    app = json.loads((ROOT / "app-store.json").read_text(encoding="utf-8"))
    google = json.loads((ROOT / "google-reviews.json").read_text(encoding="utf-8"))

    bases_app = { (r["operator_slug"], r["source"]): r for r in app["data"] }
    bases_google = { r["operator_slug"]: r for r in google["data"] }

    daily_app: list[dict] = []
    daily_google: list[dict] = []

    for i in range(DAYS - 1, -1, -1):
        day = TODAY - timedelta(days=i)
        for (slug, source), base in bases_app.items():
            daily_app.append(_walk_day(base, day, source))
        for slug, base in bases_google.items():
            daily_google.append(_walk_day(base, day, "google_reviews"))

    out = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "anchor_date": TODAY.isoformat(),
        "days": DAYS,
        "app_store": daily_app,
        "google_reviews": daily_google,
    }
    path = ROOT / "daily-snapshots.json"
    path.write_text(json.dumps(out), encoding="utf-8")
    print(f"wrote {path.name}: app={len(daily_app)} google={len(daily_google)}")


if __name__ == "__main__":
    main()
