"""
aggregator/metrics.py

MetricsCalculator — computes derived metrics from raw sentiment scores and
writes them to the operator_metrics and route_metrics tables.

Metrics computed:
  - Per operator per source: mean sentiment score, positive review ratio,
    month-over-month rating delta
  - Per route direction per operator: sentiment score, review count, competitive
    rank (1 = best sentiment)
  - FreshBus average sentiment vs cross-operator mean across all route directions

All writes APPEND new rows (never overwrite) — historical records are preserved.

SLAs (soft — log warning, do not fail):
  App Store metrics  → within 15 minutes of ingestion completion
  Route metrics      → within 20 minutes of ingestion completion

Tasks covered: 7.1 – 7.7
"""

from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Any

import structlog

__all__ = ["MetricsCalculator"]

logger = structlog.get_logger(__name__)

_APP_STORE_SLA_SECONDS = 15 * 60   # 15 minutes
_ROUTE_SLA_SECONDS = 20 * 60       # 20 minutes


# ---------------------------------------------------------------------------
# MetricsCalculator
# ---------------------------------------------------------------------------


class MetricsCalculator:
    """Compute and persist all aggregated metrics from a completed scrape cycle.

    Parameters
    ----------
    db_connection:
        Open SQLAlchemy connection (inside a transaction).
    model_version:
        The NLP model identifier used for the current cycle's sentiment scores.
    cycle_timestamp:
        UTC timestamp representing this refresh cycle; used as the
        ``cycle_timestamp`` in all metrics rows.
    """

    def __init__(
        self,
        db_connection: Any,
        model_version: str,
        cycle_timestamp: datetime | None = None,
    ) -> None:
        self._conn = db_connection
        self.model_version = model_version
        self.cycle_timestamp = cycle_timestamp or datetime.now(tz=timezone.utc)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def compute_app_store(self) -> dict:
        """Compute and save app-store metrics for all operators.

        Covers both Google Play and iOS App Store sources.
        Logs a WARNING if computation takes longer than 15 minutes.

        Returns
        -------
        dict
            ``{"rows_written": int}``
        """
        t0 = time.monotonic()
        rows = self._compute_app_store_metrics()
        elapsed = time.monotonic() - t0

        if elapsed > _APP_STORE_SLA_SECONDS:
            logger.warning(
                "app_store_metrics_sla_exceeded",
                elapsed_seconds=round(elapsed),
                sla_seconds=_APP_STORE_SLA_SECONDS,
            )

        logger.info("app_store_metrics_computed", rows_written=rows)
        return {"rows_written": rows}

    def compute_google(self) -> dict:
        """Compute and save Google Reviews metrics for all operators.

        Returns
        -------
        dict
            ``{"rows_written": int}``
        """
        rows = self._compute_google_metrics()
        logger.info("google_metrics_computed", rows_written=rows)
        return {"rows_written": rows}

    def compute_redbus(self) -> dict:
        """Compute and save route-level Redbus metrics for all operator×route pairs.

        Logs a WARNING if computation takes longer than 20 minutes.

        Returns
        -------
        dict
            ``{"rows_written": int, "freshbus_vs_mean": dict}``
        """
        t0 = time.monotonic()
        rows, freshbus_vs_mean = self._compute_route_metrics()
        elapsed = time.monotonic() - t0

        if elapsed > _ROUTE_SLA_SECONDS:
            logger.warning(
                "route_metrics_sla_exceeded",
                elapsed_seconds=round(elapsed),
                sla_seconds=_ROUTE_SLA_SECONDS,
            )

        logger.info(
            "route_metrics_computed",
            rows_written=rows,
            freshbus_avg=freshbus_vs_mean.get("freshbus_avg"),
            cross_operator_avg=freshbus_vs_mean.get("cross_operator_avg"),
        )
        return {"rows_written": rows, "freshbus_vs_mean": freshbus_vs_mean}

    # ------------------------------------------------------------------
    # Private — App Store
    # ------------------------------------------------------------------

    def _compute_app_store_metrics(self) -> int:
        """Compute metrics for google_play and ios_app_store sources."""
        from sqlalchemy import text

        rows_written = 0
        for source in ("google_play", "ios_app_store"):
            # Fetch the latest snapshot id per operator for this source
            snapshots = self._conn.execute(
                text(
                    """
                    SELECT DISTINCT ON (operator_id)
                           operator_id,
                           id AS snapshot_id,
                           overall_rating,
                           collected_at
                    FROM   app_store_snapshots
                    WHERE  source = :source
                    ORDER  BY operator_id, collected_at DESC
                    """
                ),
                {"source": source},
            ).fetchall()

            for snap in snapshots:
                operator_id = snap[0]
                snapshot_id = snap[1]
                overall_rating = snap[2]

                # Mean sentiment from sentiment_scores for this snapshot's reviews
                sentiment_score = self._mean_sentiment_for_app_store(
                    operator_id, source
                )

                # Positive review ratio
                positive_ratio = self._positive_ratio_for_app_store(
                    operator_id, source
                )

                # MoM rating delta
                rating_delta = self._mom_rating_delta_app_store(
                    operator_id, source, overall_rating
                )

                self._insert_operator_metric(
                    operator_id=operator_id,
                    source=source,
                    overall_rating=overall_rating,
                    sentiment_score=sentiment_score,
                    positive_review_ratio=positive_ratio,
                    rating_delta_mom=rating_delta,
                )
                rows_written += 1

        return rows_written

    def _mean_sentiment_for_app_store(
        self, operator_id: int, source: str
    ) -> float | None:
        from sqlalchemy import text

        row = self._conn.execute(
            text(
                """
                SELECT AVG(ss.score)
                FROM   sentiment_scores ss
                JOIN   app_store_reviews r ON r.id = ss.review_id
                WHERE  ss.review_type = 'app_store'
                  AND  r.operator_id  = :operator_id
                  AND  r.source       = :source
                  AND  ss.score       IS NOT NULL
                  AND  ss.model_version = :model_version
                """
            ),
            {
                "operator_id": operator_id,
                "source": source,
                "model_version": self.model_version,
            },
        ).fetchone()
        return float(row[0]) if row and row[0] is not None else None

    def _positive_ratio_for_app_store(
        self, operator_id: int, source: str
    ) -> float | None:
        from sqlalchemy import text

        row = self._conn.execute(
            text(
                """
                SELECT
                    COUNT(*) FILTER (WHERE ss.classification = 'positive')::float
                    / NULLIF(COUNT(*), 0)
                FROM   sentiment_scores ss
                JOIN   app_store_reviews r ON r.id = ss.review_id
                WHERE  ss.review_type = 'app_store'
                  AND  r.operator_id  = :operator_id
                  AND  r.source       = :source
                  AND  ss.model_version = :model_version
                """
            ),
            {
                "operator_id": operator_id,
                "source": source,
                "model_version": self.model_version,
            },
        ).fetchone()
        return float(row[0]) if row and row[0] is not None else None

    def _mom_rating_delta_app_store(
        self, operator_id: int, source: str, current_rating: float | None
    ) -> float | None:
        """MoM delta = current rating minus the previous cycle's rating."""
        if current_rating is None:
            return None
        from sqlalchemy import text

        row = self._conn.execute(
            text(
                """
                SELECT overall_rating
                FROM   operator_metrics
                WHERE  operator_id = :operator_id
                  AND  source      = :source
                ORDER  BY cycle_timestamp DESC
                LIMIT  1
                """
            ),
            {"operator_id": operator_id, "source": source},
        ).fetchone()
        if row is None or row[0] is None:
            return None
        return float(current_rating) - float(row[0])

    # ------------------------------------------------------------------
    # Private — Google Reviews
    # ------------------------------------------------------------------

    def _compute_google_metrics(self) -> int:
        from sqlalchemy import text

        rows_written = 0
        snapshots = self._conn.execute(
            text(
                """
                SELECT DISTINCT ON (operator_id)
                       operator_id,
                       id AS snapshot_id,
                       overall_rating,
                       collected_at
                FROM   google_review_snapshots
                ORDER  BY operator_id, collected_at DESC
                """
            )
        ).fetchall()

        for snap in snapshots:
            operator_id = snap[0]
            overall_rating = snap[2]

            sentiment_score = self._mean_sentiment_google(operator_id)
            rating_delta = self._mom_rating_delta_google(operator_id, overall_rating)
            positive_ratio = self._positive_ratio_google(operator_id)

            self._insert_operator_metric(
                operator_id=operator_id,
                source="google_reviews",
                overall_rating=overall_rating,
                sentiment_score=sentiment_score,
                positive_review_ratio=positive_ratio,
                rating_delta_mom=rating_delta,
            )
            rows_written += 1

        return rows_written

    def _mean_sentiment_google(self, operator_id: int) -> float | None:
        from sqlalchemy import text

        row = self._conn.execute(
            text(
                """
                SELECT AVG(ss.score)
                FROM   sentiment_scores ss
                JOIN   google_reviews r ON r.id = ss.review_id
                WHERE  ss.review_type   = 'google'
                  AND  r.operator_id    = :operator_id
                  AND  ss.score         IS NOT NULL
                  AND  ss.model_version = :model_version
                """
            ),
            {"operator_id": operator_id, "model_version": self.model_version},
        ).fetchone()
        return float(row[0]) if row and row[0] is not None else None

    def _positive_ratio_google(self, operator_id: int) -> float | None:
        from sqlalchemy import text

        row = self._conn.execute(
            text(
                """
                SELECT
                    COUNT(*) FILTER (WHERE ss.classification = 'positive')::float
                    / NULLIF(COUNT(*), 0)
                FROM   sentiment_scores ss
                JOIN   google_reviews r ON r.id = ss.review_id
                WHERE  ss.review_type   = 'google'
                  AND  r.operator_id    = :operator_id
                  AND  ss.model_version = :model_version
                """
            ),
            {"operator_id": operator_id, "model_version": self.model_version},
        ).fetchone()
        return float(row[0]) if row and row[0] is not None else None

    def _mom_rating_delta_google(
        self, operator_id: int, current_rating: float | None
    ) -> float | None:
        if current_rating is None:
            return None
        from sqlalchemy import text

        row = self._conn.execute(
            text(
                """
                SELECT overall_rating
                FROM   operator_metrics
                WHERE  operator_id = :operator_id
                  AND  source      = 'google_reviews'
                ORDER  BY cycle_timestamp DESC
                LIMIT  1
                """
            ),
            {"operator_id": operator_id},
        ).fetchone()
        if row is None or row[0] is None:
            return None
        return float(current_rating) - float(row[0])

    # ------------------------------------------------------------------
    # Private — Route metrics
    # ------------------------------------------------------------------

    def _compute_route_metrics(self) -> tuple[int, dict]:
        from sqlalchemy import text

        rows_written = 0

        # Fetch all route × operator combinations with their latest snapshot data
        snapshots = self._conn.execute(
            text(
                """
                SELECT DISTINCT ON (operator_id, route_id)
                       operator_id,
                       route_id,
                       review_count
                FROM   redbus_snapshots
                ORDER  BY operator_id, route_id, collected_at DESC
                """
            )
        ).fetchall()

        # Compute sentiment score per (operator_id, route_id)
        route_sentiment: dict[tuple[int, int], float | None] = {}
        route_review_count: dict[tuple[int, int], int | None] = {}

        for snap in snapshots:
            operator_id = snap[0]
            route_id = snap[1]
            review_count = snap[2]
            route_review_count[(operator_id, route_id)] = review_count

            score = self._mean_sentiment_redbus(operator_id, route_id)
            route_sentiment[(operator_id, route_id)] = score

        # Compute competitive ranks per route_id
        route_ids = {k[1] for k in route_sentiment.keys()}
        ranks: dict[tuple[int, int], int] = {}

        for route_id in route_ids:
            entries = [
                (op_id, route_sentiment[(op_id, route_id)])
                for (op_id, r_id) in route_sentiment
                if r_id == route_id
                for op_id_ in [op_id]  # unpack cleanly
            ]
            # Rebuild cleanly
            entries = []
            for (op_id, r_id), score in route_sentiment.items():
                if r_id == route_id:
                    entries.append((op_id, score))

            # Sort descending by score (None treated as lowest)
            entries.sort(
                key=lambda x: x[1] if x[1] is not None else float("-inf"),
                reverse=True,
            )
            for rank_pos, (op_id, _) in enumerate(entries, start=1):
                ranks[(op_id, route_id)] = rank_pos

        # Write route_metrics rows
        for (operator_id, route_id), score in route_sentiment.items():
            review_count = route_review_count.get((operator_id, route_id))
            competitive_rank = ranks.get((operator_id, route_id))

            self._conn.execute(
                text(
                    """
                    INSERT INTO route_metrics
                        (operator_id, route_id, cycle_timestamp, sentiment_score,
                         review_count, competitive_rank, model_version, is_stale)
                    VALUES
                        (:operator_id, :route_id, :cycle_timestamp, :sentiment_score,
                         :review_count, :competitive_rank, :model_version, FALSE)
                    """
                ),
                {
                    "operator_id": operator_id,
                    "route_id": route_id,
                    "cycle_timestamp": self.cycle_timestamp,
                    "sentiment_score": score,
                    "review_count": review_count,
                    "competitive_rank": competitive_rank,
                    "model_version": self.model_version,
                },
            )
            rows_written += 1

        # FreshBus vs cross-operator mean (task 7.5)
        freshbus_vs_mean = self._compute_freshbus_vs_mean(route_sentiment)

        return rows_written, freshbus_vs_mean

    def _mean_sentiment_redbus(
        self, operator_id: int, route_id: int
    ) -> float | None:
        from sqlalchemy import text

        row = self._conn.execute(
            text(
                """
                SELECT AVG(ss.score)
                FROM   sentiment_scores ss
                JOIN   redbus_reviews r ON r.id = ss.review_id
                WHERE  ss.review_type   = 'redbus'
                  AND  r.operator_id    = :operator_id
                  AND  r.route_id       = :route_id
                  AND  ss.score         IS NOT NULL
                  AND  ss.model_version = :model_version
                """
            ),
            {
                "operator_id": operator_id,
                "route_id": route_id,
                "model_version": self.model_version,
            },
        ).fetchone()
        return float(row[0]) if row and row[0] is not None else None

    def _compute_freshbus_vs_mean(
        self, route_sentiment: dict[tuple[int, int], float | None]
    ) -> dict:
        from sqlalchemy import text

        freshbus_row = self._conn.execute(
            text("SELECT id FROM operators WHERE slug = 'freshbus' LIMIT 1")
        ).fetchone()

        if freshbus_row is None:
            return {}

        freshbus_id = freshbus_row[0]
        freshbus_scores = [
            s for (op, _), s in route_sentiment.items()
            if op == freshbus_id and s is not None
        ]
        all_scores = [s for s in route_sentiment.values() if s is not None]

        freshbus_avg = (
            sum(freshbus_scores) / len(freshbus_scores) if freshbus_scores else None
        )
        cross_operator_avg = (
            sum(all_scores) / len(all_scores) if all_scores else None
        )

        return {
            "freshbus_avg": freshbus_avg,
            "cross_operator_avg": cross_operator_avg,
        }

    # ------------------------------------------------------------------
    # Private — shared
    # ------------------------------------------------------------------

    def _insert_operator_metric(
        self,
        operator_id: int,
        source: str,
        overall_rating: float | None,
        sentiment_score: float | None,
        positive_review_ratio: float | None,
        rating_delta_mom: float | None,
    ) -> None:
        from sqlalchemy import text

        self._conn.execute(
            text(
                """
                INSERT INTO operator_metrics
                    (operator_id, source, cycle_timestamp, overall_rating,
                     sentiment_score, positive_review_ratio, rating_delta_mom,
                     model_version, is_stale)
                VALUES
                    (:operator_id, :source, :cycle_timestamp, :overall_rating,
                     :sentiment_score, :positive_review_ratio, :rating_delta_mom,
                     :model_version, FALSE)
                """
            ),
            {
                "operator_id": operator_id,
                "source": source,
                "cycle_timestamp": self.cycle_timestamp,
                "overall_rating": overall_rating,
                "sentiment_score": sentiment_score,
                "positive_review_ratio": positive_review_ratio,
                "rating_delta_mom": rating_delta_mom,
                "model_version": self.model_version,
            },
        )
