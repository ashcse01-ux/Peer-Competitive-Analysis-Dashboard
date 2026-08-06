import json
import datetime
from google_play_scraper import app

# Mapping of operators to their package IDs
OPERATORS = {
    "freshbus": "com.freshbus.app",
    "zingbus": "com.zingbusbtoc.zingbus",
    "intrcity Smartbus": "bus.tickets.intrcity",
    "Leafy": "com.leafybus.app",
    "Neugo": "com.gcm.nuego",
    "Flixbus": "de.flixbus.app"
}

def main():
    today = datetime.datetime.now().strftime("%Y-%m-%d")
    results = {}

    print(f"Scraping Google Play Store ratings for {today}...")

    for name, package_id in OPERATORS.items():
        try:
            print(f"  Fetching details for {name} ({package_id})...")
            info = app(
                package_id,
                lang='en',
                country='in'
            )
            
            # Extract metrics
            results[name] = {
                "package_id": package_id,
                "app_title": info.get("title"),
                "rating": info.get("score"),
                "total_ratings": info.get("ratings"),
                "total_reviews": info.get("reviews"),
                "scraped_at": today
            }
            print(f"    Success: {info.get('score')} stars, {info.get('ratings')} ratings, {info.get('reviews')} reviews.")
        except Exception as e:
            print(f"    Failed to fetch {name}: {str(e)}")
            results[name] = {
                "package_id": package_id,
                "error": str(e),
                "scraped_at": today
            }

    # Save to JSON
    output_file = "google_play_today.json"
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump({"date": today, "operators": results}, f, indent=2)

    print(f"\n✅ Scraping completed. Results stored in: {output_file}\n")

if __name__ == "__main__":
    main()
