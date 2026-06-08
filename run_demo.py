"""
run_demo.py — FreshBus Competitor Dashboard with LIVE data on startup.

Fetches real ratings from Google Play, Apple App Store (iTunes API),
Google Search, and optionally Redbus before serving the dashboard.

Run:
    python run_demo.py
    python run_demo.py --skip-redbus        # faster startup
    python run_demo.py --skip-google        # skip Playwright Google scrape
Then open: http://localhost:8000
"""

from __future__ import annotations

import argparse
import os
from datetime import datetime, timezone
from typing import Optional

import uvicorn
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles

from aggregator.live_bootstrap import (
    LIVE_CACHE,
    OPERATORS,
    ROUTES,
    bootstrap,
    get_cache,
    load_cache_from_disk,
)

# ── App ────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="FreshBus Competitor Dashboard (Live)",
    version="0.2.0",
    docs_url="/api/docs",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _cache():
    return get_cache()


def _op_by_slug(slug: str):
    return next((o for o in OPERATORS if o["slug"] == slug), None)


@app.get("/api/v1/operators")
def get_operators():
    return OPERATORS


@app.get("/api/v1/metrics/overview")
def metrics_overview():
    c = _cache()
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
        rs = None
        if op_cells:
            rs = round(sum(x["sentiment_score"] for x in op_cells) / len(op_cells), 3)

        gp_r = gp.get("overall_rating")
        ios_r = ios.get("overall_rating") if not ios.get("app_absent") else None
        gr_r = gr.get("overall_rating")
        ratings = [x for x in [gp_r, ios_r, gr_r] if x is not None]
        composite = round(sum(ratings) / len(ratings), 2) if ratings else None

        ts = gp.get("cycle_timestamp") or gr.get("cycle_timestamp") or c.get("completed_at")

        ops.append({
            **op,
            "composite_score": composite,
            "gp_rating": gp_r,
            "ios_rating": ios_r,
            "google_rating": gr_r,
            "redbus_sentiment": rs,
            "gp_review_count": gp.get("review_count"),
            "ios_review_count": ios.get("review_count") if not ios.get("app_absent") else None,
            "google_review_count": gr.get("review_count"),
            "redbus_review_count": sum(x.get("review_count") or 0 for x in op_cells) or None,
            "gp_delta": None,
            "ios_delta": None,
            "google_delta": None,
            "last_updated": ts,
            "rank": 0,
        })

    ops.sort(key=lambda x: x["composite_score"] or 0, reverse=True)
    for idx, op in enumerate(ops, 1):
        op["rank"] = idx
    return {"operators": ops}


