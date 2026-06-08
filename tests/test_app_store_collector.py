"""
Integration tests for scraper/collectors/app_store.py

Covers:
  1. Google Play success path — correct DB calls and reviews_inserted count
  2. Missing app_id (neugo / ios_app_store) — null snapshot inserted, app_absent=True
  3. Rate-limit / transient error: library raises twice, succeeds on 3rd call
  4. Retry exhaustion — set_snapshot_stale called, collect_operator returns None
  5. Unknown operator slug — get_operator_id returns None, no snapshot functions called
  6. collect_all summary — success==12, stale_operators==[]

All tests use unittest.mock.patch; no real HTTP or DB calls are made.
"""

from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import MagicMock, call, patch

import pytest

from scraper.collectors.app_store import AppStoreCollector, OPERATOR_APP_IDS


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_db() -> MagicMock:
    """Return a fresh MagicMock that stands in for an SQLAlchemy Connection."""
    return MagicMock()


def _make_valid_app_info() -> dict:
    return {
        "score": 4.2,
        "reviews": 1500,
        "version": "2.3.0",
    }


def _make_raw_reviews(n: int) -> list[dict]:
    return [
        {
            "content": f"Review number {i}",
            "score": 5,
            "at": datetime(2024, 1, i + 1, tzinfo=timezone.utc),
        }
        for i in range(n)
    ]


# ---------------------------------------------------------------------------
# Test 1 — Google Play success
# ---------------------------------------------------------------------------

class TestCollectOperatorGooglePlaySuccess:
    @patch("scraper.collectors.app_store.insert_app_store_reviews")
    @patch("scraper.collectors.app_store.upsert_app_store_snapshot")
    @patch("scraper.collectors.app_store.get_operator_id")
    def test_collect_operator_google_play_success(
        self,
        mock_get_operator_id,
        mock_upsert_snapshot,
        mock_insert_reviews,
    ):
        """
        Happy path: google_play_scraper returns valid app info + 3 reviews.
        Assert that upsert_app_store_snapshot and insert_app_store_reviews are
        called with the correct argument shapes, and the result has reviews_inserted=3.
        """
        mock_get_operator_id.return_value = 42
        snapshot_id = 99
        mock_upsert_snapshot.return_value = snapshot_id
        mock_insert_reviews.return_value = 3

        app_info = _make_valid_app_info()
        raw_reviews = _make_raw_reviews(3)

        db = _make_db()
        collector = AppStoreCollector(db_connection=db)

        with (
            patch("time.sleep"),
            patch(
                "scraper.collectors.app_store.AppStoreCollector._fetch_google_play",
                return_value={
                    "overall_rating": app_info["score"],
                    "review_count": app_info["reviews"],
                    "app_version": app_info["version"],
                    "reviews": [
                        {
                            "review_text": r["content"],
                            "star_rating": r["score"],
                            "reviewed_at": r["at"],
                            "collected_at": datetime(2024, 6, 1, tzinfo=timezone.utc),
                        }
                        for r in raw_reviews
                    ],
                },
            ),
        ):
            result = collector.collect_operator("freshbus", "google_play")

        # DB helpers were called with the correct operator_id / source / snapshot_id
        mock_get_operator_id.assert_called_once_with(db, "freshbus")

        upsert_kwargs = mock_upsert_snapshot.call_args
        assert upsert_kwargs.kwargs["operator_id"] == 42
        assert upsert_kwargs.kwargs["source"] == "google_play"
        assert upsert_kwargs.kwargs["overall_rating"] == 4.2
        assert upsert_kwargs.kwargs["review_count"] == 1500
        assert upsert_kwargs.kwargs["app_version"] == "2.3.0"

        insert_kwargs = mock_insert_reviews.call_args
        assert insert_kwargs.kwargs["snapshot_id"] == snapshot_id
        assert insert_kwargs.kwargs["operator_id"] == 42
        assert insert_kwargs.kwargs["source"] == "google_play"
        assert len(insert_kwargs.kwargs["reviews"]) == 3

        # Result dict
        assert result is not None
        assert result["reviews_inserted"] == 3
        assert result["operator_slug"] == "freshbus"
        assert result["source"] == "google_play"


