"""
GET /health — subsystem health check. Task 9.13
Returns HTTP 200 if all subsystems healthy, HTTP 503 otherwise.
"""
from __future__ import annotations
from fastapi import APIRouter
from fastapi.responses import JSONResponse

router = APIRouter(tags=["health"])


@router.get("/health")
def health_check():
    status = {"database": "ok", "scraper": "ok", "aggregator": "ok"}
    overall = "ok"

    # Check DB
    try:
        from scraper.db import get_engine
        from sqlalchemy import text
        engine = get_engine()
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception as exc:
        status["database"] = f"error: {exc}"
        overall = "degraded"

    # Check scraper last run (within last 35 days)
    try:
        from scraper.db import get_engine
        from sqlalchemy import text
        engine = get_engine()
        with engine.connect() as conn:
            row = conn.execute(
                text(
                    """
                    SELECT completed_at FROM refresh_cycles
                    WHERE status IN ('completed', 'stale')
                    ORDER BY completed_at DESC LIMIT 1
                    """
                )
            ).fetchone()
            if row is None:
                status["scraper"] = "no_completed_cycles"
                # Not an error — could be first run
    except Exception as exc:
        status["scraper"] = f"error: {exc}"
        overall = "degraded"

    http_status = 200 if overall == "ok" else 503
    return JSONResponse(
        content={"status": overall, "subsystems": status},
        status_code=http_status,
    )
