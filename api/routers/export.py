"""
GET /api/v1/export — CSV/JSON export. Task 9.12
"""
from __future__ import annotations
import csv
import io
import json
from typing import Optional
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import text
from api.deps import get_db

router = APIRouter(tags=["export"])

VALID_SOURCES = {
    "google_play", "ios_app_store", "google_reviews", "redbus_overall"
}


@router.get("/export")
def export_data(
    operator: Optional[str] = Query(None, description="Operator slug"),
    source: Optional[str] = Query(None, description="Source name"),
    from_date: Optional[str] = Query(None, alias="from"),
    to_date: Optional[str] = Query(None, alias="to"),
    format: str = Query("csv", description="csv or json"),
    conn=Depends(get_db),
):
    params: dict = {}
    filters = []

    if operator:
        filters.append("o.slug = :operator")
        params["operator"] = operator
    if source and source in VALID_SOURCES:
        filters.append("om.source = :source")
        params["source"] = source
    if from_date:
        filters.append("om.cycle_timestamp >= :from_date")
        params["from_date"] = from_date
    if to_date:
        filters.append("om.cycle_timestamp <= :to_date")
        params["to_date"] = to_date

    where = ("WHERE " + " AND ".join(filters)) if filters else ""

    rows = conn.execute(
        text(
            f"""
            SELECT
                o.name, o.slug, om.source,
                om.cycle_timestamp, om.overall_rating,
                om.sentiment_score, om.positive_review_ratio,
                om.rating_delta_mom, om.is_stale
            FROM operator_metrics om
            JOIN operators o ON o.id = om.operator_id
            {where}
            ORDER BY om.cycle_timestamp DESC, o.name
            """
        ),
        params,
    ).fetchall()

    columns = [
        "operator_name", "operator_slug", "source", "cycle_timestamp",
        "overall_rating", "sentiment_score", "positive_review_ratio",
        "rating_delta_mom", "is_stale",
    ]

    if format == "json":
        data = [dict(zip(columns, r)) for r in rows]
        # Serialize datetime objects
        for item in data:
            for k, v in item.items():
                if hasattr(v, "isoformat"):
                    item[k] = v.isoformat()
        return StreamingResponse(
            io.StringIO(json.dumps(data, indent=2)),
            media_type="application/json",
            headers={"Content-Disposition": "attachment; filename=export.json"},
        )

    # Default: CSV
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=columns)
    writer.writeheader()
    for row in rows:
        record = dict(zip(columns, row))
        for k, v in record.items():
            if hasattr(v, "isoformat"):
                record[k] = v.isoformat()
        writer.writerow(record)

    output.seek(0)
    return StreamingResponse(
        output,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=export.csv"},
    )