@app.get("/api/v1/metrics/app-store")
def metrics_app_store():
    c = _cache()
    app_store = c.get("app_store") or {}
    data = []
    for op in OPERATORS:
        slug = op["slug"]
        for source in ["google_play", "ios_app_store"]:
            entry = app_store.get(slug, {}).get(source, {})
            if source == "ios_app_store" and entry.get("app_absent"):
                continue
            data.append({
                "operator_id": op["id"],
                "operator_name": op["name"],
                "operator_slug": slug,
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
    return {"data": data}


@app.get("/api/v1/metrics/google-reviews")
def metrics_google_reviews(
    from_date: Optional[str] = Query(None, alias="from"),
    to_date: Optional[str] = Query(None, alias="to"),
):
    c = _cache()
    google = c.get("google_reviews") or {}
    data = []
    for op in OPERATORS:
        entry = google.get(op["slug"], {})
        data.append({
            "operator_id": op["id"],
            "operator_name": op["name"],
            "operator_slug": op["slug"],
            "overall_rating": entry.get("overall_rating"),
            "review_count": entry.get("review_count"),
            "sentiment_score": entry.get("sentiment_score"),
            "positive_review_ratio": entry.get("positive_review_ratio"),
            "rating_delta_mom": entry.get("rating_delta_mom"),
            "cycle_timestamp": entry.get("cycle_timestamp") or c.get("completed_at"),
            "is_stale": entry.get("is_stale", False),
        })
    return {"data": data}


@app.get("/api/v1/metrics/redbus")
def metrics_redbus():
    cells = _cache().get("redbus_cells") or []
    if not cells:
        return {"data": [], "note": "Redbus data not fetched yet. Restart without --skip-redbus."}
    return {"data": cells}


@app.get("/api/v1/metrics/redbus/tags")
def metrics_redbus_tags(route_id: Optional[int] = Query(None)):
    c = _cache()
    if route_id is not None:
        redbus_reviews = c.get("redbus_reviews") or {}
        route_reviews = {}
        for op in OPERATORS:
            slug = op["slug"]
            op_reviews = redbus_reviews.get(slug, {})
            route_reviews[slug] = op_reviews.get(str(route_id)) or op_reviews.get(route_id, [])
        from aggregator.live_bootstrap import _build_tag_data
        return _build_tag_data(route_reviews)

    tags = c.get("redbus_tags")
    if tags:
        return tags
    from aggregator.live_bootstrap import _build_tag_data
    return _build_tag_data({op["slug"]: [] for op in OPERATORS})


from pydantic import BaseModel

class ChatRequest(BaseModel):
    message: str

@app.post("/api/v1/chat")
def chat_endpoint(req: ChatRequest):
    c = _cache()
    from aggregator.chat import handle_chat_query
    resp = handle_chat_query(req.message, c)
    return {"response": resp}


@app.get("/api/v1/metrics/review-classification/{source}")
def metrics_review_classification(source: str):
    valid = {"google_play", "ios_app_store", "google_reviews"}
    if source not in valid:
        raise HTTPException(status_code=400, detail=f"Invalid source. Choose from: {sorted(valid)}")
    c = _cache()
    all_cls = c.get("review_classification") or {}
    payload = all_cls.get(source)
    if payload:
        return {"source": source, **payload}
    from aggregator.live_bootstrap import REVIEW_DIMENSIONS, _build_review_classification
    empty = _build_review_classification({op["slug"]: [] for op in OPERATORS})
    return {"source": source, **empty}


@app.get("/api/v1/metrics/redbus/tags/{operator_slug}")
def metrics_redbus_tags_operator(operator_slug: str):
    op = _op_by_slug(operator_slug)
    if not op:
        raise HTTPException(status_code=404, detail="Operator not found")
    base = metrics_redbus_tags()
    op_data = next((o for o in base["operators"] if o["operator_slug"] == operator_slug), None)
    return {
        "operator": op,
        "tags": op_data["tags"] if op_data else [],
        "routes": [],
        "correlations": base.get("correlations", []),
    }


@app.get("/api/v1/metrics/redbus/{route_id}")
def metrics_redbus_route(route_id: int):
    route = next((r for r in ROUTES if r["id"] == route_id), None)
    if not route:
        raise HTTPException(status_code=404, detail="Route not found")

    cells = [c for c in (_cache().get("redbus_cells") or []) if c["route_id"] == route_id]
    ops_data = []
    for op in OPERATORS:
        cell = next((c for c in cells if c["operator_slug"] == op["slug"]), None)
        ops_data.append({
            "operator_id": op["id"],
            "operator_name": op["name"],
            "operator_slug": op["slug"],
            "sentiment_score": cell.get("sentiment_score") if cell else None,
            "overall_rating": cell.get("overall_rating") if cell else None,
            "review_count": cell.get("review_count") if cell else None,
            "competitive_rank": cell.get("competitive_rank") if cell else None,
            "sentiment_breakdown": {"positive_pct": 60.0, "neutral_pct": 20.0, "negative_pct": 20.0},
            "top_reviews": [],
        })
    return {"route": route, "operators": ops_data}


@app.get("/api/v1/reviews/top")
def top_reviews(
    operator_slug: Optional[str] = Query(None),
    source: Optional[str] = Query(None),
):
    reviews = _cache().get("top_reviews") or []
    filtered = []
    for group in reviews:
        if operator_slug and group["operator_slug"] != operator_slug:
            continue
        if source and group["source"] != source:
            continue
        filtered.append(group)
    return {"reviews": filtered}


@app.get("/api/v1/history/{source}")
def history(source: str):
    valid = {"google_play", "ios_app_store", "google_reviews", "redbus_overall"}
    if source not in valid:
        raise HTTPException(status_code=400, detail=f"Invalid source. Choose from: {sorted(valid)}")
    hist = _cache().get("history") or {}
    return {"source": source, "series": hist.get(source, [])}


@app.get("/api/v1/refresh/status")
def refresh_status():
    c = _cache()
    return {
        "cycle_id": 1,
        "status": c.get("status", "loading"),
        "fetch_phase": c.get("fetch_phase"),
        "operators_ready": c.get("operators_ready", 0),
        "last_error": c.get("last_error"),
        "triggered_at": c.get("triggered_at"),
        "completed_at": c.get("completed_at"),
        "stale_sources": c.get("stale_sources", []),
    }


_refresh_running = False


@app.post("/api/v1/refresh/trigger")
def trigger_refresh():
    global _refresh_running
    if _refresh_running or LIVE_CACHE.get("status") == "loading":
        return {"message": "Refresh already in progress — please wait."}

    skip_redbus = os.getenv("SKIP_REDBUS", "0") == "1"
    skip_google = os.getenv("SKIP_GOOGLE", "0") == "1"

    def _run():
        global _refresh_running
        _refresh_running = True
        try:
            bootstrap(skip_redbus=skip_redbus, skip_google=skip_google)
        finally:
            _refresh_running = False

    import threading
    threading.Thread(target=_run, daemon=True).start()
    return {"message": "Full data refresh started — may take several minutes."}


@app.get("/api/v1/export")
def export_data(
    operator: Optional[str] = Query(None),
    source: Optional[str] = Query(None),
    format: str = Query("csv"),
):
    import csv
    import io
    import json as _json

    overview = metrics_overview()["operators"]
    rows = []
    for op in overview:
        if operator and op["slug"] != operator:
            continue
        for src, rating_key in [
            ("google_play", "gp_rating"),
            ("ios_app_store", "ios_rating"),
            ("google_reviews", "google_rating"),
        ]:
            if source and src != source:
                continue
            rows.append({
                "operator": op["slug"],
                "source": src,
                "overall_rating": op.get(rating_key),
                "sentiment_score": op.get("redbus_sentiment") if src == "redbus_overall" else None,
                "cycle_timestamp": op.get("last_updated"),
            })

    if format == "json":
        return Response(
            content=_json.dumps(rows, indent=2),
            media_type="application/json",
            headers={"Content-Disposition": "attachment; filename=export.json"},
        )
    output = io.StringIO()
    if rows:
        writer = csv.DictWriter(output, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)
    output.seek(0)
    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=export.csv"},
    )


@app.get("/health")
def health():
    c = _cache()
    return JSONResponse(
        content={
            "status": "ok" if c.get("status") == "completed" else "loading",
            "subsystems": {
                "database": "live_cache",
                "scraper": c.get("fetch_phase"),
                "aggregator": c.get("status"),
            },
        },
        status_code=200,
    )


# ── Serve the React frontend ───────────────────────────────────────────────

DASHBOARD_DIST = os.path.join(os.path.dirname(__file__), "dashboard", "dist")

if os.path.isdir(DASHBOARD_DIST):
    app.mount("/assets", StaticFiles(directory=os.path.join(DASHBOARD_DIST, "assets")), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        index = os.path.join(DASHBOARD_DIST, "index.html")
        if os.path.exists(index):
            return HTMLResponse(open(index, encoding="utf-8").read())
        return HTMLResponse("<h1>Run <code>cd dashboard && npm run build</code> first</h1>")
else:
    @app.get("/", include_in_schema=False)
    async def root():
        return HTMLResponse("<h1>Build dashboard: cd dashboard && npm run build</h1>")


def _start_monthly_scheduler(skip_redbus: bool, skip_google: bool) -> None:
    try:
        from apscheduler.schedulers.background import BackgroundScheduler
        from apscheduler.triggers.cron import CronTrigger

        scheduler = BackgroundScheduler()

        def _monthly_job():
            print("\n  [scheduler] Monthly refresh (28th) starting…\n")
            bootstrap(skip_redbus=skip_redbus, skip_google=skip_google)

        scheduler.add_job(
            _monthly_job,
            CronTrigger(day=28, hour=2, minute=0, timezone="UTC"),
            id="monthly_refresh",
            replace_existing=True,
        )
        scheduler.start()
        print("  [scheduler] Auto-refresh scheduled for the 28th of each month (02:00 UTC).")
    except Exception as exc:
        print(f"  [scheduler] Could not start monthly scheduler: {exc}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="FreshBus Competitor Dashboard")
    parser.add_argument("--skip-redbus", action="store_true", help="Skip slow Redbus Playwright scrape")
    parser.add_argument("--skip-google", action="store_true", help="Skip Google Search Playwright scrape")
    parser.add_argument("--force-refresh", action="store_true", help="Fetch fresh data on startup")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()

    if args.skip_redbus:
        os.environ["SKIP_REDBUS"] = "1"
    if args.skip_google:
        os.environ["SKIP_GOOGLE"] = "1"

    print("\n" + "=" * 60)
    print("  FreshBus Competitor Dashboard")
    print("=" * 60)

    if args.force_refresh:
        print("  Force refresh — fetching all sources now…")
        bootstrap(skip_redbus=args.skip_redbus, skip_google=args.skip_google)
    elif load_cache_from_disk():
        print("  Loaded cached dashboard data (use Refresh button or --force-refresh to update).")
    else:
        print("  No cache found — running initial data fetch…")
        bootstrap(skip_redbus=args.skip_redbus, skip_google=args.skip_google)

    _start_monthly_scheduler(skip_redbus=args.skip_redbus, skip_google=args.skip_google)

    print("=" * 60)
    print(f"  Dashboard : http://localhost:{args.port}")
    print(f"  API docs  : http://localhost:{args.port}/api/docs")
    print("=" * 60 + "\n")

    uvicorn.run("run_demo:app", host="0.0.0.0", port=args.port, reload=False)
