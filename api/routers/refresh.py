"""
GET  /api/v1/refresh/status  — last refresh timestamp + stale flags. Task 9.10
POST /api/v1/refresh/trigger — manual refresh. Task 9.11
"""
from __future__ import annotations
import os
from fastapi import APIRouter, Depends, HTTPException, Header, BackgroundTasks
from sqlalchemy import text
from typing import Optional
from api.deps import get_db

router = APIRouter(tags=["refresh"])


@router.get("/refresh/status")
def refresh_status(conn=Depends(get_db)):
    row = conn.execute(
        text(
            """
            SELECT id, triggered_at, completed_at, status, stale_sources
            FROM refresh_cycles
            ORDER BY triggered_at DESC
            LIMIT 1
            """
        )
    ).fetchone()

    if not row:
        return {"status": "no_cycles_run", "last_refresh": None, "stale_sources": []}

    return {
        "cycle_id": row[0],
        "triggered_at": row[1],
        "completed_at": row[2],
        "status": row[3],
        "stale_sources": row[4] or [],
    }


@router.post("/refresh/trigger")
def trigger_refresh(
    background_tasks: BackgroundTasks,
    source: Optional[str] = None,
    authorization: Optional[str] = Header(None),
):
    """Trigger a full or partial data refresh cycle."""
    admin_token = os.environ.get("ADMIN_TOKEN", "")
    if admin_token:
        if not authorization or authorization != f"Bearer {admin_token}":
            raise HTTPException(status_code=401, detail="Unauthorized")

    def _run():
        from scraper.db import get_session
        from aggregator.orchestrator import RefreshOrchestrator
        orch = RefreshOrchestrator(
            db_connection_factory=get_session,
            trigger_type="manual",
        )
        orch.run()

    background_tasks.add_task(_run)
    return {"message": "Refresh triggered", "source_filter": source}
