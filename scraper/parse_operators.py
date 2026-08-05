"""
Parse saved RedBus HTML files and insert the detailed bus listings
into a SQLite database ('srp.db') with robust partial-match CSS classes,
a unique index constraint to prevent duplicate entries, and a 'scraped_at' timestamp.
"""

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

def init_db():
    conn = sqlite3.connect(DB_FILE)
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
            UNIQUE(route, travel_date, srp_rank, operator, timing)
        )
    """)
    conn.commit()
    return conn

def extract_bus_details(filepath: str, route: str, date: str, scraped_at: str) -> list[dict]:
    with open(filepath, "r", encoding="utf-8") as f:
        soup = BeautifulSoup(f.read(), "html.parser")

    master_list = []
    
    # Target elements using prefix/partial match to handle dynamic suffixes
    bus_cards = soup.find_all(lambda tag: tag.name in ["li", "div"] and any("tupleWrapper" in c for c in tag.get("class", [])))
    
    rank = 1
    for card in bus_cards:
        # 1. Operator Name
        op_el = card.find(class_=lambda c: c and c.startswith("travelsName"))
        if not op_el:
            continue
        operator = op_el.get_text().strip()
        
        # 2. Timing (Boarding / Dropping)
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
        
        # 3. Rating
        rating = ""
        rating_el = card.find(class_=lambda c: c and c.startswith("rating"))
        # Distinguish rating from ratingCount
        if rating_el and "ratingCount" not in "".join(rating_el.get("class", [])):
            rating = rating_el.get_text().strip()
            
        # 4. Reviews
        reviews = ""
        reviews_el = card.find(class_=lambda c: c and c.startswith("ratingCount"))
        if reviews_el:
            reviews = reviews_el.get_text().strip()
            reviews = re.sub(r'[^\d]', '', reviews)
            
        # 5. Final Fare
        final_fare = ""
        fare_el = card.find(class_=lambda c: c and c.startswith("finalFare"))
        if fare_el:
            final_fare = fare_el.get_text().strip()
            
        # 6. Bus Type
        bus_type = ""
        bus_type_el = card.find(class_=lambda c: c and c.startswith("busType"))
        if bus_type_el:
            bus_type = bus_type_el.get_text().strip()
            
        # 7. Duration
        duration = ""
        duration_el = card.find(class_=lambda c: c and c.startswith("duration"))
        # Distinguish duration from durationSeatsRow
        if duration_el and "durationSeats" not in "".join(duration_el.get("class", [])):
            duration = duration_el.get_text().strip()

        master_list.append({
            "route": route,
            "travel_date": date,
            "srp_rank": rank,
            "operator": operator,
            "timing": timing,
            "rating": rating,
            "reviews": reviews,
            "final_fare": final_fare,
            "bus_type": bus_type,
            "duration": duration,
            "scraped_at": scraped_at
        })
        rank += 1
        
    return master_list

def main():
    html_files = sorted([f for f in os.listdir(HTML_DIR) if f.endswith(".html")])

    if not html_files:
        print(f"No HTML files found in {HTML_DIR}")
        return

    # Use the modification time of the HTML file as the approximate 'scraped_at' time
    # so historical files map accurately.
    conn = init_db()
    cursor = conn.cursor()

    print("=" * 60)
    print("  Creating / Updating SQLite Database ('srp.db')")
    print("=" * 60)

    total_inserted = 0
    total_skipped = 0

    for filename in html_files:
        filepath = os.path.join(HTML_DIR, filename)
        route, date = parse_filename(filename)
        
        # Determine scraped_at from file modification time
        mtime = os.path.getmtime(filepath)
        scraped_at = datetime.fromtimestamp(mtime).strftime("%Y-%m-%d %H:%M:%S")

        print(f"Parsing route: {route} ({date}) [scraped_at: {scraped_at}]...")
        route_records = extract_bus_details(filepath, route, date, scraped_at)
        
        inserted_for_route = 0
        skipped_for_route = 0
        
        for r in route_records:
            try:
                cursor.execute("""
                    INSERT INTO bus_listings (
                        route, travel_date, srp_rank, operator, timing, 
                        rating, reviews, final_fare, bus_type, duration, scraped_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    r["route"], r["travel_date"], r["srp_rank"], r["operator"], r["timing"],
                    r["rating"], r["reviews"], r["final_fare"], r["bus_type"], r["duration"], r["scraped_at"]
                ))
                inserted_for_route += 1
            except sqlite3.IntegrityError:
                # Duplicate entry (violates UNIQUE constraint)
                skipped_for_route += 1
                
        conn.commit()
        print(f"  -> Inserted {inserted_for_route} records, skipped {skipped_for_route} duplicates")
        total_inserted += inserted_for_route
        total_skipped += skipped_for_route

    conn.close()

    print(f"\n{'=' * 60}")
    print(f"  ✅ Database successfully updated: {DB_FILE}")
    print(f"  Total new entries: {total_inserted}")
    print(f"  Total skipped (duplicates): {total_skipped}")
    print(f"{'=' * 60}")

if __name__ == "__main__":
    main()
