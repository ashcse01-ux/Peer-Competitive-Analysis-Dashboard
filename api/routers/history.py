"""
GET /api/v1/history/{source} — monthly time-series data. Task 9.9
"""
from fastapi import APIRouter, Depends, Path
from sqlalchemy import text
from api.deps import get_db

router = APIRouter(tags=["history"])

VALID_SOURCES = {
    "google_play", "ios_app_store", "google_reviews", "redbus_overall"
}


@router.get("/history/{source}")
def history(
    source: str = Path(..., description="One of: google_play, ios_app_store, google_reviews, redbus_overall"),
    conn=Depends(get_db),
):
    if source not in VALID_SOURCES:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail=f"Invalid source. Choose from: {sorted(VALID_SOURCES)}")

    rows = conn.execute(
        text(
            """
            SELECT
                o.name AS operator_name,
                o.slug,
                DATE_TRUNC('month', om.cycle_timestamp) AS month,
                AVG(om.sentiment_score)   AS avg_sentiment,
                AVG(om.overall_rating)    AS avg_rating
            FROM operator_metrics om
            JOIN operators o ON o.id = om.operator_id
            WHERE om.source = :source
            GROUP BY o.name, o.slug, DATE_TRUNC('month', om.cycle_timestamp)
            ORDER BY month, o.name
            """
        ),
        {"source": source},
    ).fetchall()

    return {
        "source": source,
        "series": [
            {
                "operator_name": r[0],
                "operator_slug": r[1],
                "month": r[2].isoformat() if r[2] else None,
                "avg_sentiment": r[3],
                "avg_rating": r[4],
            }
            for r in rows
        ],
    }
