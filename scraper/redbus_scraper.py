"""
RedBus Selenium Scraper
========================
Scrolls each RedBus route page until "End of list" text appears,
saves the fully-loaded HTML, then fetches Ratings tags for every
card via the browser's own session (so cookies are already present).

Tags are written to a sidecar JSON: <html_filename>.tags.json
  {
    "<routeId>": [{"tagmsg": "Punctuality", "NoOfUsers": 271, ...}, ...]
  }

Usage:
    source peer_dashboard/bin/activate
    python scraper/redbus_scraper.py
    python scraper/redbus_scraper.py --headed
    python scraper/redbus_scraper.py --date 05-Aug-2026
    python scraper/redbus_scraper.py --workers 4
"""

from __future__ import annotations

import argparse
import os
import time
import json
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta
from typing import Callable

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager


# ── Configuration ──────────────────────────────────────────────────────────

CONFIG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config", "redbus_routes.json")

try:
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        config_data = json.load(f)
    CITIES_MAP = config_data["cities"]
    ROUTES_LIST = config_data["routes"]
except Exception as e:
    print(f"Error loading routes config: {e}")
    CITIES_MAP = {}
    ROUTES_LIST = []

TRAVEL_DATE = (datetime.now() + timedelta(days=1)).strftime("%d-%b-%Y")
OUTPUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "redbus_html")

SCROLL_STEP_PX = 600
SCROLL_PAUSE_SEC = 2
MAX_SCROLL_DURATION = 300  # 5 minutes max per page

DEFAULT_WORKERS = 1  # undetected-chromedriver is heavy — run sequentially on servers

# Lock for thread-safe status file writes and console output
_print_lock = threading.Lock()
_status_lock = threading.Lock()


# ── Helpers ────────────────────────────────────────────────────────────────

def tprint(*args, **kwargs) -> None:
    """Thread-safe print."""
    with _print_lock:
        print(*args, **kwargs)


def build_url(from_city: dict, to_city: dict, date: str) -> str:
    from_slug = from_city["name"].lower().replace(" ", "-")
    to_slug = to_city["name"].lower().replace(" ", "-")
    return (
        f"https://www.redbus.in/bus-tickets/{from_slug}-to-{to_slug}"
        f"?fromCityName={from_city['name']}&fromCityId={from_city['id']}"
        f"&srcCountry=IND&fromCityType=CITY"
        f"&toCityName={to_city['name']}&toCityId={to_city['id']}"
        f"&destCountry=India&toCityType=CITY"
        f"&onward={date}&doj={date}&ref=home"
    )


def create_driver(headed: bool = False) -> webdriver.Chrome:
    opts = Options()
    if not headed:
        opts.add_argument("--headless=new")
    opts.add_argument("--no-sandbox")
    opts.add_argument("--disable-dev-shm-usage")
    opts.add_argument("--disable-gpu")
    opts.add_argument("--disable-blink-features=AutomationControlled")
    opts.add_argument("--window-size=1920,1080")
    opts.add_argument(
        "--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
    )
    opts.add_experimental_option("excludeSwitches", ["enable-automation"])
    opts.add_experimental_option("useAutomationExtension", False)
    opts.page_load_strategy = "normal"

    service = Service(ChromeDriverManager().install())
    driver = webdriver.Chrome(service=service, options=opts)
    driver.set_page_load_timeout(60)

    driver.execute_cdp_cmd(
        "Page.addScriptToEvaluateOnNewDocument",
        {"source": "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"},
    )
    return driver


def has_end_of_list(driver: webdriver.Chrome) -> bool:
    """Check if 'End of list' text is visible anywhere on the page."""
    try:
        result = driver.execute_script("""
            var body = document.body ? document.body.innerText : '';
            return body.includes('End of list');
        """)
        return bool(result)
    except Exception:
        return False


