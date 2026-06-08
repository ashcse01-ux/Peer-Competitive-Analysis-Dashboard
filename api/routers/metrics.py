"""
Metrics endpoints. Tasks 9.3 – 9.7
"""
from __future__ import annotations
from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from api.deps import get_db

router = APIRouter(tags=["metrics"])


# ---------------------------------------------------------------------------
# GET /api/v1/metrics/overview  (task 9.3)
# ---------------------------------------------------------------------------
@router.get("/metrics/overview")
def metrics_overview(conn=Depends(get_db)):
    """KPI cards + leaderboard for all 6 operators."""
    rows = conn.execute(
        text(
            """
            SELECT
                o.id,
                o.name,
                o.slug,
                MAX(CASE WHEN om.source = 'google_play'    THEN om.overall_rating END) AS gp_rating,
                MAX(CASE WHEN om.source = 'ios_app_store'  THEN om.overall_rating END) AS ios_rating,
                MAX(CASE WHEN om.source = 'google_reviews' THEN om.overall_rating END) AS google_rating,
                MAX(CASE WHEN om.source = 'redbus_overall' THEN om.sentiment_score END) AS redbus_sentiment,
                MAX(CASE WHEN om.source = 'google_play'    THEN om.rating_delta_mom END) AS gp_delta,
                MAX(CASE WHEN om.source = 'ios_app_store'  THEN om.rating_delta_mom END) AS ios_delta,
                MAX(CASE WHEN om.source = 'google_reviews' THEN om.rating_delta_mom END) AS google_delta,
                MAX(om.cycle_timestamp) AS last_updated
            FROM operators o
            LEFT JOIN LATERAL (
                SELECT * FROM operator_metrics
                WHERE operator_id = o.id
                ORDER BY cycle_timestamp DESC
                LIMIT 20
            ) om ON TRUE
            GROUP BY o.id, o.name, o.slug
            ORDER BY o.name
            """
        )
    ).fetchall()

    operators = []
    for r in rows:
        ratings = [x for x in [r[3], r[4], r[5]] if x is not None]
        composite = round(sum(ratings) / len(ratings), 3) if ratings else None
        operators.append({
            "id": r[0], "name": r[1], "slug": r[2],
            "composite_score": composite,
            "gp_rating": r[3], "ios_rating": r[4],
            "google_rating": r[5], "redbus_sentiment": r[6],
            "gp_delta": r[7], "ios_delta": r[8], "google_delta": r[9],
            "last_updated": r[10],
        })

    operators.sort(key=lambda x: x["composite_score"] or 0, reverse=True)
    for i, op in enumerate(operators, 1):
        op["rank"] = i
    return {"operators": operators}


# ---------------------------------------------------------------------------
# GET /api/v1/metrics/app-store  (task 9.4)
# ---------------------------------------------------------------------------
@router.get("/metrics/app-store")
def metrics_app_store(conn=Depends(get_db)):
    rows = conn.execute(
        text(
            """
            SELECT
                o.id, o.name, o.slug, om.source,
                om.overall_rating, om.sentiment_score,
                om.positive_review_ratio, om.rating_delta_mom,
                om.cycle_timestamp, om.is_stale
            FROM operators o
            JOIN LATERAL (
                SELECT * FROM operator_metrics
                WHERE operator_id = o.id
                  AND source IN ('google_play', 'ios_app_store')
                ORDER BY cycle_timestamp DESC
                LIMIT 2
            ) om ON TRUE
            ORDER BY o.name, om.source
            """
        )
    ).fetchall()

    return {
        "data": [
            {
                "operator_id": r[0], "operator_name": r[1], "operator_slug": r[2],
                "source": r[3], "overall_rating": r[4], "sentiment_score": r[5],
                "positive_review_ratio": r[6], "rating_delta_mom": r[7],
                "cycle_timestamp": r[8], "is_stale": r[9],
            }
            for r in rows
        ]
    }


# ---------------------------------------------------------------------------
# GET /api/v1/metrics/google-reviews  (task 9.5)
# ---------------------------------------------------------------------------
@router.get("/metrics/google-reviews")
def metrics_google_reviews(
    from_date: Optional[str] = Query(None, alias="from"),
    to_date: Optional[str] = Query(None, alias="to"),
    conn=Depends(get_db),
):
    params: dict = {}
    date_filter = ""
    if from_date:
        date_filter += " AND om.cycle_timestamp >= :from_date"
        params["from_date"] = from_date
    if to_date:
        date_filter += " AND om.cycle_timestamp <= :to_date"
        params["to_date"] = to_date

    rows = conn.execute(
        text(
            f"""
            SELECT
                o.id, o.name, o.slug,
                om.overall_rating, om.sentiment_score,
                om.rating_delta_mom, om.cycle_timestamp, om.is_stale
            FROM operators o
            JOIN LATERAL (
                SELECT * FROM operator_metrics
                WHERE operator_id = o.id
                  AND source = 'google_reviews'
                  {date_filter}
                ORDER BY cycle_timestamp DESC
                LIMIT 1
            ) om ON TRUE
            ORDER BY o.name
            """
        ),
        params,
    ).fetchall()

    return {
        "data": [
            {
                "operator_id": r[0], "operator_name": r[1], "operator_slug": r[2],
                "overall_rating": r[3], "sentiment_score": r[4],
                "rating_delta_mom": r[5], "cycle_timestamp": r[6], "is_stale": r[7],
            }
            for r in rows
        ]
    }


