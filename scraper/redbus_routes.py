"""Single source of truth for Redbus route directions (scraper/config/redbus_routes.json)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

CONFIG_PATH = Path(__file__).resolve().parent / "config" / "redbus_routes.json"


def load_redbus_config() -> dict[str, Any]:
    with CONFIG_PATH.open(encoding="utf-8") as f:
        return json.load(f)


def load_redbus_route_pairs() -> list[tuple[str, str]]:
    data = load_redbus_config()
    return [(str(o), str(d)) for o, d in data["routes"]]


def load_redbus_routes_with_ids() -> list[dict[str, str | int]]:
    return [
        {"id": i + 1, "origin": o, "destination": d}
        for i, (o, d) in enumerate(load_redbus_route_pairs())
    ]


ROUTES: list[tuple[str, str]] = load_redbus_route_pairs()
