"""
GET /api/v1/reviews/top — top 5 positive/negative review excerpts. Task 9.8
"""
from __future__ import annotations
from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from api.deps import get_db

router = APIRouter(tags=["reviews"])


@router.get("/reviews/top")
def top_reviews(
    operator_slug: Optional[str] = Query(None),
    source: Optional[str] = Query(None),
    conn=Depends(get_db),
):
    """Return top 5 positive and top 5 negative reviews per operator per source."""
    params: dict = {}
    operator_filter = ""
    source_filter = ""

    if operator_slug:
        operator_filter = "AND o.slug = :slug"
        params["slug"] = operator_slug
    if source:
        source_filter = "AND r.source = :source"
        params["source"] = source

    # App store reviews
    app_rows = conn.execute(
        text(
            f"""
            SELECT o.slug, r.source, r.review_text, ss.score, ss.classification
            FROM app_store_reviews r
            JOIN operators o ON o.id = r.operator_id
            JOIN sentiment_scores ss ON ss.review_id = r.id AND ss.review_type = 'app_store'
            WHERE r.review_text IS NOT NULL
              AND ss.classification IN ('positive', 'negative')
              {operator_filter}
              {source_filter}
            ORDER BY ABS(ss.score) DESC
            """
        ),
        params,
    ).fetchall()

    # Google reviews
    google_params = {k: v for k, v in params.items() if k != "source"}
    google_rows = conn.execute(
        text(
            f"""
            SELECT o.slug, 'google_reviews' AS source, r.review_text, ss.score, ss.classification
            FROM google_reviews r
            JOIN operators o ON o.id = r.operator_id
            JOIN sentiment_scores ss ON ss.review_id = r.id AND ss.review_type = 'google'
            WHERE r.review_text IS NOT NULL
              AND ss.classification IN ('positive', 'negative')
              {operator_filter}
            ORDER BY ABS(ss.score) DESC
            """
        ),
        google_params,
    ).fetchall()

    all_rows = list(app_rows) + list(google_rows)

    # Group by (operator_slug, source)
    grouped: dict[tuple, dict] = {}
    for row in all_rows:
        key = (row[0], row[1])
        if key not in grouped:
            grouped[key] = {"positive": [], "negative": []}
        bucket = row[4]  # classification
        if bucket == "positive" and len(grouped[key]["positive"]) < 5:
            grouped[key]["positive"].append({"text": row[2], "score": row[3]})
        elif bucket == "negative" and len(grouped[key]["negative"]) < 5:
            grouped[key]["negative"].append({"text": row[2], "score": row[3]})

    return {
        "reviews": [
            {
                "operator_slug": k[0],
                "source": k[1],
                "top_positive": v["positive"],
                "top_negative": v["negative"],
            }
            for k, v in grouped.items()
        ]
    }