# ---------------------------------------------------------------------------
# GET /api/v1/metrics/redbus  (task 9.6)
# ---------------------------------------------------------------------------
@router.get("/metrics/redbus")
def metrics_redbus(conn=Depends(get_db)):
    """22×6 heatmap: sentiment + review count per route × operator."""
    rows = conn.execute(
        text(
            """
            SELECT
                o.id AS operator_id, o.name AS operator_name, o.slug,
                r.id AS route_id, r.origin, r.destination,
                rm.sentiment_score, rm.review_count, rm.competitive_rank,
                rm.is_stale, rm.cycle_timestamp
            FROM operators o
            CROSS JOIN routes r
            LEFT JOIN LATERAL (
                SELECT * FROM route_metrics
                WHERE operator_id = o.id AND route_id = r.id
                ORDER BY cycle_timestamp DESC
                LIMIT 1
            ) rm ON TRUE
            ORDER BY r.origin, r.destination, o.name
            """
        )
    ).fetchall()

    return {
        "data": [
            {
                "operator_id": r[0], "operator_name": r[1], "operator_slug": r[2],
                "route_id": r[3], "origin": r[4], "destination": r[5],
                "sentiment_score": r[6], "review_count": r[7],
                "competitive_rank": r[8], "is_stale": r[9],
                "cycle_timestamp": r[10],
            }
            for r in rows
        ]
    }


# ---------------------------------------------------------------------------
# GET /api/v1/metrics/redbus/{route_id}  (task 9.7)
# ---------------------------------------------------------------------------
@router.get("/metrics/redbus/{route_id}")
def metrics_redbus_route(route_id: int, conn=Depends(get_db)):
    """Drill-down: top 10 reviews, sentiment breakdown, rank for one route."""
    # Route info
    route = conn.execute(
        text("SELECT id, origin, destination FROM routes WHERE id = :id"),
        {"id": route_id},
    ).fetchone()
    if not route:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Route not found")

    operators = []
    op_rows = conn.execute(
        text("SELECT id, name, slug FROM operators ORDER BY name")
    ).fetchall()

    for op in op_rows:
        # Latest metrics
        metric = conn.execute(
            text(
                """
                SELECT sentiment_score, review_count, competitive_rank
                FROM route_metrics
                WHERE operator_id = :op_id AND route_id = :route_id
                ORDER BY cycle_timestamp DESC LIMIT 1
                """
            ),
            {"op_id": op[0], "route_id": route_id},
        ).fetchone()

        # Top 10 reviews
        reviews = conn.execute(
            text(
                """
                SELECT r.review_text, r.star_rating, ss.score, ss.classification
                FROM redbus_reviews r
                JOIN sentiment_scores ss ON ss.review_id = r.id AND ss.review_type = 'redbus'
                WHERE r.operator_id = :op_id AND r.route_id = :route_id
                  AND r.review_text IS NOT NULL
                ORDER BY ABS(COALESCE(ss.score, 0)) DESC
                LIMIT 10
                """
            ),
            {"op_id": op[0], "route_id": route_id},
        ).fetchall()

        # Sentiment breakdown
        breakdown = conn.execute(
            text(
                """
                SELECT
                    COUNT(*) FILTER (WHERE ss.classification = 'positive')  AS pos,
                    COUNT(*) FILTER (WHERE ss.classification = 'neutral')   AS neu,
                    COUNT(*) FILTER (WHERE ss.classification = 'negative')  AS neg,
                    COUNT(*) AS total
                FROM redbus_reviews r
                JOIN sentiment_scores ss ON ss.review_id = r.id AND ss.review_type = 'redbus'
                WHERE r.operator_id = :op_id AND r.route_id = :route_id
                """
            ),
            {"op_id": op[0], "route_id": route_id},
        ).fetchone()

        total = breakdown[3] or 1
        operators.append({
            "operator_id": op[0], "operator_name": op[1], "operator_slug": op[2],
            "sentiment_score": metric[0] if metric else None,
            "review_count": metric[1] if metric else None,
            "competitive_rank": metric[2] if metric else None,
            "sentiment_breakdown": {
                "positive_pct": round((breakdown[0] or 0) / total * 100, 1),
                "neutral_pct":  round((breakdown[1] or 0) / total * 100, 1),
                "negative_pct": round((breakdown[2] or 0) / total * 100, 1),
            },
            "top_reviews": [
                {"text": rv[0], "star_rating": rv[1], "score": rv[2], "classification": rv[3]}
                for rv in reviews
            ],
        })

    return {
        "route": {"id": route[0], "origin": route[1], "destination": route[2]},
        "operators": operators,
    }
