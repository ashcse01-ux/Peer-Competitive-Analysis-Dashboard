"""
aggregator/validate.py — Validate scraped metrics before serving to the dashboard.
"""
from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)


def validate_rating(value: Any, field: str = "rating") -> float | None:
    if value is None:
        return None
    try:
        num = float(value)
    except (TypeError, ValueError):
        logger.warning("invalid_%s", field, extra={"value": value})
        return None
    if not 1.0 <= num <= 5.0:
        logger.warning("out_of_range_%s", field, extra={"value": num})
        return None
    return round(num, 2)


def validate_review_count(value: Any) -> int | None:
    if value is None:
        return None
    try:
        num = int(value)
    except (TypeError, ValueError):
        return None
    if num < 0:
        return None
    return num


def validate_sentiment(value: Any) -> float | None:
    if value is None:
        return None
    try:
        num = float(value)
    except (TypeError, ValueError):
        return None
    if not -1.0 <= num <= 1.0:
        return None
    return round(num, 3)


def warn_rating_jump(
    operator_slug: str,
    source: str,
    previous: float | None,
    current: float | None,
    threshold: float = 1.0,
) -> None:
    if previous is None or current is None:
        return
    if abs(current - previous) > threshold:
        logger.warning(
            "rating_jump_detected slug=%s source=%s prev=%.2f curr=%.2f",
            operator_slug,
            source,
            previous,
            current,
        )


def validate_app_store_entry(
    entry: dict,
    *,
    ios_app_id: str | None,
    source: str,
) -> dict:
    if source == "ios_app_store" and not ios_app_id:
        return {
            **entry,
            "overall_rating": None,
            "review_count": None,
            "is_stale": False,
            "app_absent": True,
        }
    return {
        **entry,
        "overall_rating": validate_rating(entry.get("overall_rating")),
        "review_count": validate_review_count(entry.get("review_count")),
        "sentiment_score": validate_sentiment(entry.get("sentiment_score")),
    }
