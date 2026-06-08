"""
export_static_api.py — Export all API endpoint data as static JSON files
for GitHub Pages deployment.

Run this AFTER running run_demo.py at least once (so dashboard_cache.json exists).
Usage: python export_static_api.py
"""
import json
import os
import sys

# Add project root to sys.path
sys.path.insert(0, os.path.dirname(__file__))

from aggregator.live_bootstrap import OPERATORS, ROUTES, load_cache_from_disk, get_cache

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "dashboard", "public", "api-static")


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    if not load_cache_from_disk():
        print("ERROR: No dashboard_cache.json found. Run run_demo.py first.")
        sys.exit(1)

    c = get_cache()
    print(f"  Cache loaded: {len(c)} keys")

    # --- 1. /api/v1/operators ---
    _write("operators.json", OPERATORS)

    # --- 2. /api/v1/metrics/overview ---
    app_store = c.get("app_store") or {}
    google = c.get("google_reviews") or {}
    cells = c.get("redbus_cells") or []
    ops = []
    for op in OPERATORS:
        slug = op["slug"]
        gp = app_store.get(slug, {}).get("google_play", {})
        ios = app_store.get(slug, {}).get("ios_app_store", {})
        gr = google.get(slug, {})
        op_cells = [x for x in cells if x["operator_slug"] == slug and x.get("sentiment_score") is not None]
        rs = round(sum(x["sentiment_score"] for x in op_cells) / len(op_cells), 3) if op_cells else None
        gp_r = gp.get("overall_rating")
        ios_r = ios.get("overall_rating") if not ios.get("app_absent") else None
        gr_r = gr.get("overall_rating")
        ratings = [x for x in [gp_r, ios_r, gr_r] if x is not None]
        composite = round(sum(ratings) / len(ratings), 2) if ratings else None
        ts = gp.get("cycle_timestamp") or gr.get("cycle_timestamp") or c.get("completed_at")
        ops.append({
            **op,
            "composite_score": composite,
            "gp_rating": gp_r, "ios_rating": ios_r, "google_rating": gr_r,
            "redbus_sentiment": rs,
            "gp_review_count": gp.get("review_count"),
            "ios_review_count": ios.get("review_count") if not ios.get("app_absent") else None,
            "google_review_count": gr.get("review_count"),
            "redbus_review_count": sum(x.get("review_count") or 0 for x in op_cells) or None,
            "gp_delta": None, "ios_delta": None, "google_delta": None,
            "last_updated": ts, "rank": 0,
        })
    ops.sort(key=lambda x: x["composite_score"] or 0, reverse=True)
    for idx, op in enumerate(ops, 1):
        op["rank"] = idx
    _write("overview.json", {"operators": ops})

    # --- 3. /api/v1/metrics/app-store ---
    data = []
    for op in OPERATORS:
        slug = op["slug"]
        for source in ["google_play", "ios_app_store"]:
            entry = app_store.get(slug, {}).get(source, {})
            if source == "ios_app_store" and entry.get("app_absent"):
                continue
            data.append({
                "operator_id": op["id"], "operator_name": op["name"], "operator_slug": slug,
                "source": source,
                "overall_rating": entry.get("overall_rating"),
                "review_count": entry.get("review_count"),
                "sentiment_score": entry.get("sentiment_score"),
                "positive_review_ratio": entry.get("positive_review_ratio"),
                "rating_delta_mom": entry.get("rating_delta_mom"),
                "downloads": entry.get("downloads"),
                "cycle_timestamp": entry.get("cycle_timestamp") or c.get("completed_at"),
                "is_stale": entry.get("is_stale", False),
            })
    _write("app-store.json", {"data": data})

    # --- 4. /api/v1/metrics/google-reviews ---
    data = []
    for op in OPERATORS:
        entry = google.get(op["slug"], {})
        data.append({
            "operator_id": op["id"], "operator_name": op["name"], "operator_slug": op["slug"],
            "overall_rating": entry.get("overall_rating"),
            "review_count": entry.get("review_count"),
            "sentiment_score": entry.get("sentiment_score"),
            "positive_review_ratio": entry.get("positive_review_ratio"),
            "rating_delta_mom": entry.get("rating_delta_mom"),
            "cycle_timestamp": entry.get("cycle_timestamp") or c.get("completed_at"),
            "is_stale": entry.get("is_stale", False),
        })
    _write("google-reviews.json", {"data": data})

    # --- 5. /api/v1/metrics/redbus ---
    _write("redbus.json", {"data": cells})

    # --- 6. /api/v1/metrics/redbus/tags ---
    tags = c.get("redbus_tags")
    if tags:
        _write("redbus-tags.json", tags)
    else:
        from aggregator.live_bootstrap import _build_tag_data
        _write("redbus-tags.json", _build_tag_data({op["slug"]: [] for op in OPERATORS}))

    # --- 7. /api/v1/history/{source} ---
    hist = c.get("history") or {}
    for source in ["google_play", "ios_app_store", "google_reviews", "redbus_overall"]:
        _write(f"history-{source}.json", {"source": source, "series": hist.get(source, [])})

    # --- 8. /api/v1/reviews/top ---
    reviews = c.get("top_reviews") or []
    _write("reviews-top.json", {"reviews": reviews})

    # --- 9. /api/v1/refresh/status ---
    _write("refresh-status.json", {
        "cycle_id": 1, "status": "completed", "fetch_phase": "done",
        "operators_ready": len(OPERATORS), "last_error": None,
        "triggered_at": c.get("triggered_at"), "completed_at": c.get("completed_at"),
        "stale_sources": [],
    })

    # --- 10. /api/v1/metrics/review-classification/{source} ---
    all_cls = c.get("review_classification") or {}
    for source in ["google_play", "ios_app_store", "google_reviews"]:
        payload = all_cls.get(source) or {}
        _write(f"review-classification-{source}.json", {"source": source, **payload})

    print(f"\n  ✅ All static API files exported to: {OUTPUT_DIR}\n")


def _write(filename, data):
    path = os.path.join(OUTPUT_DIR, filename)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, separators=(",", ":"))
    size_kb = os.path.getsize(path) / 1024
    print(f"  → {filename:45s} {size_kb:6.1f} KB")


if __name__ == "__main__":
    main()
