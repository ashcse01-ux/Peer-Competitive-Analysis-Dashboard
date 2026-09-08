"""
api/main.py

FastAPI application entry-point.

- Lifespan: verifies DB connectivity (no fixed SRP cron — Sync is on-demand).
- All business routes are mounted from api/routers/.
- /health endpoint for subsystem health checks.

Tasks covered: 9.1, 8.5
"""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import structlog

logger = structlog.get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        from scraper.db import get_engine
        engine = get_engine()
        with engine.connect() as conn:
            from sqlalchemy import text
            conn.execute(text("SELECT 1"))
        logger.info("db_connectivity_ok")
    except Exception as exc:
        logger.error("db_connectivity_failed", error=str(exc))

    logger.info("api_started", note="Redbus SRP sync is on-demand via POST /api/v1/refresh/redbus-srp/sync")
    yield
    logger.info("api_stopped")


def create_app() -> FastAPI:
    app = FastAPI(
        title="FreshBus Competitor Dashboard API",
        version="0.2.0",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    from api.routers import operators, metrics, reviews, history, refresh, export, health

    app.include_router(operators.router, prefix="/api/v1")
    app.include_router(metrics.router,   prefix="/api/v1")
    app.include_router(reviews.router,   prefix="/api/v1")
    app.include_router(history.router,   prefix="/api/v1")
    app.include_router(refresh.router,   prefix="/api/v1")
    app.include_router(export.router,    prefix="/api/v1")
    app.include_router(health.router)

    return app


app = create_app()