# ---------------------------------------------------------------------------
# Test 2 — Missing app_id (neugo / ios_app_store)
# ---------------------------------------------------------------------------

class TestCollectOperatorMissingAppId:
    @patch("scraper.collectors.app_store.insert_app_store_reviews")
    @patch("scraper.collectors.app_store.upsert_app_store_snapshot")
    @patch("scraper.collectors.app_store.set_snapshot_stale")
    @patch("scraper.collectors.app_store.get_operator_id")
    def test_collect_operator_missing_app_id(
        self,
        mock_get_operator_id,
        mock_set_stale,
        mock_upsert_snapshot,
        mock_insert_reviews,
    ):
        """
        neugo has ios_app_store = None in OPERATOR_APP_IDS.
        Expect a null snapshot to be inserted (all metrics None) without setting
        the stale flag, and the returned dict should have app_absent=True.
        """
        operator_id = 7
        mock_get_operator_id.return_value = operator_id
        mock_upsert_snapshot.return_value = 55

        db = _make_db()
        collector = AppStoreCollector(db_connection=db)

        result = collector.collect_operator("neugo", "ios_app_store")

        # Snapshot inserted with nulls — no stale flag
        mock_upsert_snapshot.assert_called_once()
        call_kwargs = mock_upsert_snapshot.call_args.kwargs
        assert call_kwargs["operator_id"] == operator_id
        assert call_kwargs["source"] == "ios_app_store"
        assert call_kwargs["overall_rating"] is None
        assert call_kwargs["review_count"] is None
        assert call_kwargs["app_version"] is None

        mock_set_stale.assert_not_called()
        mock_insert_reviews.assert_not_called()

        assert result is not None
        assert result["app_absent"] is True
        assert result["reviews_inserted"] == 0


# ---------------------------------------------------------------------------
# Test 3 — Rate-limit / transient error: fails twice, succeeds on 3rd attempt
# ---------------------------------------------------------------------------

