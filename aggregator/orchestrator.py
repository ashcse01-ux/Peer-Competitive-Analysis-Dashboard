"""
aggregator/orchestrator.py

RefreshOrchestrator — runs the full Scraper → Aggregator pipeline and
records the cycle status in the refresh_cycles table.

Cycle lifecycle:
  1. INSERT refresh_cycles row with status='running'
  2. Run all three scrapers (app store, google reviews, redbus)
  3. Run SentimentEngine.score_and_save for all new reviews
  4. Run MetricsCalculator for all three sources
  5. Update refresh_cycles row:
     - status='completed' if no stale flags
     - status='stale'     if any stale flags, populate stale_sources JSON array

The orchestrator is attached to APScheduler (CronTrigger 0 2 1 * *) by the
FastAPI application; it can also be triggered manually via the API.

Tasks covered: 8.1 – 8.5
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

import structlog

__all__ = ["RefreshOrchestrator"]

logger = structlog.get_logger(__name__)


class RefreshOrchestrator:
    """Orchestrates the full data refresh pipeline.

    Parameters
    ----------
    db_connection_factory:
        Zero-argument callable that returns an open SQLAlchemy connection
        context manager (i.e. ``scraper.db.get_session``).
    trigger_type:
        ``"scheduled"`` or ``"manual"``.
    """

    def __init__(
        self,
        db_connection_factory: Any,
        trigger_type: str = "scheduled",
    ) -> None:
        self._db_factory = db_connection_factory
        self.trigger_type = trigger_type

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def run(self) -> dict:
        """Execute the complete refresh pipeline.

        Returns
        -------
        dict
            ``{"cycle_id": int, "status": str, "stale_sources": list}``
        """
        triggered_at = datetime.now(tz=timezone.utc)
        stale_sources: list[str] = []

        with self._db_factory() as conn:
            cycle_id = self._start_cycle(conn, triggered_at)
            logger.info(
                "refresh_cycle_started",
                cycle_id=cycle_id,
                trigger_type=self.trigger_type,
            )

            try:
                # ---- Step 1: Scrape ----------------------------------------
                stale_sources.extend(
                    self._run_scraper(conn)
                )

                # ---- Step 2: Score sentiments ------------------------------
                model_version = self._run_sentiment_scoring(conn)

                # ---- Step 3: Compute metrics --------------------------------
                self._run_metrics(conn, model_version)

                # ---- Step 4: Finalise cycle record -------------------------
                status = "stale" if stale_sources else "completed"
                completed_at = datetime.now(tz=timezone.utc)
                self._finish_cycle(conn, cycle_id, status, stale_sources, completed_at)

            except Exception as exc:
                logger.error(
                    "refresh_cycle_failed",
                    cycle_id=cycle_id,
                    error=str(exc),
                )
                self._finish_cycle(
                    conn,
                    cycle_id,
                    "failed",
                    stale_sources,
                    datetime.now(tz=timezone.utc),
                )
                raise

        logger.info(
            "refresh_cycle_finished",
            cycle_id=cycle_id,
            status=status,
            stale_count=len(stale_sources),
        )
        return {
            "cycle_id": cycle_id,
            "status": status,
            "stale_sources": stale_sources,
        }

    # ------------------------------------------------------------------
    # Private pipeline steps
    # ------------------------------------------------------------------

    def _run_scraper(self, conn: Any) -> list[str]:
        """Run all three scrapers and return list of stale operator-source strings."""
        from scraper.collectors.app_store import AppStoreCollector
        from scraper.collectors.google_reviews import GoogleReviewsCollector
        from scraper.collectors.redbus import RedbusCollector, CaptchaDetected

        stale: list[str] = []

        # App store
        app_result = AppStoreCollector(db_connection=conn).collect_all()
        stale.extend(app_result.get("stale_operators", []))

        # Google reviews
        google_result = GoogleReviewsCollector(db_connection=conn).collect_all()
        stale.extend(
            [f"google:{s}" for s in google_result.get("stale_operators", [])]
        )

        # Redbus
        try:
            redbus_result = RedbusCollector(db_connection=conn).collect_all()
            stale_count = redbus_result.get("stale", 0)
            if stale_count:
                stale.append(f"redbus:{stale_count}_combinations_stale")
        except CaptchaDetected:
            logger.warning("refresh_redbus_captcha_paused")
            stale.append("redbus:captcha_detected")

        return stale

    def _run_sentiment_scoring(self, conn: Any) -> str:
        """Score all un-scored reviews and return the model version used."""
        import os
        from aggregator.sentiment import SentimentEngine, MODEL_NAME_DEFAULT

        model_name = os.environ.get("NLP_MODEL_NAME", MODEL_NAME_DEFAULT)
        engine = SentimentEngine(model_name=model_name, db_connection=conn)

        # Recompute all historical scores if model version changed
        engine.recompute_all_if_model_changed(conn)

        # Score any new reviews not yet in sentiment_scores
        for review_type, table in [
            ("app_store", "app_store_reviews"),
            ("google", "google_reviews"),
            ("redbus", "redbus_reviews"),
        ]:
            self._score_new_reviews(conn, engine, review_type, table)

        return model_name

    def _score_new_reviews(
        self,
        conn: Any,
        engine: Any,
        review_type: str,
        table: str,
    ) -> None:
        from sqlalchemy import text

        rows = conn.execute(
            text(
                f"""
                SELECT r.id, r.review_text
                FROM   {table} r
                WHERE  NOT EXISTS (
                    SELECT 1 FROM sentiment_scores ss
                    WHERE  ss.review_id   = r.id
                      AND  ss.review_type = :review_type
                )
                  AND  r.review_text IS NOT NULL
                """
            ),
            {"review_type": review_type},
        ).fetchall()

        if not rows:
            return

        ids = [r[0] for r in rows]
        texts = [r[1] for r in rows]
        engine.score_and_save(review_type, ids, texts, conn)
        logger.info(
            "new_reviews_scored",
            review_type=review_type,
            count=len(ids),
        )

    def _run_metrics(self, conn: Any, model_version: str) -> None:
        from aggregator.metrics import MetricsCalculator

        calc = MetricsCalculator(
            db_connection=conn,
            model_version=model_version,
        )
        calc.compute_app_store()
        calc.compute_google()
        calc.compute_redbus()

    # ------------------------------------------------------------------
    # Private — DB helpers
    # ------------------------------------------------------------------

    def _start_cycle(self, conn: Any, triggered_at: datetime) -> int:
        from sqlalchemy import text

        row = conn.execute(
            text(
                """
                INSERT INTO refresh_cycles
                    (triggered_at, trigger_type, status, stale_sources)
                VALUES
                    (:triggered_at, :trigger_type, 'running', '[]'::jsonb)
                RETURNING id
                """
            ),
            {
                "triggered_at": triggered_at,
                "trigger_type": self.trigger_type,
            },
        ).fetchone()
        return int(row[0])

    def _finish_cycle(
        self,
        conn: Any,
        cycle_id: int,
        status: str,
        stale_sources: list[str],
        completed_at: datetime,
    ) -> None:
        from sqlalchemy import text

        conn.execute(
            text(
                """
                UPDATE refresh_cycles
                SET    status        = :status,
                       completed_at  = :completed_at,
                       stale_sources = :stale_sources
                WHERE  id = :cycle_id
                """
            ),
            {
                "cycle_id": cycle_id,
                "status": status,
                "completed_at": completed_at,
                "stale_sources": json.dumps(stale_sources),
            },
        )
