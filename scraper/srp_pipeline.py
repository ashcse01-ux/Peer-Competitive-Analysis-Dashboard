"""
Shared Redbus SRP scrape + parse helpers (CLI / optional use).

Primary user sync path: scraper.srp_sync (on-demand with progress).
"""

from __future__ import annotations

import logging
import sqlite3
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

SCRAPER_DIR = Path(__file__).resolve().parent
SRP_DB_PATH = SCRAPER_DIR / "srp.db"


def run_srp_pipeline(
    *,
    force: bool = True,
    headed: bool = False,
    date: str | None = None,
) -> dict[str, Any]:
    """
    Scrape Redbus SRP HTML (force overwrite for scheduled slots) then parse into srp.db.
    """
    from scraper.redbus_scraper import run_scrape
    from scraper.parse_operators import main as parse_main

    logger.info("srp_pipeline_start force=%s headed=%s date=%s", force, headed, date)
    run_scrape(date=date, headed=headed, force=force, run_parse=False)
    parse_main()
    meta = latest_scraped_at()
    logger.info("srp_pipeline_done last_scraped_at=%s", meta)
    return {"ok": True, "last_scraped_at": meta}


def latest_scraped_at() -> str | None:
    if not SRP_DB_PATH.exists():
        return None
    try:
        conn = sqlite3.connect(str(SRP_DB_PATH))
        try:
            row = conn.execute("SELECT MAX(scraped_at) FROM bus_listings").fetchone()
            return row[0] if row and row[0] else None
        finally:
            conn.close()
    except Exception as exc:
        logger.warning("latest_scraped_at_failed: %s", exc)
        return None


def query_srp_listings(
    *,
    operator: str | None = None,
    route: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
) -> dict[str, Any]:
    """Read bus_listings from srp.db into the dashboard SRP response shape."""
    if not SRP_DB_PATH.exists():
        try:
            from scraper.redbus_routes import load_redbus_route_pairs

            fallback_routes = [f"{o} → {d}" for o, d in load_redbus_route_pairs()]
        except Exception:
            fallback_routes = []
        return {"data": [], "routes": fallback_routes, "operators": [], "last_scraped_at": None}

    conn = sqlite3.connect(str(SRP_DB_PATH))
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    cursor.execute("SELECT DISTINCT route FROM bus_listings ORDER BY route")
    routes_list = [r["route"] for r in cursor.fetchall()]
    cursor.execute("SELECT DISTINCT operator FROM bus_listings ORDER BY operator")
    operators_list = [o["operator"] for o in cursor.fetchall()]
    last_scraped = latest_scraped_at()

    query = "SELECT * FROM bus_listings WHERE 1=1"
    params: list[Any] = []
    if operator:
        query += " AND UPPER(operator) = ?"
        params.append(operator.upper())
    if route:
        query += " AND route = ?"
        params.append(route)
    if start_date:
        query += " AND travel_date >= ?"
        params.append(start_date)
    if end_date:
        query += " AND travel_date <= ?"
        params.append(end_date)

    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()

    def _cell(row: sqlite3.Row, key: str, default=None):
        try:
            val = row[key]
            return default if val is None else val
        except (IndexError, KeyError):
            return default

    services: dict[tuple, dict] = {}
    service_key_counter = 901
    for row in rows:
        r_name = row["route"]
        op_name = row["operator"]
        timing = row["timing"]
        travel_date = row["travel_date"]
        srp_rank = row["srp_rank"]
        rating = _cell(row, "rating", "")
        reviews = _cell(row, "reviews", "")
        bus_type = _cell(row, "bus_type", "")
        duration = _cell(row, "duration", "")
        final_fare = _cell(row, "final_fare", "")
        seats_available = _cell(row, "seats_available")
        seat_capacity = _cell(row, "seat_capacity")
        occupancy = _cell(row, "occupancy_pct")

        service_id = (r_name, op_name, timing)
        if service_id not in services:
            origin_part = r_name.split("→")[0].strip() if "→" in r_name else "HYD"
            dest_part = r_name.split("→")[1].strip() if "→" in r_name else "VJY"
            origin_abbr = "".join([w[0] for w in origin_part.split() if w])[:3].upper()
            dest_abbr = "".join([w[0] for w in dest_part.split() if w])[:3].upper()
            time_clean = timing.split("-")[0].strip().replace(":", "") if "-" in timing else "0000"
            svc_num = f"{origin_abbr}-{dest_abbr}-AC-SE-{time_clean}"

            services[service_id] = {
                "route": r_name,
                "service_key": service_key_counter,
                "service_number": svc_num,
                "timing": timing,
                "bus_type": bus_type,
                "duration": duration,
                "price": final_fare,
                "rating": rating,
                "reviews": reviews,
                "seats_available": seats_available,
                "seat_capacity": seat_capacity,
                "occupancy_pct": occupancy,
                "dates": {},
            }
            service_key_counter += 1
        else:
            prev_dates = services[service_id]["dates"]
            if not prev_dates or travel_date >= max(prev_dates.keys()):
                services[service_id]["duration"] = duration or services[service_id]["duration"]
                services[service_id]["bus_type"] = bus_type or services[service_id]["bus_type"]
                services[service_id]["price"] = final_fare or services[service_id]["price"]
                services[service_id]["rating"] = rating or services[service_id]["rating"]
                services[service_id]["reviews"] = reviews or services[service_id]["reviews"]
                services[service_id]["seats_available"] = seats_available
                services[service_id]["seat_capacity"] = seat_capacity
                services[service_id]["occupancy_pct"] = occupancy

        services[service_id]["dates"][travel_date] = srp_rank

    output = []
    for s_id, s_data in services.items():
        row_dict = {
            "route": s_data["route"],
            "operator": s_id[1],
            "service_key": s_data["service_key"],
            "service_number": s_data["service_number"],
            "timing": s_data["timing"],
            "rating": s_data["rating"],
            "reviews": s_data["reviews"],
            "bus_type": s_data["bus_type"],
            "duration": s_data["duration"],
            "price": s_data.get("price"),
            "seats_available": s_data.get("seats_available"),
            "seat_capacity": s_data.get("seat_capacity"),
            "occupancy_pct": s_data.get("occupancy_pct"),
            "snapshots": s_data["dates"],
        }
        for date_str, rank in s_data["dates"].items():
            parts = date_str.split("-")
            if len(parts) == 3:
                row_dict[f"d_{parts[1]}_{parts[2]}"] = rank
        output.append(row_dict)

    return {
        "data": output,
        "routes": routes_list,
        "operators": operators_list,
        "last_scraped_at": last_scraped,
    }


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    print(run_srp_pipeline(force=True))
