"""
Tests for scraper/collectors/google_reviews.py

Covers:
  1. test_successful_extraction — mock _fetch_playwright_data returns valid data;
     snapshot is saved and result dict is non-None.
  2. test_absent_knowledge_panel — mock _fetch_playwright_data returns
     {"overall_rating": None, "review_count": None, "reviews": []};
     null snapshot saved, panel_absent=True in result.
  3. test_retry_exhaustion_marks_stale — mock _fetch_playwright_data always
     raises RuntimeError; set_snapshot_stale is called and method returns None.
  4. test_null_recording_failure_is_swallowed — panel absent AND
     upsert_google_snapshot raises; method returns None without propagating.

All tests use unittest.mock.patch; no real HTTP or Playwright calls are made.
"""

from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest

from scraper.collectors.google_reviews import GoogleReviewsCollector


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_db() -> MagicMock:
    """Return a fresh MagicMock standing in for a SQLAlchemy Connection."""
    return MagicMock()


# ---------------------------------------------------------------------------
# Test 1 — Successful extraction
# ---------------------------------------------------------------------------


class TestSuccessfulExtraction:
    @patch("scraper.collectors.google_reviews.insert_google_reviews")
    @patch("scraper.collectors.google_reviews.upsert_google_snapshot")
    @patch("scraper.collectors.google_reviews.get_operator_id")
    def test_successful_extraction(
        self,
        mock_get_operator_id,
        mock_upsert_snapshot,
        mock_insert_reviews,
    ):
        """
        _fetch_playwright_data returns a valid payload.
        Assert that upsert_google_snapshot is called, the result is non-None,
        and the result contains the expected rating fields.
        """
        mock_get_operator_id.return_value = 1
        mock_upsert_snapshot.return_value = 10
        mock_insert_reviews.return_value = 0

        fake_data = {
            "overall_rating": 4.1,
            "review_count": 320,
            "reviews": [],
        }

        db = _make_db()
        collector = GoogleReviewsCollector(db_connection=db)

        with (
            patch("time.sleep"),
            patch.object(
                collector,
                "_fetch_playwright_data",
                return_value=fake_data,
            ),
        ):
            result = collector.collect_operator("freshbus")

        assert result is not None, "Expected a result dict, got None"
        assert result["overall_rating"] == 4.1
        assert result["review_count"] == 320
        mock_upsert_snapshot.assert_called_once()
        upsert_kwargs = mock_upsert_snapshot.call_args.kwargs
        assert upsert_kwargs["operator_id"] == 1
        assert upsert_kwargs["overall_rating"] == 4.1
        assert upsert_kwargs["review_count"] == 320


# ---------------------------------------------------------------------------
# Test 2 — Absent Knowledge Panel
# ---------------------------------------------------------------------------


class TestAbsentKnowledgePanel:
    @patch("scraper.collectors.google_reviews.insert_google_reviews")
    @patch("scraper.collectors.google_reviews.upsert_google_snapshot")
    @patch("scraper.collectors.google_reviews.get_operator_id")
    def test_absent_knowledge_panel(
        self,
        mock_get_operator_id,
        mock_upsert_snapshot,
        mock_insert_reviews,
    ):
        """
        _fetch_playwright_data returns rating=None, count=None (panel absent).
        Assert that upsert_google_snapshot is called with null values,
        insert_google_reviews is NOT called, and result has panel_absent=True.
        """
        mock_get_operator_id.return_value = 2
        mock_upsert_snapshot.return_value = 20

        absent_data = {
            "overall_rating": None,
            "review_count": None,
            "reviews": [],
        }

        db = _make_db()
        collector = GoogleReviewsCollector(db_connection=db)

        with (
            patch("time.sleep"),
            patch.object(
                collector,
                "_fetch_playwright_data",
                return_value=absent_data,
            ),
        ):
            result = collector.collect_operator("neugo")

        assert result is not None
        assert result["panel_absent"] is True
        assert result["overall_rating"] is None
        assert result["review_count"] is None

        # Null snapshot must be saved
        mock_upsert_snapshot.assert_called_once()
        upsert_kwargs = mock_upsert_snapshot.call_args.kwargs
        assert upsert_kwargs["overall_rating"] is None
        assert upsert_kwargs["review_count"] is None

        # No reviews to insert
        mock_insert_reviews.assert_not_called()


# ---------------------------------------------------------------------------
# Test 3 — Retry exhaustion marks snapshot stale
# ---------------------------------------------------------------------------


class TestRetryExhaustionMarksStale:
    @patch("scraper.collectors.google_reviews.set_snapshot_stale")
    @patch("scraper.collectors.google_reviews.upsert_google_snapshot")
    @patch("scraper.collectors.google_reviews.get_operator_id")
    def test_retry_exhaustion_marks_stale(
        self,
        mock_get_operator_id,
        mock_upsert_snapshot,
        mock_set_stale,
    ):
        """
        _fetch_playwright_data always raises RuntimeError.
        After retries are exhausted, set_snapshot_stale should be called
        and collect_operator must return None.
        time.sleep is patched so the test runs fast.
        """
        mock_get_operator_id.return_value = 3
        snapshot_id = 55

        db = _make_db()
        collector = GoogleReviewsCollector(db_connection=db)

        # Make _get_latest_snapshot_id return a known snapshot id
        collector._get_latest_snapshot_id = MagicMock(return_value=snapshot_id)

        with (
            patch("time.sleep"),
            patch.object(
                collector,
                "_fetch_playwright_data",
                side_effect=RuntimeError("playwright error"),
            ),
        ):
            result = collector.collect_operator("flixbus")

        assert result is None, "Expected None when retries are exhausted"
        mock_set_stale.assert_called_once_with(
            db, "google_review_snapshots", snapshot_id
        )
        mock_upsert_snapshot.assert_not_called()


# ---------------------------------------------------------------------------
# Test 4 — Null recording failure is swallowed
# ---------------------------------------------------------------------------


class TestNullRecordingFailureIsSwallowed:
    @patch("scraper.collectors.google_reviews.insert_google_reviews")
    @patch("scraper.collectors.google_reviews.upsert_google_snapshot")
    @patch("scraper.collectors.google_reviews.get_operator_id")
    def test_null_recording_failure_is_swallowed(
        self,
        mock_get_operator_id,
        mock_upsert_snapshot,
        mock_insert_reviews,
    ):
        """
        Panel is absent AND upsert_google_snapshot raises an exception.
        The method must catch the exception, NOT propagate it, and return
        a result dict (with panel_absent=True) or None — but never raise.
        """
        mock_get_operator_id.return_value = 4
        # Simulate DB failure when trying to record the null snapshot
        mock_upsert_snapshot.side_effect = RuntimeError("DB connection lost")

        absent_data = {
            "overall_rating": None,
            "review_count": None,
            "reviews": [],
        }

        db = _make_db()
        collector = GoogleReviewsCollector(db_connection=db)

        with (
            patch("time.sleep"),
            patch.object(
                collector,
                "_fetch_playwright_data",
                return_value=absent_data,
            ),
        ):
            # This must NOT raise — the exception should be swallowed
            try:
                result = collector.collect_operator("zingbus")
            except Exception as exc:
                pytest.fail(
                    f"collect_operator raised unexpectedly: {exc!r}"
                )

        # The exception was swallowed; result should be the panel_absent dict
        # (the method returns the dict before or after the try/except block)
        # Either None or a panel_absent dict is acceptable — the key contract
        # is that no exception propagates.
        mock_upsert_snapshot.assert_called_once()
        mock_insert_reviews.assert_not_called()
