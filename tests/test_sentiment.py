"""
Unit tests for aggregator/sentiment.py

Mocks the HuggingFace pipeline to avoid downloading models.
Tasks covered: 6.7
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch, call

import pytest

# ---------------------------------------------------------------------------
# Helpers / fixtures
# ---------------------------------------------------------------------------

# A typical pipeline output when return_all_scores=True
# score = P(Positive) - P(Negative) = 0.7 - 0.1 = 0.6
MOCK_SCORES_POSITIVE = [
    {"label": "Negative", "score": 0.1},
    {"label": "Neutral",  "score": 0.2},
    {"label": "Positive", "score": 0.7},
]

MOCK_SCORES_NEGATIVE = [
    {"label": "Negative", "score": 0.8},
    {"label": "Neutral",  "score": 0.1},
    {"label": "Positive", "score": 0.1},
]


def _make_engine(mock_pipe=None):
    """Create a SentimentEngine with the HuggingFace pipeline mocked."""
    if mock_pipe is None:
        mock_pipe = MagicMock(return_value=[MOCK_SCORES_POSITIVE])

    with patch("aggregator.sentiment.pipeline", return_value=mock_pipe):
        from aggregator.sentiment import SentimentEngine
        engine = SentimentEngine(model_name="test-model")
    return engine, mock_pipe


# ---------------------------------------------------------------------------
# Test 1 — score_text with a valid input
# ---------------------------------------------------------------------------

class TestScoreTextValid:
    def test_score_text_valid(self):
        """score_text returns P(Positive) - P(Negative) ≈ 0.6 for a positive text."""
        engine, mock_pipe = _make_engine()
        mock_pipe.return_value = [MOCK_SCORES_POSITIVE]

        result = engine.score_text("Great service!")

        assert result == pytest.approx(0.6, abs=1e-6)
        mock_pipe.assert_called_once()


# ---------------------------------------------------------------------------
# Test 2 — score_text with None / empty input
# ---------------------------------------------------------------------------

class TestScoreTextNoneAndEmpty:
    def test_score_text_none_returns_none(self):
        engine, mock_pipe = _make_engine()
        assert engine.score_text(None) is None
        mock_pipe.assert_not_called()

    def test_score_text_empty_returns_none(self):
        engine, mock_pipe = _make_engine()
        assert engine.score_text("") is None
        assert engine.score_text("   ") is None
        mock_pipe.assert_not_called()


# ---------------------------------------------------------------------------
# Test 3 — score_text when pipeline raises
# ---------------------------------------------------------------------------

class TestScoreTextPipelineException:
    def test_score_text_pipeline_exception_returns_none(self):
        engine, mock_pipe = _make_engine()
        mock_pipe.side_effect = RuntimeError("model unavailable")

        result = engine.score_text("some review text")

        assert result is None


# ---------------------------------------------------------------------------
# Test 4 — classify thresholds
# ---------------------------------------------------------------------------

class TestClassifyThresholds:
    def test_classify_positive(self):
        engine, _ = _make_engine()
        assert engine.classify(0.3) == "positive"
        assert engine.classify(0.2) == "positive"

    def test_classify_negative(self):
        engine, _ = _make_engine()
        assert engine.classify(-0.3) == "negative"
        assert engine.classify(-0.2) == "negative"

    def test_classify_neutral(self):
        engine, _ = _make_engine()
        assert engine.classify(0.0) == "neutral"
        assert engine.classify(0.1) == "neutral"
        assert engine.classify(-0.1) == "neutral"
        assert engine.classify(0.19) == "neutral"

    def test_classify_none(self):
        engine, _ = _make_engine()
        assert engine.classify(None) is None


# ---------------------------------------------------------------------------
# Test 5 — score_batch preserves None positions
# ---------------------------------------------------------------------------

class TestScoreBatchPreservesNone:
    def test_score_batch_preserves_none_positions(self):
        """Input: ["good", None, "", "bad"] → positions 1 and 2 must be None."""
        engine, mock_pipe = _make_engine()

        # Pipeline will be called with ["good", "bad"] only
        mock_pipe.return_value = [MOCK_SCORES_POSITIVE, MOCK_SCORES_NEGATIVE]

        result = engine.score_batch(["good", None, "", "bad"])

        assert len(result) == 4
        assert result[1] is None  # None input
        assert result[2] is None  # empty string input
        assert result[0] is not None  # "good" got a score
        assert result[3] is not None  # "bad" got a score
        # "good" → 0.6, "bad" → 0.1 - 0.8 = -0.7
        assert result[0] == pytest.approx(0.6, abs=1e-6)
        assert result[3] == pytest.approx(-0.7, abs=1e-6)


# ---------------------------------------------------------------------------
# Test 6 — score_batch batching with BATCH_SIZE
# ---------------------------------------------------------------------------

class TestScoreBatchBatching:
    def test_score_batch_uses_batch_size(self):
        """70 texts with BATCH_SIZE=32 → pipeline called at least 3 times."""
        engine, mock_pipe = _make_engine()

        # Return one score per item in whatever batch size is given
        def _pipeline_side_effect(batch):
            return [MOCK_SCORES_POSITIVE] * len(batch)

        mock_pipe.side_effect = _pipeline_side_effect

        texts = [f"review {i}" for i in range(70)]
        result = engine.score_batch(texts)

        assert len(result) == 70
        # BATCH_SIZE=32: ceil(70/32) = 3 calls
        assert mock_pipe.call_count >= 3
        assert all(r is not None for r in result)


# ---------------------------------------------------------------------------
# Test 7 — model version changed flag
# ---------------------------------------------------------------------------

class TestModelVersionChangedFlag:
    def test_model_version_changed_is_true_when_stored_differs(self):
        """
        DB returns a different model_version string → _model_version_changed=True.
        """
        mock_conn = MagicMock()
        # Simulate fetchone() returning a stored model version different from the new one
        mock_conn.execute.return_value.fetchone.return_value = ("old-model-v1",)

        with patch("aggregator.sentiment.pipeline", return_value=MagicMock()):
            from aggregator.sentiment import SentimentEngine
            engine = SentimentEngine(
                model_name="new-model-v2",
                db_connection=mock_conn,
            )

        assert engine._model_version_changed is True

    def test_model_version_changed_is_false_when_same(self):
        """DB returns the same model_version → _model_version_changed=False."""
        mock_conn = MagicMock()
        mock_conn.execute.return_value.fetchone.return_value = ("new-model-v2",)

        with patch("aggregator.sentiment.pipeline", return_value=MagicMock()):
            from aggregator.sentiment import SentimentEngine
            engine = SentimentEngine(
                model_name="new-model-v2",
                db_connection=mock_conn,
            )

        assert engine._model_version_changed is False

    def test_model_version_changed_is_false_when_no_stored_scores(self):
        """DB returns None (no rows) → _model_version_changed=False."""
        mock_conn = MagicMock()
        mock_conn.execute.return_value.fetchone.return_value = None

        with patch("aggregator.sentiment.pipeline", return_value=MagicMock()):
            from aggregator.sentiment import SentimentEngine
            engine = SentimentEngine(
                model_name="any-model",
                db_connection=mock_conn,
            )

        assert engine._model_version_changed is False
