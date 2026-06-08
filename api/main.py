"""
api/main.py

FastAPI application entry-point.

- Lifespan: verifies DB connectivity and starts the APScheduler cron job
  (28th of each month at 02:00 UTC).
- All business routes are mounted from api/routers/.
- /health endpoint for subsystem health checks.

Tasks covered: 9.1, 8.5
"""

from __future__ import annotations

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import structlog

logger = structlog.get_logger(__name__)


# ---------------------------------------------------------------------------
# Scheduler setup (task 8.5)
# ---------------------------------------------------------------------------

def _create_scheduler():
    from apscheduler.schedulers.asyncio import AsyncIOScheduler
    from apscheduler.triggers.cron import CronTrigger

    scheduler = AsyncIOScheduler()

    async def _scheduled_refresh():
        """APScheduler job: run the full refresh pipeline on a background thread."""
        import asyncio
        from scraper.db import get_session
        from aggregator.orchestrator import RefreshOrchestrator

        orch = RefreshOrchestrator(
            db_connection_factory=get_session,
            trigger_type="scheduled",
        )
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, orch.run)

    # Cron: 02:00 UTC on the 28th of every month
    scheduler.add_job(
        _scheduled_refresh,
        CronTrigger(day=28, hour=2, minute=0, timezone="UTC"),
        id="monthly_refresh",
        replace_existing=True,
    )
    return scheduler


_scheduler = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _scheduler

    # Verify DB connectivity
    try:
        from scraper.db import get_engine
        engine = get_engine()
        with engine.connect() as conn:
            from sqlalchemy import text
            conn.execute(text("SELECT 1"))
        logger.info("db_connectivity_ok")
    except Exception as exc:
        logger.error("db_connectivity_failed", error=str(exc))

    # Start scheduler (monthly refresh on the 28th; no live fetch on startup)
    _scheduler = _create_scheduler()
    _scheduler.start()
    logger.info("scheduler_started")

    yield

    # Shutdown
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("scheduler_stopped")


# ---------------------------------------------------------------------------
# App factory
# ---------------------------------------------------------------------------

def create_app() -> FastAPI:
    app = FastAPI(
        title="FreshBus Competitor Dashboard API",
        version="0.1.0",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Mount routers
    from api.routers import operators, metrics, reviews, history, refresh, export, health

    app.include_router(operators.router, prefix="/api/v1")
    app.include_router(metrics.router,   prefix="/api/v1")
    app.include_router(reviews.router,   prefix="/api/v1")
    app.include_router(history.router,   prefix="/api/v1")
    app.include_router(refresh.router,   prefix="/api/v1")
    app.include_router(export.router,    prefix="/api/v1")
    app.include_router(health.router)   # /health — no prefix

    return app


app = create_app()
