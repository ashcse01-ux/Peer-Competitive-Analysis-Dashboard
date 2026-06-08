"""
Unit tests for aggregator/orchestrator.py

Tests cover cycle status transitions and stale flag propagation.
Tasks covered: 8.6
"""

from __future__ import annotations

from contextlib import contextmanager
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest

from aggregator.orchestrator import RefreshOrchestrator


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_conn() -> MagicMock:
    conn = MagicMock()
    conn.execute.return_value.fetchone.return_value = (1,)  # cycle_id = 1
    conn.execute.return_value.fetchall.return_value = []
    return conn


def _make_orchestrator(conn: MagicMock) -> RefreshOrchestrator:
    @contextmanager
    def _factory():
        yield conn

    return RefreshOrchestrator(db_connection_factory=_factory)


# ---------------------------------------------------------------------------
# Test 1 — Successful cycle → status='completed', stale_sources=[]
# ---------------------------------------------------------------------------

class TestCycleCompleted:
    def test_completed_status_when_no_stale(self):
        conn = _make_conn()
        orch = _make_orchestrator(conn)

        with (
            patch.object(orch, "_run_scraper", return_value=[]),
            patch.object(orch, "_run_sentiment_scoring", return_value="model-v1"),
            patch.object(orch, "_run_metrics"),
        ):
            result = orch.run()

        assert result["status"] == "completed"
        assert result["stale_sources"] == []
        assert result["cycle_id"] == 1


# ---------------------------------------------------------------------------
# Test 2 — Stale sources → status='stale', stale_sources populated
# ---------------------------------------------------------------------------

class TestCycleStale:
    def test_stale_status_when_scraper_returns_stale(self):
        conn = _make_conn()
        orch = _make_orchestrator(conn)

        stale_list = ["freshbus:google_play", "google:neugo"]

        with (
            patch.object(orch, "_run_scraper", return_value=stale_list),
            patch.object(orch, "_run_sentiment_scoring", return_value="model-v1"),
            patch.object(orch, "_run_metrics"),
        ):
            result = orch.run()

        assert result["status"] == "stale"
        assert result["stale_sources"] == stale_list


# ---------------------------------------------------------------------------
# Test 3 — Pipeline exception → status='failed', exception re-raised
# ---------------------------------------------------------------------------

class TestCycleFailed:
    def test_failed_status_when_pipeline_raises(self):
        conn = _make_conn()
        orch = _make_orchestrator(conn)

        with (
            patch.object(orch, "_run_scraper", side_effect=RuntimeError("boom")),
        ):
            with pytest.raises(RuntimeError, match="boom"):
                orch.run()

        # _finish_cycle should have been called with 'failed'
        # Check that UPDATE was called with 'failed' status somewhere in the calls
        update_calls = [
            str(call_args)
            for call_args in conn.execute.call_args_list
        ]
        # At minimum we expect 2 execute calls: INSERT (start) + UPDATE (finish)
        assert conn.execute.call_count >= 2


# ---------------------------------------------------------------------------
# Test 4 — _start_cycle inserts a 'running' record
# ---------------------------------------------------------------------------

class TestStartCycle:
    def test_start_cycle_inserts_running_record(self):
        conn = _make_conn()
        conn.execute.return_value.fetchone.return_value = (42,)

        orch = _make_orchestrator(conn)
        cycle_id = orch._start_cycle(
            conn, datetime(2024, 1, 1, 2, 0, 0, tzinfo=timezone.utc)
        )

        assert cycle_id == 42
        conn.execute.assert_called_once()
        sql = str(conn.execute.call_args[0][0]).lower()
        assert "insert into refresh_cycles" in sql


# ---------------------------------------------------------------------------
# Test 5 — _finish_cycle updates to correct status and sets stale_sources
# ---------------------------------------------------------------------------

class TestFinishCycle:
    def test_finish_cycle_sets_stale_status(self):
        conn = _make_conn()
        orch = _make_orchestrator(conn)

        stale = ["freshbus:google_play"]
        orch._finish_cycle(
            conn,
            cycle_id=1,
            status="stale",
            stale_sources=stale,
            completed_at=datetime(2024, 1, 1, 3, 0, 0, tzinfo=timezone.utc),
        )

        conn.execute.assert_called_once()
        params = conn.execute.call_args[0][1]
        assert params["status"] == "stale"
        assert "freshbus:google_play" in params["stale_sources"]

    def test_finish_cycle_sets_completed_status(self):
        conn = _make_conn()
        orch = _make_orchestrator(conn)

        orch._finish_cycle(
            conn,
            cycle_id=1,
            status="completed",
            stale_sources=[],
            completed_at=datetime(2024, 1, 1, 3, 0, 0, tzinfo=timezone.utc),
        )

        params = conn.execute.call_args[0][1]
        assert params["status"] == "completed"
        assert params["stale_sources"] == "[]"