def scroll_until_end_of_list(driver: webdriver.Chrome) -> None:
    """Scroll down in small steps until 'End of list' text appears."""
    start_time = time.time()
    scroll_pos = 0
    scroll_num = 0

    while True:
        elapsed = time.time() - start_time
        if elapsed > MAX_SCROLL_DURATION:
            tprint(f"      ⏱  Timeout after {elapsed:.0f}s — saving whatever loaded")
            break

        if has_end_of_list(driver):
            tprint(f"      ✅ 'End of list' found after {scroll_num} scrolls ({elapsed:.0f}s)")
            driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
            time.sleep(1)
            return

        scroll_pos += SCROLL_STEP_PX
        driver.execute_script(f"window.scrollTo({{top: {scroll_pos}, behavior: 'smooth'}});")
        scroll_num += 1
        time.sleep(SCROLL_PAUSE_SEC)

        page_height = driver.execute_script("return document.body.scrollHeight")
        current_pos = driver.execute_script("return window.pageYOffset + window.innerHeight")

        if current_pos >= page_height:
            driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
            time.sleep(SCROLL_PAUSE_SEC * 2)

            if has_end_of_list(driver):
                tprint(f"      ✅ 'End of list' found after {scroll_num} scrolls ({elapsed:.0f}s)")
                driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
                time.sleep(1)
                return

            new_height = driver.execute_script("return document.body.scrollHeight")
            if new_height > page_height:
                scroll_pos = new_height - 1080
                tprint(f"      ↳ Scroll #{scroll_num}: new content loaded, height → {new_height}px")
            else:
                scroll_pos = page_height
                tprint(f"      ↳ Scroll #{scroll_num}: at bottom ({page_height}px), waiting for more...")

        elif scroll_num % 5 == 0:
            tprint(f"      ↳ Scroll #{scroll_num}: pos={current_pos}/{page_height}px ({elapsed:.0f}s)")


def save_html(driver: webdriver.Chrome, filepath: str) -> bool:
    """Save page HTML. Returns False if the page looks blocked (< 10 KB)."""
    html = driver.page_source
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(html)
    size_kb = os.path.getsize(filepath) / 1024
    if size_kb < 10:
        tprint(f"      ⚠ BLOCKED: {os.path.basename(filepath)} is only {size_kb:.1f} KB — Akamai likely blocked this request")
        return False
    tprint(f"      💾 Saved: {os.path.basename(filepath)} ({size_kb:.1f} KB)")
    return True


def fetch_route_tags(driver: webdriver.Chrome, filepath: str) -> dict[str, list]:
    """
    Collect all card route_ids from the current SRP page, then call
    https://www.redbus.in/rpw/api/ratings?routeId=<id> for each one
    using the browser's own fetch() — so session cookies are already
    present and the API responds correctly.

    Results are written to a sidecar file: <filepath>.tags.json
    Returns the tags dict {routeId: [tag, ...]} for immediate use.
    """
    from bs4 import BeautifulSoup

    # Collect route_ids from the saved HTML (not from the live DOM, so
    # we work with exactly what was saved).
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            soup = BeautifulSoup(f.read(), "html.parser")
        cards = soup.find_all(
            lambda tag: tag.name in ["li", "div"]
            and any("tupleWrapper" in c for c in tag.get("class", []))
        )
        route_ids = [
            str(card.get("id") or "").strip()
            for card in cards
            if str(card.get("id") or "").strip()
        ]
        # deduplicate, preserve order
        seen: set[str] = set()
        unique_ids: list[str] = []
        for rid in route_ids:
            if rid not in seen:
                seen.add(rid)
                unique_ids.append(rid)
    except Exception as e:
        tprint(f"      ⚠ Could not read route_ids from HTML: {e}")
        return {}

    if not unique_ids:
        tprint("      ⚠ No route_ids found in HTML — skipping tags fetch")
        return {}

    tprint(f"      🏷  Fetching tags for {len(unique_ids)} route IDs via browser...")

    # Use browser fetch() in a single JS call for all IDs to minimise
    # round-trips.  We batch in groups of 20 to avoid a single huge
    # Promise.all that might time out in Selenium.
    tags_map: dict[str, list] = {}
    BATCH = 20

    for batch_start in range(0, len(unique_ids), BATCH):
        batch = unique_ids[batch_start: batch_start + BATCH]
        ids_json = json.dumps(batch)

        js = f"""
        const ids = {ids_json};
        const results = {{}};
        const fetches = ids.map(id =>
            fetch('https://www.redbus.in/rpw/api/ratings?routeId=' + id, {{
                headers: {{ Accept: 'application/json' }}
            }})
            .then(r => r.ok ? r.json() : null)
            .then(data => {{
                if (data && Array.isArray(data.Tags)) {{
                    results[id] = data.Tags.filter(t => t.tagmsg);
                }} else {{
                    results[id] = [];
                }}
            }})
            .catch(() => {{ results[id] = []; }})
        );
        await Promise.all(fetches);
        return results;
        """
        try:
            batch_result = driver.execute_script(js)
            if isinstance(batch_result, dict):
                for rid, tag_list in batch_result.items():
                    if tag_list:
                        tags_map[rid] = tag_list
        except Exception as e:
            tprint(f"      ⚠ JS fetch batch failed: {e}")

    # Write sidecar JSON
    sidecar_path = filepath + ".tags.json"
    try:
        with open(sidecar_path, "w", encoding="utf-8") as f:
            json.dump(tags_map, f, ensure_ascii=False, indent=2)
        ok_count = sum(1 for v in tags_map.values() if v)
        tprint(f"      🏷  Tags saved: {ok_count}/{len(unique_ids)} route IDs had tags → {os.path.basename(sidecar_path)}")
    except Exception as e:
        tprint(f"      ⚠ Could not write sidecar tags file: {e}")

    return tags_map