class TestCollectOperatorRateLimitRetriesThenSucceeds:
    @patch("scraper.collectors.app_store.insert_app_store_reviews")
    @patch("scraper.collectors.app_store.upsert_app_store_snapshot")
    @patch("scraper.collectors.app_store.get_operator_id")
    def test_collect_operator_rate_limit_retries_then_succeeds(
        self,
        mock_get_operator_id,
        mock_upsert_snapshot,
        mock_insert_reviews,
    ):
        """
        _fetch_google_play raises RuntimeError twice, then returns a valid dict.
        collect_operator should return a successful (non-None) result dict.
        time.sleep is patched so the test runs fast.
        """
        mock_get_operator_id.return_value = 10
        mock_upsert_snapshot.return_value = 77
        mock_insert_reviews.return_value = 0

        call_count = 0
        valid_result = {
            "overall_rating": 3.9,
            "review_count": 200,
            "app_version": "1.0.0",
            "reviews": [],
        }

        def _flaky_fetch(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count < 3:
                raise RuntimeError("rate limited")
            return valid_result

        db = _make_db()
        collector = AppStoreCollector(db_connection=db)

        with (
            patch("time.sleep"),
            patch(
                "scraper.collectors.app_store.AppStoreCollector._fetch_google_play",
                side_effect=_flaky_fetch,
            ),
        ):
            result = collector.collect_operator("freshbus", "google_play")

        assert result is not None, "Expected a successful result dict, got None"
        assert call_count == 3
        assert result["overall_rating"] == 3.9


# ---------------------------------------------------------------------------
# Test 4 — Retry exhaustion marks snapshot stale, collect_operator returns None
# ---------------------------------------------------------------------------

class TestCollectOperatorRetryExhaustion:
    @patch("scraper.collectors.app_store.set_snapshot_stale")
    @patch("scraper.collectors.app_store.upsert_app_store_snapshot")
    @patch("scraper.collectors.app_store.get_operator_id")
    def test_collect_operator_retry_exhaustion_marks_stale(
        self,
        mock_get_operator_id,
        mock_upsert_snapshot,
        mock_set_stale,
    ):
        """
        _fetch_google_play always raises RuntimeError.
        After all retries are exhausted RetryExhausted is caught internally,
        set_snapshot_stale is called, and collect_operator returns None.
        time.sleep is patched so the test runs fast.
        """
        mock_get_operator_id.return_value = 5
        snapshot_id = 33
        # _get_latest_snapshot_id uses self._conn — mock it to return a known id
        # We patch the method directly on the instance.

        db = _make_db()
        collector = AppStoreCollector(db_connection=db)

        # Make _get_latest_snapshot_id return a known snapshot id
        collector._get_latest_snapshot_id = MagicMock(return_value=snapshot_id)

        with (
            patch("time.sleep"),
            patch(
                "scraper.collectors.app_store.AppStoreCollector._fetch_google_play",
                side_effect=RuntimeError("server error"),
            ),
        ):
            result = collector.collect_operator("freshbus", "google_play")

        assert result is None, "Expected None when retries are exhausted"
        mock_set_stale.assert_called_once_with(
            db, "app_store_snapshots", snapshot_id
        )


# ---------------------------------------------------------------------------
# Test 5 — Unknown operator slug → collect_operator returns None immediately
# ---------------------------------------------------------------------------

class TestCollectOperatorUnknownSlug:
    @patch("scraper.collectors.app_store.insert_app_store_reviews")
    @patch("scraper.collectors.app_store.upsert_app_store_snapshot")
    @patch("scraper.collectors.app_store.set_snapshot_stale")
    @patch("scraper.collectors.app_store.get_operator_id")
    def test_collect_operator_unknown_operator_slug(
        self,
        mock_get_operator_id,
        mock_set_stale,
        mock_upsert_snapshot,
        mock_insert_reviews,
    ):
        """
        When get_operator_id returns None (slug not in DB), collect_operator
        must return None without calling any snapshot or review functions.
        """
        mock_get_operator_id.return_value = None

        db = _make_db()
        collector = AppStoreCollector(db_connection=db)

        result = collector.collect_operator("does_not_exist", "google_play")

        assert result is None
        mock_upsert_snapshot.assert_not_called()
        mock_insert_reviews.assert_not_called()
        mock_set_stale.assert_not_called()


# ---------------------------------------------------------------------------
# Test 6 — collect_all returns summary: success==12, stale_operators==[]
# ---------------------------------------------------------------------------

class TestCollectAllReturnsSummary:
    def test_collect_all_returns_summary(self):
        """
        collect_all iterates over 6 operators × 2 sources = 12 total calls.
        When every collect_operator call returns a success dict, the summary
        should have success==12 and stale_operators==[].
        """
        db = _make_db()
        collector = AppStoreCollector(db_connection=db)

        successful_result = {
            "operator_slug": "freshbus",
            "source": "google_play",
            "overall_rating": 4.5,
            "review_count": 1000,
            "app_version": "3.0.0",
            "reviews_inserted": 10,
            "snapshot_id": 1,
        }

        with patch.object(
            collector, "collect_operator", return_value=successful_result
        ) as mock_collect:
            summary = collector.collect_all()

        total_operators = len(OPERATOR_APP_IDS)          # 6
        total_sources = 2                                  # google_play + ios_app_store
        expected_calls = total_operators * total_sources  # 12

        assert mock_collect.call_count == expected_calls
        assert summary["success"] == expected_calls
        assert summary["total"] == expected_calls
        assert summary["stale_operators"] == []
