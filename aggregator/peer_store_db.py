"""SQLite store for Play / iOS / Google Search daily snapshots.

One row per operator × source × IST calendar day. A later sync on the same
day overwrites that row — last scrape is the official daily entry.
"""
from __future__ import annotations

import json
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
DB_PATH = ROOT / "data" / "peer_store_snapshots.db"
IST = ZoneInfo("Asia/Kolkata")


def ist_today() -> str:
    return datetime.now(IST).date().isoformat()


def _connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS app_store_daily (
            operator_id INTEGER,
            operator_name TEXT,
            operator_slug TEXT NOT NULL,
            source TEXT NOT NULL,
            collection_date TEXT NOT NULL,
            payload TEXT NOT NULL,
            PRIMARY KEY (operator_slug, source, collection_date)
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS google_reviews_daily (
            operator_id INTEGER,
            operator_name TEXT,
            operator_slug TEXT NOT NULL,
            collection_date TEXT NOT NULL,
            payload TEXT NOT NULL,
            PRIMARY KEY (operator_slug, collection_date)
        )
        """
    )
    return conn


def upsert_app_store_rows(rows: list[dict[str, Any]]) -> None:
    if not rows:
        return
    conn = _connect()
    try:
        for row in rows:
            day = row.get("collection_date") or ist_today()
            conn.execute(
                """
                INSERT INTO app_store_daily
                    (operator_id, operator_name, operator_slug, source, collection_date, payload)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(operator_slug, source, collection_date) DO UPDATE SET
                    operator_id=excluded.operator_id,
                    operator_name=excluded.operator_name,
                    payload=excluded.payload
                """,
                (
                    row.get("operator_id"),
                    row.get("operator_name"),
                    row["operator_slug"],
                    row["source"],
                    day,
                    json.dumps(row, default=str),
                ),
            )
        conn.commit()
    finally:
        conn.close()


def _purge_null_google_day(conn: sqlite3.Connection, day: str) -> None:
    for slug, payload in conn.execute(
        "SELECT operator_slug, payload FROM google_reviews_daily WHERE collection_date = ?",
        (day,),
    ).fetchall():
        try:
            data = json.loads(payload)
        except json.JSONDecodeError:
            continue
        if data.get("overall_rating") is None:
            conn.execute(
                "DELETE FROM google_reviews_daily WHERE operator_slug = ? AND collection_date = ?",
                (slug, day),
            )


def upsert_google_rows(rows: list[dict[str, Any]]) -> None:
    if not rows:
        return
    conn = _connect()
    try:
        day = rows[0].get("collection_date") or ist_today()
        for row in rows:
            if row.get("overall_rating") is None:
                continue
            day = row.get("collection_date") or ist_today()
            conn.execute(
                """
                INSERT INTO google_reviews_daily
                    (operator_id, operator_name, operator_slug, collection_date, payload)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(operator_slug, collection_date) DO UPDATE SET
                    operator_id=excluded.operator_id,
                    operator_name=excluded.operator_name,
                    payload=excluded.payload
                """,
                (
                    row.get("operator_id"),
                    row.get("operator_name"),
                    row["operator_slug"],
                    day,
                    json.dumps(row, default=str),
                ),
            )
        _purge_null_google_day(conn, rows[0].get("collection_date") or ist_today())
        conn.commit()
    finally:
        conn.close()


def load_daily_snapshots() -> dict[str, Any]:
    conn = _connect()
    try:
        app_rows = [
            json.loads(r[0])
            for r in conn.execute("SELECT payload FROM app_store_daily").fetchall()
        ]
        google_rows = [
            json.loads(r[0])
            for r in conn.execute("SELECT payload FROM google_reviews_daily").fetchall()
        ]
    finally:
        conn.close()
    days = sorted(
        {
            *(r.get("collection_date") for r in app_rows if r.get("collection_date")),
            *(r.get("collection_date") for r in google_rows if r.get("collection_date")),
        }
    )
    return {
        "anchor_date": days[-1] if days else ist_today(),
        "days": len(days),
        "app_store": app_rows,
        "google_reviews": google_rows,
        "generated_at": datetime.now(IST).isoformat(),
    }