# ── Per-route worker ────────────────────────────────────────────────────────

def _scrape_route(
    *,
    route: tuple[str, str],
    travel_date: str,
    date_stamp: str,
    headed: bool,
    force: bool,
    index: int,
    total: int,
    status_file: str,
    progress_callback: Callable[..., None] | None,
) -> str:
    """
    Scrape a single route in its own Chrome driver instance.
    Returns a status string for logging.
    """
    origin_name, dest_name = route
    route_label = f"{origin_name} → {dest_name}"

    origin_id = CITIES_MAP.get(origin_name)
    dest_id = CITIES_MAP.get(dest_name)

    if not origin_id or not dest_id:
        tprint(f"  [{index}/{total}] Skipping {route_label}: Missing city ID in config")
        if progress_callback:
            progress_callback(index, total, route_label, "route_done")
        return "skipped"

    from_city = {"name": origin_name, "id": origin_id}
    to_city = {"name": dest_name, "id": dest_id}

    url = build_url(from_city, to_city, travel_date)
    filename = f"{origin_name.lower()}_to_{dest_name.lower()}_{date_stamp}.html"
    filepath = os.path.join(OUTPUT_DIR, filename)

    tprint(f"\n{'─' * 60}")
    tprint(f"  [{index}/{total}] {route_label}")
    tprint(f"{'─' * 60}")

    def _write_status(step_msg: str) -> None:
        pct = int(round((index / total) * 100)) if total else 0
        payload = {
            "status": "running",
            "step": "scraping",
            "completed_routes": index,
            "total_routes": total,
            "current_route": route_label,
            "progress_pct": pct,
            "logs": [f"[{index}/{total}] {step_msg}: {route_label}"],
            "updated_at": datetime.now().isoformat(),
        }
        with _status_lock:
            try:
                with open(status_file, "w", encoding="utf-8") as sf:
                    json.dump(payload, sf, indent=2)
            except Exception:
                pass

    _write_status("Scraping route")
    if progress_callback:
        progress_callback(index - 1, total, route_label, "scraping")

    # Skip if already scraped (both HTML and sidecar tags present)
    sidecar_path = filepath + ".tags.json"
    if (
        not force
        and os.path.exists(filepath)
        and os.path.getsize(filepath) > 0
        and os.path.exists(sidecar_path)
        and os.path.getsize(sidecar_path) > 2
    ):
        tprint(f"      Skip: HTML + tags already exist for {filename}")
        _write_status("Route finished (cached)")
        if progress_callback:
            progress_callback(index, total, route_label, "route_done")
        return "cached"

    driver = create_driver(headed=headed)
    try:
        try:
            driver.get(url)
        except Exception as e:
            tprint(f"      ⚠ Nav timeout: {type(e).__name__} (page may still work)")

        tprint(f"      Waiting 10s for page to render...")
        time.sleep(10)

        tprint(f"      Scrolling until 'End of list' appears...")
        scroll_until_end_of_list(driver)

        save_html(driver, filepath)

    finally:
        driver.quit()

    _write_status("Route finished")
    if progress_callback:
        progress_callback(index, total, route_label, "route_done")

    return "ok"


