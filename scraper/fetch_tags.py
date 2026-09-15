"""
fetch_tags.py
=============
Fetch Punctuality / Driving / Cleanliness tags from the Redbus ratings API
and save them into srp.db matched by route_id.

Instead of using requests (blocked by Akamai on VPS), calls the API from
INSIDE the Selenium browser using driver.execute_script(fetch(...)).
The browser's own session cookies are valid, so Akamai doesn't block.

Refreshes the browser page every REFRESH_EVERY IDs to keep session alive.

Usage:
    source peer_dashboard/bin/activate
    python scraper/fetch_tags.py
    python scraper/fetch_tags.py --resume    # skip already-tagged IDs
"""
from __future__ import annotations

import argparse
import json
import os
import sqlite3
import sys
import time

DB_FILE    = os.path.join(os.path.dirname(os.path.abspath(__file__)), "srp.db")
WARMUP_URL = "https://www.redbus.in/bus-tickets/bangalore-to-chennai"

BATCH_SIZE    = 20    # IDs per Promise.all() call
REFRESH_EVERY = 60    # reload browser page every N IDs to keep session alive
PAGE_WAIT     = 12    # seconds to wait after loading SRP page


# ── DB helpers ───────────────────────────────────────────────────────────────

def get_pending_ids(resume: bool) -> list[tuple[str, str, str]]:
    """Returns list of (route_id, route, operator)."""
    conn = sqlite3.connect(DB_FILE)
    if resume:
        rows = conn.execute(
            "SELECT DISTINCT route_id, route, operator FROM bus_listings "
            "WHERE route_id IS NOT NULL AND route_id != '' "
            "AND (tags IS NULL OR tags = '' OR tags = '[]') "
            "ORDER BY route, operator"
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT DISTINCT route_id, route, operator FROM bus_listings "
            "WHERE route_id IS NOT NULL AND route_id != '' "
            "ORDER BY route, operator"
        ).fetchall()
    conn.close()
    return [(r[0], r[1], r[2]) for r in rows]


def save_tags(tags_map: dict[str, list]) -> int:
    if not tags_map:
        return 0
    conn = sqlite3.connect(DB_FILE, timeout=30.0)
    cur  = conn.cursor()
    updated = 0
    for rid, tags in tags_map.items():
        cur.execute(
            "UPDATE bus_listings SET tags = ? WHERE route_id = ?",
            (json.dumps(tags) if tags else None, rid),
        )
        updated += cur.rowcount
    conn.commit()
    conn.close()
    return updated


# ── Session management ───────────────────────────────────────────────────────

def load_page(driver, url: str, wait: int = PAGE_WAIT) -> bool:
    """Load the SRP page and wait for it to render. Returns True if real content loaded."""
    print(f"  🌐 Loading session page...", flush=True)
    driver.get(url)
    time.sleep(wait)
    height = driver.execute_script("return document.body.scrollHeight")
    print(f"  Page height: {height}px", flush=True)
    return height > 2000


# ── Fetch via browser ─────────────────────────────────────────────────────────

def fetch_batch_in_browser(driver, batch: list[str]) -> dict[str, list]:
    """
    Call /rpw/api/ratings?routeId=X for each ID in batch using
    the browser's own fetch() — cookies are automatically valid.
    Returns { routeId: [tag, ...] }
    """
    ids_json = json.dumps(batch)
    js = f"""
    const ids = {ids_json};
    const out = {{}};
    const fetches = ids.map(id =>
        fetch('https://www.redbus.in/rpw/api/ratings?routeId=' + id, {{
            headers: {{ Accept: 'application/json' }}
        }})
        .then(r => r.ok ? r.json() : null)
        .then(data => {{
            if (data && Array.isArray(data.Tags))
                out[id] = data.Tags.filter(t => t.tagmsg && t.NoOfUsers > 0);
            else
                out[id] = [];
        }})
        .catch(() => {{ out[id] = []; }})
    );
    await Promise.all(fetches);
    return out;
    """
    try:
        result = driver.execute_script(js)
        return result if isinstance(result, dict) else {}
    except Exception as e:
        print(f"  ⚠ JS error: {e}", flush=True)
        return {}


