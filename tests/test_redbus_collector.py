"""
Tests for scraper/collectors/redbus.py

Covers:
  1. test_collect_route_operator_success — mock _fetch_playwright_data returns
     valid data; upsert_redbus_snapshot and insert_redbus_reviews are called.
     Result is non-None.
  2. test_collect_route_operator_absent — mock fetch returns operator_absent=True;
     null snapshot saved. Result has operator_absent=True.
  3. test_captcha_detected — mock fetch raises CaptchaDetected; insert_captcha_alert
     is called; method does NOT return a normal result.
  4. test_retry_exhaustion_marks_stale — mock fetch always raises RuntimeError;
     set_snapshot_stale is called and method returns None.
  5. test_collect_all_summary — mock collect_route_operator returns success dict
     for all calls; assert success == 132 (22 routes × 6 operators).

All tests use unittest.mock.patch; no real HTTP or Playwright calls are made.
"""

from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest

from scraper.collectors.redbus import CaptchaDetected, RedbusCollector


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_db() -> MagicMock:
    """Return a fresh MagicMock standing in for a SQLAlchemy Connection."""
    return MagicMock()


def _make_success_result(
    origin: str = "Bangalore",
    destination: str = "Chennai",
    operator_slug: str = "freshbus",
) -> dict:
    return {
        "operator_slug": operator_slug,
        "origin": origin,
        "destination": destination,
        "overall_rating": 4.0,
        "review_count": 50,
        "reviews_inserted": 1,
        "snapshot_id": 1,
        "operator_absent": False,
    }


# ---------------------------------------------------------------------------
# Test 1 — Successful collection
# ---------------------------------------------------------------------------


class TestCollectRouteOperatorSuccess:
    @patch("scraper.collectors.redbus.insert_redbus_reviews")
    @patch("scraper.collectors.redbus.upsert_redbus_snapshot")
    @patch("scraper.collectors.redbus.get_route_id")
    @patch("scraper.collectors.redbus.get_operator_id")
    def test_collect_route_operator_success(
        self,
        mock_get_operator_id,
        mock_get_route_id,
        mock_upsert_snapshot,
        mock_insert_reviews,
    ):
        """
        _fetch_playwright_data returns valid data.
        Assert upsert_redbus_snapshot and insert_redbus_reviews are called,
        and the result dict is non-None.
        """
        mock_get_operator_id.return_value = 1
        mock_get_route_id.return_value = 10
        mock_upsert_snapshot.return_value = 42
        mock_insert_reviews.return_value = 1

        fake_data = {
            "overall_rating": 4.0,
            "review_count": 50,
            "reviews": [
                {
                    "review_text": "good",
                    "star_rating": 4,
                    "reviewed_at": None,
                    "collected_at": datetime.now(tz=timezone.utc),
                }
            ],
            "operator_absent": False,
        }

        db = _make_db()
        collector = RedbusCollector(db_connection=db)

        with (
            patch("time.sleep"),
            patch.object(
                collector,
                "_fetch_playwright_data",
                return_value=fake_data,
            ),
        ):
            result = collector.collect_route_operator(
                "Bangalore", "Chennai", "freshbus"
            )

        assert result is not None, "Expected a result dict, got None"
        assert result["overall_rating"] == 4.0
        assert result["review_count"] == 50
        assert result["operator_absent"] is False

        mock_upsert_snapshot.assert_called_once()
        upsert_kwargs = mock_upsert_snapshot.call_args.kwargs
        assert upsert_kwargs["operator_id"] == 1
        assert upsert_kwargs["route_id"] == 10
        assert upsert_kwargs["overall_rating"] == 4.0
        assert upsert_kwargs["review_count"] == 50

        mock_insert_reviews.assert_called_once()


# ---------------------------------------------------------------------------
# Test 2 — Operator absent on route
# ---------------------------------------------------------------------------


class TestCollectRouteOperatorAbsent:
    @patch("scraper.collectors.redbus.insert_redbus_reviews")
    @patch("scraper.collectors.redbus.upsert_redbus_snapshot")
    @patch("scraper.collectors.redbus.get_route_id")
    @patch("scraper.collectors.redbus.get_operator_id")
    def test_collect_route_operator_absent(
        self,
        mock_get_operator_id,
        mock_get_route_id,
        mock_upsert_snapshot,
        mock_insert_reviews,
    ):
        """
        _fetch_playwright_data returns operator_absent=True.
        Assert null snapshot is saved and result has operator_absent=True.
        No reviews are inserted.
        """
        mock_get_operator_id.return_value = 2
        mock_get_route_id.return_value = 11
        mock_upsert_snapshot.return_value = 43

        absent_data = {
            "overall_rating": None,
            "review_count": None,
            "reviews": [],
            "operator_absent": True,
        }

        db = _make_db()
        collector = RedbusCollector(db_connection=db)

        with (
            patch("time.sleep"),
            patch.object(
                collector,
                "_fetch_playwright_data",
                return_value=absent_data,
            ),
        ):
            result = collector.collect_route_operator(
                "Chennai", "Bangalore", "neugo"
            )

        assert result is not None
        assert result["operator_absent"] is True
        assert result["overall_rating"] is None
        assert result["review_count"] is None

        # Null snapshot must be saved
        mock_upsert_snapshot.assert_called_once()
        upsert_kwargs = mock_upsert_snapshot.call_args.kwargs
        assert upsert_kwargs["overall_rating"] is None
        assert upsert_kwargs["review_count"] is None

        # No reviews should be inserted
        mock_insert_reviews.assert_not_called()