# ── Main entry point ────────────────────────────────────────────────────────

def run_scrape(
    *,
    date: str | None = None,
    headed: bool = False,
    force: bool = False,
    run_parse: bool = True,
    routes_filter: list[tuple[str, str]] | None = None,
    progress_callback: Callable[..., None] | None = None,
    workers: int = DEFAULT_WORKERS,
) -> None:
    """Programmatic scrape entry — runs routes in parallel across N Chrome workers."""
    travel_date = date or TRAVEL_DATE
    try:
        travel_date_obj = datetime.strptime(travel_date, "%d-%b-%Y")
        date_stamp = travel_date_obj.strftime("%Y%m%d")
    except ValueError:
        print(f"Error: date '{travel_date}' must be in format DD-Mon-YYYY (e.g. 05-Aug-2026)")
        return

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    active_routes = ROUTES_LIST
    if routes_filter:
        norm_filter = {(r[0].lower(), r[1].lower()) for r in routes_filter}
        active_routes = [r for r in ROUTES_LIST if (r[0].lower(), r[1].lower()) in norm_filter]

    total = len(active_routes)
    effective_workers = min(workers, total) if total else 1

    print("=" * 60)
    print("  RedBus Scraper (parallel)")
    print(f"  Travel Date : {travel_date} (stamp: {date_stamp})")
    print(f"  Routes      : {total}")
    print(f"  Workers     : {effective_workers}")
    print(f"  Mode        : {'Headed' if headed else 'Headless'}")
    print(f"  Force       : {force}")
    print(f"  Output      : {OUTPUT_DIR}")
    print("=" * 60)

    if not active_routes:
        print("No routes configuration found. Exiting.")
        return

    status_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "scraper_status.json")

    # Submit all routes to thread pool; each worker owns its own Chrome driver
    results: dict[int, str] = {}
    with ThreadPoolExecutor(max_workers=effective_workers) as pool:
        future_to_index = {
            pool.submit(
                _scrape_route,
                route=route,
                travel_date=travel_date,
                date_stamp=date_stamp,
                headed=headed,
                force=force,
                index=i,
                total=total,
                status_file=status_file,
                progress_callback=progress_callback,
            ): i
            for i, route in enumerate(active_routes, 1)
        }

        for future in as_completed(future_to_index):
            idx = future_to_index[future]
            try:
                results[idx] = future.result()
            except Exception as exc:
                origin, dest = active_routes[idx - 1]
                tprint(f"  ⚠ Route [{idx}] {origin} → {dest} raised an exception: {exc}")
                results[idx] = "error"

    ok = sum(1 for v in results.values() if v == "ok")
    cached = sum(1 for v in results.values() if v == "cached")
    errors = sum(1 for v in results.values() if v == "error")
    print("\n" + "=" * 60)
    print(f"  Scraping complete  ok={ok}  cached={cached}  errors={errors}")
    print(f"  Files in: {OUTPUT_DIR}")
    print("=" * 60)

    if not run_parse:
        return

    print("\n" + "=" * 60)
    print("  Running HTML parser / DB update...")
    print("=" * 60)
    try:
        try:
            from scraper.parse_operators import main as parse_main
        except ImportError:
            from parse_operators import main as parse_main
        parse_main()
    except Exception as e:
        print(f"  ⚠ Failed to run parse_operators: {e}")


def main() -> None:
    parser = argparse.ArgumentParser(description="RedBus Scraper")
    parser.add_argument("--headed", action="store_true",
                        help="Run with visible browser window")
    parser.add_argument("--date", type=str, default=TRAVEL_DATE,
                        help=f"Travel date DD-Mon-YYYY (default: {TRAVEL_DATE})")
    parser.add_argument("--force", action="store_true",
                        help="Force scrape even if output file already exists")
    parser.add_argument("--workers", type=int, default=DEFAULT_WORKERS,
                        help=f"Number of parallel Chrome workers (default: {DEFAULT_WORKERS})")
    args = parser.parse_args()
    run_scrape(date=args.date, headed=args.headed, force=args.force,
               run_parse=True, workers=args.workers)


if __name__ == "__main__":
    main()
