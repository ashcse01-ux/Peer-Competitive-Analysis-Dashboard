"""
Google Play review-topic KPIs.

Play Store bifurcates travel-app reviews into feature topics. We scrape
on-page topic scores when present, otherwise derive scores from review text
using keyword buckets aligned to Play's travel categories.
"""

from __future__ import annotations

import re
from typing import Any

__all__ = [
    "PLAY_TOPIC_KEYS",
    "PLAY_TOPIC_LABELS",
    "TOPIC_KEYWORDS",
    "score_topics_from_reviews",
    "normalize_histogram",
    "parse_downloads",
]

PLAY_TOPIC_KEYS: list[str] = [
    "booking_experience",
    "user_interface",
    "customer_support",
    "public_transport",
    "value_for_money",
    "book_transport",
    "pricing_accuracy",
    "navigation_accuracy",
    "entertainment_value",
    "performance",
]

PLAY_TOPIC_LABELS: dict[str, str] = {
    "booking_experience": "Booking Experience",
    "user_interface": "User Interface",
    "customer_support": "Customer Support",
    "public_transport": "Public Transport",
    "value_for_money": "Value for Money",
    "book_transport": "Book Transport",
    "pricing_accuracy": "Pricing Accuracy",
    "navigation_accuracy": "Navigation Accuracy",
    "entertainment_value": "Entertainment Value",
    "performance": "Performance",
}

TOPIC_KEYWORDS: dict[str, list[str]] = {
    "booking_experience": [
        "booking", "booked", "book", "reservation", "checkout", "confirm",
        "ticket", "seats selected", "payment failed", "unable to book",
    ],
    "user_interface": [
        "ui", "ux", "interface", "design", "layout", "screen", "app looks",
        "easy to use", "confusing", "user friendly", "navigation menu",
    ],
    "customer_support": [
        "support", "customer care", "helpline", "call center", "agent",
        "response", "refund support", "complaint", "chat support",
    ],
    "public_transport": [
        "bus", "coach", "fleet", "journey", "trip", "travel", "route",
        "boarding", "departure", "arrival",
    ],
    "value_for_money": [
        "value for money", "worth the money", "overpriced", "cheap",
        "affordable", "expensive", "good deal", "price worth",
    ],
    "book_transport": [
        "book bus", "book ticket", "transport booking", "seat booking",
        "reserve seat", "select seat",
    ],
    "pricing_accuracy": [
        "price", "pricing", "fare", "hidden charge", "extra charge",
        "surge", "discount", "coupon", "final amount", "price change",
    ],
    "navigation_accuracy": [
        "tracking", "live track", "gps", "location", "map", "eta",
        "navigation", "wrong location", "pickup point",
    ],
    "entertainment_value": [
        "wifi", "movie", "entertainment", "usb", "charging", "screen",
        "music", "amenities", "blanket", "water bottle",
    ],
    "performance": [
        "crash", "lag", "slow", "bug", "loading", "hang", "glitch",
        "performance", "update", "not working", "force close",
    ],
}


def parse_downloads(installs: str | int | None) -> tuple[str | None, int | None]:
    """Return (display_string, numeric_raw) from Play Store installs field."""
    if installs is None:
        return None, None
    if isinstance(installs, int):
        return f"{installs:,}+", installs
    text = str(installs).strip()
    if not text:
        return None, None
    digits = re.sub(r"[^\d]", "", text)
    raw = int(digits) if digits else None
    return text, raw


def normalize_histogram(histogram: Any) -> dict[str, int | None]:
    """
    Normalize Play/iOS histogram into star_1..star_5 counts.

    Accepts list[int] of length 5 (index 0 = 1-star) or dict keyed 1..5.
    """
    out: dict[str, int | None] = {
        "star_1": None, "star_2": None, "star_3": None, "star_4": None, "star_5": None,
    }
    if histogram is None:
        return out
    if isinstance(histogram, dict):
        for i in range(1, 6):
            val = histogram.get(i, histogram.get(str(i)))
            if val is not None:
                try:
                    out[f"star_{i}"] = int(val)
                except (TypeError, ValueError):
                    pass
        return out
    if isinstance(histogram, (list, tuple)) and len(histogram) >= 5:
        for i in range(5):
            try:
                out[f"star_{i + 1}"] = int(histogram[i])
            except (TypeError, ValueError):
                out[f"star_{i + 1}"] = None
    return out


def histogram_from_reviews(reviews: list[dict]) -> dict[str, int | None]:
    """Build star histogram from a list of review dicts with star_rating."""
    counts = [0, 0, 0, 0, 0]
    for r in reviews:
        star = r.get("star_rating")
        if star is None:
            continue
        try:
            s = int(star)
        except (TypeError, ValueError):
            continue
        if 1 <= s <= 5:
            counts[s - 1] += 1
    return normalize_histogram(counts)


def score_topics_from_reviews(reviews: list[dict]) -> dict[str, float | None]:
    """
    Derive 1–5 topic scores as the mean star rating of reviews mentioning
    each topic. Topics with no mentions are null.
    """
    buckets: dict[str, list[float]] = {k: [] for k in PLAY_TOPIC_KEYS}

    for review in reviews:
        text = (review.get("review_text") or review.get("text") or "").lower()
        star = review.get("star_rating")
        if not text or star is None:
            continue
        try:
            score = float(star)
        except (TypeError, ValueError):
            continue
        if not (1.0 <= score <= 5.0):
            continue
        for topic, keywords in TOPIC_KEYWORDS.items():
            if any(kw in text for kw in keywords):
                buckets[topic].append(score)

    return {
        topic: round(sum(vals) / len(vals), 2) if vals else None
        for topic, vals in buckets.items()
    }


def merge_topic_scores(
    scraped: dict[str, float | None] | None,
    derived: dict[str, float | None],
) -> dict[str, float | None]:
    """Prefer scraped Play Store topic scores; fill gaps from derived."""
    scraped = scraped or {}
    merged: dict[str, float | None] = {}
    for key in PLAY_TOPIC_KEYS:
        val = scraped.get(key)
        if val is None:
            val = derived.get(key)
        merged[key] = round(float(val), 2) if val is not None else None
    return merged
