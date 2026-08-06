"""
Update the static API JSON files (app-store.json, overview.json) with the
freshly scraped Google Play and iOS App Store data.
"""
import json
import datetime

TODAY = datetime.datetime.now().strftime("%Y-%m-%d")
TIMESTAMP = datetime.datetime.now().isoformat() + "+05:30"

# ── Load scraped data ───────────────────────────────────────────────────────
with open("google_play_today.json") as f:
    gp_data = json.load(f)["operators"]

with open("app_store_today.json") as f:
    ios_data = json.load(f)["operators"]

# ── Operator mapping ───────────────────────────────────────────────────────
# Map scraped names → (operator_id, canonical name, slug)
OPERATOR_MAP = {
    "freshbus":          (1, "FreshBus",          "freshbus"),
    "zingbus":           (4, "Zingbus",           "zingbus"),
    "intrcity Smartbus": (6, "IntrCity SmartBus", "intrcity"),
    "Leafy":             (5, "Leafy",             "leafy"),
    "Neugo":             (2, "Neugo",             "neugo"),
    "Flixbus":           (3, "FlixBus",           "flixbus"),
}

# ── 1. Build updated app-store.json ────────────────────────────────────────
app_store_entries = []

for scraped_name, (op_id, canon_name, slug) in OPERATOR_MAP.items():
    gp = gp_data.get(scraped_name, {})
    ios = ios_data.get(scraped_name, {})

    # Google Play entry
    gp_entry = {
        "operator_id": op_id,
        "operator_name": canon_name,
        "operator_slug": slug,
        "source": "google_play",
        "overall_rating": round(gp["rating"], 2) if gp.get("rating") else None,
        "review_count": gp.get("total_reviews"),
        "ratings_count": gp.get("total_ratings"),
        "sentiment_score": None,
        "positive_review_ratio": None,
        "rating_delta_mom": None,
        "downloads": None,
        "cycle_timestamp": TIMESTAMP,
        "is_stale": False,
        "downloads_raw": None,
        "star_1": None, "star_2": None, "star_3": None, "star_4": None, "star_5": None,
        "play_topics": {},
        "collection_date": TODAY
    }

    # iOS entry
    ios_entry = {
        "operator_id": op_id,
        "operator_name": canon_name,
        "operator_slug": slug,
        "source": "ios_app_store",
        "overall_rating": ios.get("rating"),
        "review_count": None,
        "ratings_count": ios.get("total_ratings"),
        "sentiment_score": None,
        "positive_review_ratio": None,
        "rating_delta_mom": None,
        "downloads": None,
        "cycle_timestamp": TIMESTAMP,
        "is_stale": False,
        "downloads_raw": None,
        "star_1": None, "star_2": None, "star_3": None, "star_4": None, "star_5": None,
        "play_topics": {},
        "collection_date": TODAY
    }

    # Handle errors (e.g. Leafy 404 on Play Store)
    if gp.get("error"):
        gp_entry["overall_rating"] = None
        gp_entry["review_count"] = None
        gp_entry["ratings_count"] = None
        gp_entry["is_stale"] = True

    app_store_entries.append(gp_entry)
    app_store_entries.append(ios_entry)

with open("dashboard/public/api-static/app-store.json", "w") as f:
    json.dump({"data": app_store_entries}, f)

print(f"✅ Updated app-store.json with {len(app_store_entries)} entries")

# ── 2. Build updated overview.json ─────────────────────────────────────────
overview_operators = []
rank = 0

# Sort by composite score (avg of gp + ios ratings)
scored = []
for scraped_name, (op_id, canon_name, slug) in OPERATOR_MAP.items():
    gp = gp_data.get(scraped_name, {})
    ios = ios_data.get(scraped_name, {})

    gp_rating = round(gp["rating"], 2) if gp.get("rating") else None
    ios_rating = ios.get("rating")

    ratings = [r for r in [gp_rating, ios_rating] if r is not None]
    composite = round(sum(ratings) / len(ratings), 2) if ratings else 0

    scored.append({
        "id": op_id,
        "name": canon_name,
        "slug": slug,
        "composite_score": composite,
        "gp_rating": gp_rating,
        "ios_rating": ios_rating,
        "google_rating": None,
        "redbus_sentiment": None,
        "gp_review_count": gp.get("total_reviews"),
        "ios_review_count": None,
        "gp_ratings_count": gp.get("total_ratings"),
        "ios_ratings_count": ios.get("total_ratings"),
        "google_review_count": None,
        "redbus_review_count": None,
        "gp_delta": None,
        "ios_delta": None,
        "google_delta": None,
        "last_updated": TIMESTAMP,
    })

# Sort by composite descending
scored.sort(key=lambda x: x["composite_score"], reverse=True)
for i, op in enumerate(scored, 1):
    op["rank"] = i

with open("dashboard/public/api-static/overview.json", "w") as f:
    json.dump({"operators": scored}, f)

print(f"✅ Updated overview.json with {len(scored)} operators")

# ── 3. Update daily-snapshots.json ─────────────────────────────────────────
snapshots_path = "dashboard/public/api-static/daily-snapshots.json"
try:
    with open(snapshots_path) as f:
        snapshots = json.load(f)
except Exception:
    snapshots = {"generated_at": TIMESTAMP, "anchor_date": TODAY, "days": 35, "app_store": []}

# Remove existing entries for today if any to prevent duplicates
snapshots["app_store"] = [
    e for e in snapshots.get("app_store", [])
    if e.get("collection_date") != TODAY
]

# Append the new entries
for entry in app_store_entries:
    snapshots["app_store"].append(entry)

snapshots["anchor_date"] = TODAY
snapshots["generated_at"] = TIMESTAMP

with open(snapshots_path, "w") as f:
    json.dump(snapshots, f)

print(f"✅ Updated daily-snapshots.json with today's entries")

# Print summary
print("\n📊 Summary:")
for op in scored:
    print(f"  #{op['rank']} {op['name']}: GP={op['gp_rating']}, iOS={op['ios_rating']}, Composite={op['composite_score']}")

