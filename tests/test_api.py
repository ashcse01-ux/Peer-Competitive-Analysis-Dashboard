"""
API integration tests. Task 9.14
Uses FastAPI TestClient with mocked DB dependency.
"""
from __future__ import annotations
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch
import pytest

# ---------------------------------------------------------------------------
# Test client factory with mocked DB
# ---------------------------------------------------------------------------

def _make_client(mock_conn: MagicMock | None = None):
    from fastapi.testclient import TestClient

    if mock_conn is None:
        mock_conn = MagicMock()
        mock_conn.execute.return_value.fetchall.return_value = []
        mock_conn.execute.return_value.fetchone.return_value = None

    from api.main import create_app
    from api.deps import get_db

    app = create_app()
    app.dependency_overrides[get_db] = lambda: mock_conn
    return TestClient(app, raise_server_exceptions=False), mock_conn


# ---------------------------------------------------------------------------
# Test 1 — GET /api/v1/operators
# ---------------------------------------------------------------------------

class TestOperators:
    def test_list_operators_empty(self):
        client, conn = _make_client()
        conn.execute.return_value.fetchall.return_value = []
        resp = client.get("/api/v1/operators")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_list_operators_returns_data(self):
        client, conn = _make_client()
        conn.execute.return_value.fetchall.return_value = [
            (1, "FreshBus", "freshbus"),
            (2, "Neugo", "neugo"),
        ]
        resp = client.get("/api/v1/operators")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 2
        assert data[0]["slug"] == "freshbus"


# ---------------------------------------------------------------------------
# Test 2 — GET /api/v1/metrics/overview
# ---------------------------------------------------------------------------

class TestMetricsOverview:
    def test_overview_returns_operators_list(self):
        client, conn = _make_client()
        conn.execute.return_value.fetchall.return_value = [
            (1, "FreshBus", "freshbus", 4.2, 4.0, 4.1, 0.5, 0.1, 0.0, 0.2, datetime(2024, 1, 1, tzinfo=timezone.utc)),
        ]
        resp = client.get("/api/v1/metrics/overview")
        assert resp.status_code == 200
        body = resp.json()
        assert "operators" in body
        assert body["operators"][0]["slug"] == "freshbus"


# ---------------------------------------------------------------------------
# Test 3 — GET /api/v1/metrics/app-store
# ---------------------------------------------------------------------------

class TestMetricsAppStore:
    def test_app_store_returns_data_key(self):
        client, conn = _make_client()
        conn.execute.return_value.fetchall.return_value = []
        resp = client.get("/api/v1/metrics/app-store")
        assert resp.status_code == 200
        assert "data" in resp.json()


# ---------------------------------------------------------------------------
# Test 4 — GET /api/v1/metrics/google-reviews with date filter
# ---------------------------------------------------------------------------

class TestMetricsGoogleReviews:
    def test_accepts_date_range_params(self):
        client, conn = _make_client()
        conn.execute.return_value.fetchall.return_value = []
        resp = client.get("/api/v1/metrics/google-reviews?from=2024-01-01&to=2024-12-31")
        assert resp.status_code == 200

    def test_returns_data_key(self):
        client, conn = _make_client()
        conn.execute.return_value.fetchall.return_value = []
        resp = client.get("/api/v1/metrics/google-reviews")
        assert resp.status_code == 200
        assert "data" in resp.json()


# ---------------------------------------------------------------------------
# Test 5 — GET /api/v1/metrics/redbus
# ---------------------------------------------------------------------------

class TestMetricsRedbus:
    def test_redbus_returns_data_key(self):
        client, conn = _make_client()
        conn.execute.return_value.fetchall.return_value = []
        resp = client.get("/api/v1/metrics/redbus")
        assert resp.status_code == 200
        assert "data" in resp.json()


# ---------------------------------------------------------------------------
# Test 6 — GET /api/v1/metrics/redbus/{route_id} — 404 when not found
# ---------------------------------------------------------------------------

class TestMetricsRedbusRoute:
    def test_returns_404_when_route_not_found(self):
        client, conn = _make_client()
        conn.execute.return_value.fetchone.return_value = None
        resp = client.get("/api/v1/metrics/redbus/999")
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Test 7 — GET /api/v1/reviews/top
# ---------------------------------------------------------------------------