def batch_has_any_tags(result: dict) -> bool:
    return any(v for v in result.values())


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from scraper.redbus_scraper import create_driver

    parser = argparse.ArgumentParser()
    parser.add_argument("--resume", action="store_true",
                        help="Skip route_ids that already have tags in DB")
    args = parser.parse_args()

    pending = get_pending_ids(resume=args.resume)
    total   = len(pending)
    # Extract just IDs for batching, keep full info for display
    pending_ids   = [p[0] for p in pending]
    pending_info  = {p[0]: (p[1], p[2]) for p in pending}  # route_id → (route, operator)

    print("=" * 55)
    print("  fetch_tags.py — Redbus ratings backfill")
    print(f"  Pending IDs    : {total}")
    print(f"  Batch size     : {BATCH_SIZE}")
    print(f"  Page refresh   : every {REFRESH_EVERY} IDs")
    print(f"  Est. time      : ~{int(total / BATCH_SIZE * 1.5 / 60) + 1} min")
    print("=" * 55)

    if total == 0:
        print("Nothing to do.")
        return

    print("\nLaunching browser...")
    driver = create_driver(headed=False)

    try:
        ok = load_page(driver, WARMUP_URL)
        if not ok:
            print("✗ Page blocked — Akamai is blocking this IP.")
            print("  Run this script on a machine with a residential IP.")
            return

        tags_map: dict[str, list] = {}
        got_tags = empty = 0
        ids_since_refresh = 0
        consecutive_empty_batches = 0

        for batch_start in range(0, total, BATCH_SIZE):
            batch = pending_ids[batch_start: batch_start + BATCH_SIZE]

            # Show which route/operator batch is targeting
            sample = pending_info.get(batch[0], ("?", "?"))
            print(f"  → [{batch_start+1}-{min(batch_start+BATCH_SIZE, total)}/{total}]  "
                  f"{sample[0]} | {sample[1][:30]}  (id: {batch[0]})", flush=True)

            # Proactive page refresh to keep session alive
            if ids_since_refresh >= REFRESH_EVERY:
                print(f"  ⟳ Refreshing session at [{batch_start}/{total}]...", flush=True)
                load_page(driver, WARMUP_URL, wait=10)
                ids_since_refresh = 0
                consecutive_empty_batches = 0

            result = fetch_batch_in_browser(driver, batch)
            if batch_has_any_tags(result):
                consecutive_empty_batches = 0
            else:
                consecutive_empty_batches += 1
                if consecutive_empty_batches >= 3:
                    print(f"  ⟳ Session died — forcing page reload...", flush=True)
                    load_page(driver, WARMUP_URL, wait=12)
                    ids_since_refresh = 0
                    consecutive_empty_batches = 0
                    # Retry the same batch
                    result = fetch_batch_in_browser(driver, batch)

            # Process results
            for rid, raw_tags in result.items():
                route, operator = pending_info.get(rid, ("?", "?"))
                if raw_tags:
                    tags_map[rid] = [
                        {
                            "tagmsg":    t.get("tagmsg"),
                            "NoOfUsers": t.get("NoOfUsers", 0),
                            "noOfUsers": t.get("NoOfUsers", 0),
                            "count":     t.get("NoOfUsers", 0),
                            "tagId":     t.get("tagId", ""),
                        }
                        for t in raw_tags if t.get("tagmsg")
                    ]
                    got_tags += 1
                    tag_names = [f"{t.get('tagmsg')}={t.get('NoOfUsers')}" for t in raw_tags[:4]]
                    print(f"    ✓ {rid}  {operator[:25]:<25}  {route}  → {tag_names}", flush=True)
                else:
                    empty += 1

            ids_since_refresh += len(batch)
            done = min(batch_start + BATCH_SIZE, total)

            # Commit every ~100 IDs
            if len(tags_map) + empty >= 100:
                rows = save_tags(tags_map)
                print(
                    f"\n  ── CHECKPOINT [{done:>5}/{total}]  "
                    f"got_tags={got_tags}  no_reviews={empty}  saved={rows} ──\n",
                    flush=True,
                )
                tags_map = {}

        # Final commit
        if tags_map:
            save_tags(tags_map)

    finally:
        driver.quit()

    print(f"\n{'=' * 55}")
    print(f"  Total IDs   : {total}")
    print(f"  Got tags    : {got_tags}")
    print(f"  No reviews  : {empty}")
    print(f"{'=' * 55}")
    print("\nDone. Tags saved to srp.db.")


if __name__ == "__main__":
    main()
