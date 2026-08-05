"""
RedBus Selenium Scraper
========================
Scrolls each RedBus route page until "End of list" text appears,
then saves the fully-loaded HTML.

Usage:
    source peer_dashboard/bin/activate
    python scraper/redbus_scraper.py
    python scraper/redbus_scraper.py --headed
    python scraper/redbus_scraper.py --date 05-Aug-2026
"""

from __future__ import annotations

import argparse
import os
import time
import json
from datetime import datetime, timedelta

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


# ── Helpers ────────────────────────────────────────────────────────────────

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
            print(f"      ⏱  Timeout after {elapsed:.0f}s — saving whatever loaded")
            break

        # Check for "End of list"
        if has_end_of_list(driver):
            print(f"      ✅ 'End of list' found after {scroll_num} scrolls ({elapsed:.0f}s)")
            # Scroll to very bottom one more time to ensure everything is in DOM
            driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
            time.sleep(1)
            return

        # Scroll down by one step
        scroll_pos += SCROLL_STEP_PX
        driver.execute_script(f"window.scrollTo({{top: {scroll_pos}, behavior: 'smooth'}});")
        scroll_num += 1
        time.sleep(SCROLL_PAUSE_SEC)

        # If we've scrolled past page height, jump to bottom and wait for more content
        page_height = driver.execute_script("return document.body.scrollHeight")
        current_pos = driver.execute_script("return window.pageYOffset + window.innerHeight")

        if current_pos >= page_height:
            # We're at the bottom but no "End of list" yet — wait a bit longer for content
            driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
            time.sleep(SCROLL_PAUSE_SEC * 2)

            # Check again after waiting
            if has_end_of_list(driver):
                print(f"      ✅ 'End of list' found after {scroll_num} scrolls ({elapsed:.0f}s)")
                driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
                time.sleep(1)
                return

            # Page might have grown — update scroll_pos to new height and keep going
            new_height = driver.execute_script("return document.body.scrollHeight")
            if new_height > page_height:
                scroll_pos = new_height - 1080  # back up a bit from new bottom
                print(f"      ↳ Scroll #{scroll_num}: new content loaded, height → {new_height}px")
            else:
                # Height didn't change, scroll a bit more past bottom just in case
                scroll_pos = page_height
                print(f"      ↳ Scroll #{scroll_num}: at bottom ({page_height}px), waiting for more...")

        elif scroll_num % 5 == 0:
            print(f"      ↳ Scroll #{scroll_num}: pos={current_pos}/{page_height}px ({elapsed:.0f}s)")


def save_html(driver: webdriver.Chrome, filepath: str) -> None:
    html = driver.page_source
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(html)
    size_kb = os.path.getsize(filepath) / 1024
    print(f"      💾 Saved: {os.path.basename(filepath)} ({size_kb:.1f} KB)")


# ── Main ───────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="RedBus Scraper")
    parser.add_argument("--headed", action="store_true",
                        help="Run with visible browser window")
    parser.add_argument("--date", type=str, default=TRAVEL_DATE,
                        help=f"Travel date DD-Mon-YYYY (default: {TRAVEL_DATE})")
    parser.add_argument("--force", action="store_true",
                        help="Force scrape even if output file already exists")
    args = parser.parse_args()

    # Parse and format the date for the filename and logging
    try:
        travel_date_obj = datetime.strptime(args.date, "%d-%b-%Y")
        date_stamp = travel_date_obj.strftime("%Y%m%d")
    except ValueError:
        print(f"Error: date '{args.date}' must be in format DD-Mon-YYYY (e.g. 05-Aug-2026)")
        return

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    print("=" * 60)
    print("  RedBus Scraper")
    print(f"  Travel Date : {args.date} (stamp: {date_stamp})")
    print(f"  Routes      : {len(ROUTES_LIST)}")
    print(f"  Mode        : {'Headed' if args.headed else 'Headless'}")
    print(f"  Stop signal : 'End of list' text")
    print(f"  Output      : {OUTPUT_DIR}")
    print("=" * 60)

    if not ROUTES_LIST:
        print("No routes configuration found. Exiting.")
        return

    driver = create_driver(headed=args.headed)

    try:
        for i, route in enumerate(ROUTES_LIST, 1):
            origin_name, dest_name = route
            
            origin_id = CITIES_MAP.get(origin_name)
            dest_id = CITIES_MAP.get(dest_name)
            
            if not origin_id or not dest_id:
                print(f"Skipping route {origin_name} → {dest_name}: Missing city ID in config")
                continue

            from_city = {"name": origin_name, "id": origin_id}
            to_city = {"name": dest_name, "id": dest_id}

            route_label = f"{origin_name} → {dest_name}"
            url = build_url(from_city, to_city, args.date)
            filename = f"{origin_name.lower()}_to_{dest_name.lower()}_{date_stamp}.html"
            filepath = os.path.join(OUTPUT_DIR, filename)

            print(f"\n{'─' * 60}")
            print(f"  [{i}/{len(ROUTES_LIST)}] {route_label}")
            print(f"{'─' * 60}")

            # Check if file already exists
            if not args.force and os.path.exists(filepath) and os.path.getsize(filepath) > 0:
                print(f"      Skip: File already exists and is non-empty: {filename}")
                continue

            # Navigate
            try:
                driver.get(url)
            except Exception as e:
                print(f"      ⚠ Nav timeout: {type(e).__name__} (page may still work)")

            # Wait for initial page render
            print(f"      Waiting 10s for page to render...")
            time.sleep(10)

            # Scroll until "End of list"
            print(f"      Scrolling until 'End of list' appears...")
            scroll_until_end_of_list(driver)

            # Save
            save_html(driver, filepath)

            if i < len(ROUTES_LIST):
                time.sleep(3)

    except KeyboardInterrupt:
        print("\n\n  ⚠ Interrupted by user")
    finally:
        driver.quit()
        print("\n" + "=" * 60)
        print(f"  Done Scraping! Files in: {OUTPUT_DIR}")
        print("=" * 60)

    # Run the database parsing/updates
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


if __name__ == "__main__":
    main()
