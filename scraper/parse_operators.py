"""
Parse saved RedBus HTML files and insert bus listings into SQLite ('srp.db').

Occupancy is derived from vacant seats on the card and bus-type capacity:
  Seater only        → 45
  Sleeper only       → 36
  Seater + Sleeper   → 43
  Anything else      → 41
"""

from __future__ import annotations

import os
import re
import sqlite3
from datetime import datetime

from bs4 import BeautifulSoup

HTML_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "redbus_html")
DB_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "srp.db")


def parse_filename(filename: str) -> tuple[str, str]:
    base = filename.replace(".html", "")
    parts = base.rsplit("_", 1)
    if len(parts) == 2 and parts[1].isdigit():
        route_slug = parts[0]
        date_str = parts[1]
        route = route_slug.replace("_", " ").title().replace(" To ", " → ")
        date_formatted = f"{date_str[:4]}-{date_str[4:6]}-{date_str[6:]}"
        return route, date_formatted
    return base, "unknown"


def seat_capacity_for_bus_type(bus_type: str) -> int:
    """Map Redbus bus type text to assumed total seat capacity."""
    t = (bus_type or "").lower()
    has_seater = "seater" in t
    has_sleeper = "sleeper" in t
    if has_seater and has_sleeper:
        return 43
    if has_sleeper:
        return 36
    if has_seater:
        return 45
    return 41


def occupancy_pct(capacity: int, seats_available: int | None) -> float | None:
    if seats_available is None or capacity <= 0:
        return None
    occupied = max(0, capacity - seats_available)
    return round(min(100.0, (occupied / capacity) * 100.0), 1)


