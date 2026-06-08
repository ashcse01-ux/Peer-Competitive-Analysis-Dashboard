"""
aggregator/sentiment.py

SentimentEngine — multilingual sentiment scoring using
cardiffnlp/twitter-xlm-roberta-base-sentiment.

Score formula: score = P(Positive) - P(Negative)  →  range [-1, 1]

Classification thresholds:
  score >= 0.2   → "positive"
  score <= -0.2  → "negative"
  otherwise      → "neutral"
  None input     → None (skipped from aggregates)

Tasks covered: 6.1 – 6.6
"""

from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any

import structlog

__all__ = ["SentimentEngine"]

logger = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

MODEL_NAME_DEFAULT = "cardiffnlp/twitter-xlm-roberta-base-sentiment"
BATCH_SIZE = 32
POSITIVE_THRESHOLD = 0.2
NEGATIVE_THRESHOLD = -0.2
_MAX_TEXT_LEN = 512  # truncate before sending to the model


# ---------------------------------------------------------------------------
# SentimentEngine
# ---------------------------------------------------------------------------


class SentimentEngine:
    """Multilingual sentiment scoring engine backed by a HuggingFace pipeline.

    Parameters
    ----------
    model_name:
        HuggingFace model identifier.  Defaults to the ``NLP_MODEL_NAME``
        environment variable, falling back to
        ``cardiffnlp/twitter-xlm-roberta-base-sentiment``.
    db_connection:
        Optional open SQLAlchemy connection used to detect model-version
        changes that require historical score recomputation.
    """

    def __init__(
        self,
        model_name: str | None = None,
        db_connection: Any | None = None,
    ) -> None:
        self.model_name: str = model_name or os.environ.get(
            "NLP_MODEL_NAME", MODEL_NAME_DEFAULT
        )

        # Lazy-import transformers to allow the module to be imported in
        # environments without the heavy ML stack (e.g., tests with mocks).
        from transformers import pipeline  # type: ignore[import]

        logger.info("sentiment_engine_loading", model=self.model_name)
        self._pipe = pipeline(
            "text-classification",
            model=self.model_name,
            return_all_scores=True,
        )
        logger.info("sentiment_engine_ready", model=self.model_name)

        # Detect model-version change for recompute logic (task 6.5)
        self._model_version_changed: bool = False
        if db_connection is not None:
            self._model_version_changed = self._detect_version_change(
                db_connection
            )

        self._db_conn = db_connection

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def score_text(self, text: str | None) -> float | None:
        """Score a single review text string.

        Parameters
        ----------
        text:
            Review text.  None or blank strings return None.

        Returns
        -------
        float | None
            Score in [-1, 1], or None if the text is invalid or the model
            raises an exception.
        """
        if not text or not text.strip():
            return None
        try:
            result = self._pipe(text[:_MAX_TEXT_LEN])
            # pipeline returns list[list[dict]] when return_all_scores=True
            scores_list = result[0] if isinstance(result[0], list) else result
            return self._compute_score(scores_list)
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "sentiment_score_failed",
                error=str(exc),
                text_preview=text[:80],
            )
            return None

    def score_batch(self, texts: list[str | None]) -> list[float | None]:
        """Score a batch of review texts.

        Parameters
        ----------
        texts:
            Mixed list of strings and None values.  None / empty entries are
            returned as None without touching the pipeline.

        Returns
        -------
        list[float | None]
            Scores in the same order as the input list.
        """
        results: list[float | None] = [None] * len(texts)

        # Collect non-empty texts with their original indices
        indexed_texts: list[tuple[int, str]] = []
        for idx, t in enumerate(texts):
            if t and t.strip():
                indexed_texts.append((idx, t[:_MAX_TEXT_LEN]))

        if not indexed_texts:
            return results

        # Process in batches of BATCH_SIZE
        for batch_start in range(0, len(indexed_texts), BATCH_SIZE):
            batch = indexed_texts[batch_start : batch_start + BATCH_SIZE]
            batch_indices = [b[0] for b in batch]
            batch_texts = [b[1] for b in batch]

            try:
                raw_outputs = self._pipe(batch_texts)
                for i, raw in enumerate(raw_outputs):
                    scores_list = raw if isinstance(raw, list) else [raw]
                    score = self._compute_score(scores_list)
                    results[batch_indices[i]] = score
            except Exception as exc:  # noqa: BLE001
                logger.warning(
                    "sentiment_batch_failed",
                    batch_start=batch_start,
                    error=str(exc),
                )
                # Leave those positions as None

        return results

    def classify(self, score: float | None) -> str | None:
        """Classify a sentiment score into a label.

        Parameters
        ----------
        score:
            Sentiment score in [-1, 1], or None.

        Returns
        -------
        str | None
            ``"positive"``, ``"negative"``, ``"neutral"``, or None.
        """
        if score is None:
            return None
        if score >= POSITIVE_THRESHOLD:
            return "positive"
        if score <= NEGATIVE_THRESHOLD:
            return "negative"
        return "neutral"

    def score_and_save(
        self,
        review_type: str,
        review_ids: list[int],
        texts: list[str | None],
        db_connection: Any,
    ) -> list[dict]:
        """Score texts and persist each score to the ``sentiment_scores`` table.

        Parameters
        ----------
        review_type:
            One of ``"app_store"``, ``"google"``, ``"redbus"``.
        review_ids:
            List of review primary-key integers, aligned with *texts*.
        texts:
            List of review text strings (may contain None).
        db_connection:
            Open SQLAlchemy connection.

        Returns
        -------
        list[dict]
            ``[{"review_id": int, "score": float|None, "classification": str|None}]``
        """
        from sqlalchemy import text  # lazy import

        scores = self.score_batch(texts)
        computed_at = datetime.now(tz=timezone.utc)
        output: list[dict] = []

        stmt = text(
            """
            INSERT INTO sentiment_scores
                (review_type, review_id, score, classification, model_version, computed_at)
            VALUES
                (:review_type, :review_id, :score, :classification, :model_version, :computed_at)
            """
        )

        for review_id, score in zip(review_ids, scores):
            classification = self.classify(score)
            db_connection.execute(
                stmt,
                {
                    "review_type": review_type,
                    "review_id": review_id,
                    "score": score,
                    "classification": classification,
                    "model_version": self.model_name,
                    "computed_at": computed_at,
                },
            )
            output.append(
                {
                    "review_id": review_id,
                    "score": score,
                    "classification": classification,
                }
            )

        logger.info(
            "sentiment_scores_saved",
            review_type=review_type,
            count=len(output),
            model_version=self.model_name,
        )
        return output

    def recompute_all_if_model_changed(self, db_connection: Any) -> bool:
        """Recompute all historical scores if the model version changed.

        Parameters
        ----------
        db_connection:
            Open SQLAlchemy connection.

        Returns
        -------
        bool
            True if recomputation was performed, False otherwise.
        """
        if not self._model_version_changed:
            return False

        from sqlalchemy import text  # lazy import

        logger.info(
            "sentiment_recomputing_all",
            model_version=self.model_name,
            reason="model_version_changed",
        )

        sources = [
            ("app_store", "app_store_reviews"),
            ("google", "google_reviews"),
            ("redbus", "redbus_reviews"),
        ]

        for review_type, table in sources:
            rows = db_connection.execute(
                text(
                    f"SELECT id, review_text FROM {table} WHERE review_text IS NOT NULL"  # noqa: S608
                )
            ).fetchall()

            if not rows:
                continue

            ids = [r[0] for r in rows]
            texts = [r[1] for r in rows]

            self.score_and_save(review_type, ids, texts, db_connection)
            logger.info(
                "sentiment_recomputed_source",
                review_type=review_type,
                count=len(ids),
                model_version=self.model_name,
            )

        return True

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _compute_score(scores_list: list[dict]) -> float:
        """Compute score = P(Positive) - P(Negative) from the pipeline output."""
        score_map: dict[str, float] = {
            item["label"].lower(): item["score"] for item in scores_list
        }
        p_positive = score_map.get("positive", 0.0)
        p_negative = score_map.get("negative", 0.0)
        return float(p_positive - p_negative)

    def _detect_version_change(self, db_connection: Any) -> bool:
        """Return True if the stored model version differs from the current one."""
        from sqlalchemy import text  # lazy import

        try:
            row = db_connection.execute(
                text(
                    "SELECT DISTINCT model_version FROM sentiment_scores LIMIT 1"
                )
            ).fetchone()
            if row is None:
                # No scores stored yet — no version to conflict with
                return False
            stored_version: str = row[0]
            changed = stored_version != self.model_name
            if changed:
                logger.warning(
                    "sentiment_model_version_changed",
                    stored_version=stored_version,
                    new_version=self.model_name,
                )
            return changed
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "sentiment_version_check_failed",
                error=str(exc),
            )
            return False
