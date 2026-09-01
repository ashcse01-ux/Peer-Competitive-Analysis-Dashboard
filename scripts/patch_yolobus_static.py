"""Replace Leafy/leafy with YoloBus/yolobus across API static JSON files."""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STATIC_DIRS = [
    ROOT / "dashboard" / "public" / "api-static",
    ROOT / "dashboard" / "dist" / "api-static",
]

REPLACEMENTS = [
    ('"operator_slug": "leafy"', '"operator_slug": "yolobus"'),
    ('"operator_slug":"leafy"', '"operator_slug":"yolobus"'),
    ('"slug": "leafy"', '"slug": "yolobus"'),
    ('"slug":"leafy"', '"slug":"yolobus"'),
    ('"operator_name": "Leafy"', '"operator_name": "YoloBus"'),
    ('"operator_name":"Leafy"', '"operator_name":"YoloBus"'),
    ('"operator_name": "Leafy Bus"', '"operator_name": "YoloBus"'),
    ('"operator_name":"Leafy Bus"', '"operator_name":"YoloBus"'),
    ('"operator_name": "Leafybus"', '"operator_name": "YoloBus"'),
    ('"operator_name":"Leafybus"', '"operator_name":"YoloBus"'),
    ('"name": "Leafy"', '"name": "YoloBus"'),
    ('"name":"Leafy"', '"name":"YoloBus"'),
    ('"operator": "Leafy"', '"operator": "YoloBus"'),
    ('"operator":"Leafy"', '"operator":"YoloBus"'),
    ('"freshbus", "neugo", "flixbus", "zingbus", "leafy", "intrcity"',
     '"freshbus", "neugo", "flixbus", "zingbus", "yolobus", "intrcity"'),
]


def patch_file(path: Path) -> int:
    text = path.read_text(encoding="utf-8")
    original = text
    for old, new in REPLACEMENTS:
        text = text.replace(old, new)
    if text != original:
        path.write_text(text, encoding="utf-8")
        return original.lower().count("leafy") - text.lower().count("leafy")
    return 0


def main() -> None:
    total = 0
    for directory in STATIC_DIRS:
        if not directory.is_dir():
            continue
        for path in sorted(directory.glob("*.json")):
            removed = patch_file(path)
            if removed:
                print(f"  {path.relative_to(ROOT)}: removed ~{removed} leafy refs")
                total += removed
    print(f"Done — patched static JSON ({total} leafy refs removed).")


if __name__ == "__main__":
    main()