def init_db():
    conn = sqlite3.connect(DB_FILE, timeout=30.0)
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS bus_listings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            route TEXT NOT NULL,
            travel_date TEXT NOT NULL,
            srp_rank INTEGER NOT NULL,
            operator TEXT NOT NULL,
            timing TEXT NOT NULL,
            rating TEXT,
            reviews TEXT,
            final_fare TEXT,
            bus_type TEXT,
            duration TEXT,
            scraped_at TEXT NOT NULL,
            seats_available INTEGER,
            seat_capacity INTEGER,
            occupancy_pct REAL,
            UNIQUE(route, travel_date, srp_rank, operator, timing)
        )
    """)
    # Migrate older DBs
    existing = {row[1] for row in cursor.execute("PRAGMA table_info(bus_listings)").fetchall()}
    for col, decl in (
        ("seats_available", "INTEGER"),
        ("seat_capacity", "INTEGER"),
        ("occupancy_pct", "REAL"),
        ("route_id", "TEXT"),
    ):
        if col not in existing:
            cursor.execute(f"ALTER TABLE bus_listings ADD COLUMN {col} {decl}")
    conn.commit()
    return conn


def extract_bus_details(filepath: str, route: str, date: str, scraped_at: str) -> list[dict]:
    with open(filepath, "r", encoding="utf-8") as f:
        soup = BeautifulSoup(f.read(), "html.parser")

    master_list = []
    bus_cards = soup.find_all(
        lambda tag: tag.name in ["li", "div"]
        and any("tupleWrapper" in c for c in tag.get("class", []))
    )

    rank = 1
    for card in bus_cards:
        op_el = card.find(class_=lambda c: c and c.startswith("travelsName"))
        if not op_el:
            continue
        operator = op_el.get_text().strip()

        timing = "Unknown"
        boarding_el = card.find(class_=lambda c: c and c.startswith("boardingTime"))
        dropping_el = card.find(class_=lambda c: c and c.startswith("droppingTime"))
        if boarding_el and dropping_el:
            timing = f"{boarding_el.get_text().strip()} - {dropping_el.get_text().strip()}"
        else:
            time_row = card.find(class_=lambda c: c and c.startswith("timeRow"))
            if time_row:
                text_parts = [p.get_text().strip() for p in time_row.find_all("p") if p.get_text().strip()]
                if len(text_parts) >= 2:
                    timing = f"{text_parts[0]} - {text_parts[1]}"

        rating = ""
        rating_el = card.find(
            class_=lambda c: c
            and c.startswith("rating")
            and not c.startswith("ratingCount")
            and not c.startswith("ratingTag")
            and not c.startswith("ratingIcon")
        )
        if rating_el:
            raw_rating = rating_el.get_text(" ", strip=True)
            m_rating = re.search(r"\d+(?:\.\d+)?", raw_rating)
            rating = m_rating.group(0) if m_rating else raw_rating

        reviews = ""
        reviews_el = card.find(class_=lambda c: c and c.startswith("ratingCount"))
        if reviews_el:
            reviews = re.sub(r"[^\d]", "", reviews_el.get_text().strip())

        final_fare = ""
        fare_el = card.find(class_=lambda c: c and c.startswith("finalFare"))
        if fare_el:
            final_fare = fare_el.get_text().strip()

        bus_type = ""
        bus_type_el = card.find(class_=lambda c: c and c.startswith("busType"))
        if bus_type_el:
            bus_type = bus_type_el.get_text().strip()

        duration = ""
        duration_el = card.find(
            class_=lambda c: c and c.startswith("duration") and not c.startswith("durationSeats")
        )
        if duration_el:
            duration = duration_el.get_text().strip()

        seats_available = None
        seats_el = card.find(class_=lambda c: c and c.startswith("totalSeats"))
        if seats_el:
            m = re.search(r"(\d+)\s*Seats?", seats_el.get_text(" ", strip=True), re.I)
            if m:
                seats_available = int(m.group(1))

        card_id = str(card.get("id") or "").strip()

        capacity = seat_capacity_for_bus_type(bus_type)
        occ = occupancy_pct(capacity, seats_available)

        master_list.append({
            "route": route,
            "route_id": card_id or None,
            "travel_date": date,
            "srp_rank": rank,
            "operator": operator,
            "timing": timing,
            "rating": rating,
            "reviews": reviews,
            "final_fare": final_fare,
            "bus_type": bus_type,
            "duration": duration,
            "scraped_at": scraped_at,
            "seats_available": seats_available,
            "seat_capacity": capacity,
            "occupancy_pct": occ,
        })
        rank += 1

    return master_list


def main():
    html_files = sorted([f for f in os.listdir(HTML_DIR) if f.endswith(".html")])
    _ingest_html_files(html_files, delete_travel_dates=None)


def replace_day_from_html(*, travel_date_iso: str, date_stamp: str) -> dict:
    if not os.path.isdir(HTML_DIR):
        raise FileNotFoundError(f"HTML directory not found: {HTML_DIR}")

    html_files = sorted(
        f for f in os.listdir(HTML_DIR)
        if f.endswith(f"_{date_stamp}.html")
    )
    if not html_files:
        raise FileNotFoundError(f"No HTML files for stamp {date_stamp} in {HTML_DIR}")

    return _ingest_html_files(html_files, delete_travel_dates=[travel_date_iso])


def _ingest_html_files(html_files: list[str], delete_travel_dates: list[str] | None) -> dict:
    if not html_files:
        print(f"No HTML files found in {HTML_DIR}")
        return {"inserted": 0, "updated": 0, "deleted": 0}

    conn = init_db()
    cursor = conn.cursor()

    deleted = 0
    if delete_travel_dates:
        for td in delete_travel_dates:
            cursor.execute("DELETE FROM bus_listings WHERE travel_date = ?", (td,))
            deleted += cursor.rowcount
        conn.commit()
        print(f"Deleted {deleted} existing rows for travel_date(s): {delete_travel_dates}")

    print("=" * 60)
    print("  Creating / Updating SQLite Database ('srp.db')")
    print("=" * 60)

    total_inserted = 0
    total_updated = 0

    upsert_sql = """
        INSERT INTO bus_listings (
            route, route_id, travel_date, srp_rank, operator, timing,
            rating, reviews, final_fare, bus_type, duration, scraped_at,
            seats_available, seat_capacity, occupancy_pct
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(route, travel_date, srp_rank, operator, timing) DO UPDATE SET
            route_id = COALESCE(excluded.route_id, bus_listings.route_id),
            rating = excluded.rating,
            reviews = excluded.reviews,
            final_fare = excluded.final_fare,
            bus_type = excluded.bus_type,
            duration = excluded.duration,
            scraped_at = excluded.scraped_at,
            seats_available = excluded.seats_available,
            seat_capacity = excluded.seat_capacity,
            occupancy_pct = excluded.occupancy_pct
    """

    for filename in html_files:
        filepath = os.path.join(HTML_DIR, filename)
        route, date = parse_filename(filename)

        mtime = os.path.getmtime(filepath)
        scraped_at = datetime.fromtimestamp(mtime).strftime("%Y-%m-%d %H:%M:%S")

        print(f"Parsing route: {route} ({date}) [scraped_at: {scraped_at}]...")
        route_records = extract_bus_details(filepath, route, date, scraped_at)

        inserted_for_route = 0
        updated_for_route = 0

        for r in route_records:
            cursor.execute(
                "SELECT 1 FROM bus_listings WHERE route=? AND travel_date=? AND srp_rank=? AND operator=? AND timing=?",
                (r["route"], r["travel_date"], r["srp_rank"], r["operator"], r["timing"]),
            )
            existed = cursor.fetchone() is not None
            cursor.execute(
                upsert_sql,
                (
                    r["route"], r["route_id"], r["travel_date"], r["srp_rank"], r["operator"], r["timing"],
                    r["rating"], r["reviews"], r["final_fare"], r["bus_type"], r["duration"], r["scraped_at"],
                    r["seats_available"], r["seat_capacity"], r["occupancy_pct"],
                ),
            )
            if existed:
                updated_for_route += 1
            else:
                inserted_for_route += 1

        conn.commit()
        print(f"  -> Inserted {inserted_for_route}, updated {updated_for_route}")
        total_inserted += inserted_for_route
        total_updated += updated_for_route

    conn.close()

    print(f"\n{'=' * 60}")
    print(f"  Database updated: {DB_FILE}")
    print(f"  Inserted: {total_inserted}  Updated: {total_updated}  Deleted: {deleted}")
    print(f"{'=' * 60}")
    return {"inserted": total_inserted, "updated": total_updated, "deleted": deleted}


if __name__ == "__main__":
    main()