# ---------------------------------------------------------------------------
# Test 3 — CAPTCHA detection
# ---------------------------------------------------------------------------


class TestCaptchaDetected:
    @patch("scraper.collectors.redbus.insert_captcha_alert")
    @patch("scraper.collectors.redbus.insert_redbus_reviews")
    @patch("scraper.collectors.redbus.upsert_redbus_snapshot")
    @patch("scraper.collectors.redbus.get_route_id")
    @patch("scraper.collectors.redbus.get_operator_id")
    def test_captcha_detected(
        self,
        mock_get_operator_id,
        mock_get_route_id,
        mock_upsert_snapshot,
        mock_insert_reviews,
        mock_insert_captcha,
    ):
        """
        _fetch_playwright_data raises CaptchaDetected.
        Assert insert_captcha_alert is called and the method does NOT return
        a normal result (either re-raises CaptchaDetected or returns None).
        """
        mock_get_operator_id.return_value = 3
        mock_get_route_id.return_value = 12
        mock_insert_captcha.return_value = 1

        db = _make_db()
        collector = RedbusCollector(db_connection=db)

        with (
            patch("time.sleep"),
            patch.object(
                collector,
                "_fetch_playwright_data",
                side_effect=CaptchaDetected(),
            ),
        ):
            # CaptchaDetected should be re-raised after recording the alert
            with pytest.raises(CaptchaDetected):
                collector.collect_route_operator(
                    "Bangalore", "Tirupati", "freshbus"
                )

        mock_insert_captcha.assert_called_once_with(db, "redbus", 3)
        mock_upsert_snapshot.assert_not_called()
        mock_insert_reviews.assert_not_called()


# ---------------------------------------------------------------------------
# Test 4 — Retry exhaustion marks snapshot stale
# ---------------------------------------------------------------------------


class TestRetryExhaustionMarksStale:
    @patch("scraper.collectors.redbus.set_snapshot_stale")
    @patch("scraper.collectors.redbus.upsert_redbus_snapshot")
    @patch("scraper.collectors.redbus.get_route_id")
    @patch("scraper.collectors.redbus.get_operator_id")
    def test_retry_exhaustion_marks_stale(
        self,
        mock_get_operator_id,
        mock_get_route_id,
        mock_upsert_snapshot,
        mock_set_stale,
    ):
        """
        _fetch_playwright_data always raises RuntimeError.
        After retries are exhausted, set_snapshot_stale should be called
        and collect_route_operator must return None.
        time.sleep is patched so the test runs fast.
        """
        mock_get_operator_id.return_value = 4
        mock_get_route_id.return_value = 13
        snapshot_id = 99

        db = _make_db()
        collector = RedbusCollector(db_connection=db)

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
            result = collector.collect_route_operator(
                "Hyderabad", "Vijayawada", "zingbus"
            )

        assert result is None, "Expected None when retries are exhausted"
        mock_set_stale.assert_called_once_with(db, "redbus_snapshots", snapshot_id)
        mock_upsert_snapshot.assert_not_called()


# ---------------------------------------------------------------------------
# Test 5 — collect_all summary counts
# ---------------------------------------------------------------------------


class TestCollectAllSummary:
    def test_collect_all_summary(self):
        """
        mock collect_route_operator returns a success dict for every call.
        Assert that success == 132 (22 routes × 6 operators).
        """
        db = _make_db()
        collector = RedbusCollector(db_connection=db)

        def _fake_collect(origin, destination, operator_slug):
            return _make_success_result(origin, destination, operator_slug)

        with (
            patch("time.sleep"),
            patch.object(
                collector,
                "collect_route_operator",
                side_effect=_fake_collect,
            ),
        ):
            summary = collector.collect_all()

        assert summary["success"] == 132, (
            f"Expected 132 successes (22 routes × 6 operators), "
            f"got {summary['success']}"
        )
        assert summary["total"] == 132
        assert summary["stale"] == 0