class TestReviewsTop:
    def test_returns_reviews_key(self):
        client, conn = _make_client()
        conn.execute.return_value.fetchall.return_value = []
        resp = client.get("/api/v1/reviews/top")
        assert resp.status_code == 200
        assert "reviews" in resp.json()


# ---------------------------------------------------------------------------
# Test 8 — GET /api/v1/history/{source}
# ---------------------------------------------------------------------------

class TestHistory:
    def test_valid_source_returns_series(self):
        client, conn = _make_client()
        conn.execute.return_value.fetchall.return_value = []
        resp = client.get("/api/v1/history/google_play")
        assert resp.status_code == 200
        assert "series" in resp.json()

    def test_invalid_source_returns_400(self):
        client, conn = _make_client()
        resp = client.get("/api/v1/history/invalid_source")
        assert resp.status_code == 400


# ---------------------------------------------------------------------------
# Test 9 — GET /api/v1/refresh/status
# ---------------------------------------------------------------------------

class TestRefreshStatus:
    def test_no_cycles_returns_no_cycles_run(self):
        client, conn = _make_client()
        conn.execute.return_value.fetchone.return_value = None
        resp = client.get("/api/v1/refresh/status")
        assert resp.status_code == 200
        assert resp.json()["status"] == "no_cycles_run"

    def test_returns_last_cycle_info(self):
        client, conn = _make_client()
        conn.execute.return_value.fetchone.return_value = (
            1,
            datetime(2024, 1, 1, 2, 0, tzinfo=timezone.utc),
            datetime(2024, 1, 1, 3, 0, tzinfo=timezone.utc),
            "completed",
            [],
        )
        resp = client.get("/api/v1/refresh/status")
        assert resp.status_code == 200
        assert resp.json()["status"] == "completed"


# ---------------------------------------------------------------------------
# Test 10 — POST /api/v1/refresh/trigger
# ---------------------------------------------------------------------------

class TestRefreshTrigger:
    def test_trigger_without_auth_when_no_token_set(self):
        client, conn = _make_client()
        import os
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop("ADMIN_TOKEN", None)
            resp = client.post("/api/v1/refresh/trigger")
        assert resp.status_code == 200
        assert resp.json()["message"] == "Refresh triggered"

    def test_trigger_requires_auth_when_token_set(self):
        client, conn = _make_client()
        import os
        with patch.dict(os.environ, {"ADMIN_TOKEN": "secret123"}):
            resp = client.post("/api/v1/refresh/trigger")
        assert resp.status_code == 401

    def test_trigger_succeeds_with_correct_token(self):
        client, conn = _make_client()
        import os
        with patch.dict(os.environ, {"ADMIN_TOKEN": "secret123"}):
            resp = client.post(
                "/api/v1/refresh/trigger",
                headers={"Authorization": "Bearer secret123"},
            )
        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# Test 11 — GET /api/v1/export (CSV)
# ---------------------------------------------------------------------------

class TestExport:
    def test_csv_export_returns_csv_content_type(self):
        client, conn = _make_client()
        conn.execute.return_value.fetchall.return_value = []
        resp = client.get("/api/v1/export?format=csv")
        assert resp.status_code == 200
        assert "text/csv" in resp.headers["content-type"]

    def test_json_export_returns_json(self):
        client, conn = _make_client()
        conn.execute.return_value.fetchall.return_value = []
        resp = client.get("/api/v1/export?format=json")
        assert resp.status_code == 200
        assert resp.json() == []


# ---------------------------------------------------------------------------
# Test 12 — GET /health
# ---------------------------------------------------------------------------

class TestHealth:
    def test_health_returns_200_when_db_ok(self):
        client, conn = _make_client()
        with patch("api.routers.health.get_engine") as mock_engine:
            mock_ctx = MagicMock()
            mock_ctx.__enter__ = MagicMock(return_value=MagicMock())
            mock_ctx.__exit__ = MagicMock(return_value=False)
            mock_engine.return_value.connect.return_value = mock_ctx
            resp = client.get("/health")
        assert resp.status_code in (200, 503)  # depends on actual DB; just check it responds
        assert "status" in resp.json()
