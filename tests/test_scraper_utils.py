"""
Unit tests for scraper utility modules:
  - scraper/utils/user_agents.py
  - scraper/utils/proxy_pool.py
  - scraper/utils/retry.py
"""

from __future__ import annotations

import threading
import time
from typing import List
from unittest.mock import MagicMock, call, patch

import pytest

# ---------------------------------------------------------------------------
# user_agents.py tests
# ---------------------------------------------------------------------------

from scraper.utils.user_agents import USER_AGENTS, get_random_user_agent


class TestUserAgents:
    def test_pool_has_at_least_20_entries(self):
        assert len(USER_AGENTS) >= 20

    def test_get_random_user_agent_returns_string(self):
        ua = get_random_user_agent()
        assert isinstance(ua, str)

    def test_get_random_user_agent_returns_value_from_pool(self):
        ua = get_random_user_agent()
        assert ua in USER_AGENTS

    def test_all_ua_strings_are_non_empty(self):
        for ua in USER_AGENTS:
            assert ua.strip() != "", f"Empty UA string found: {ua!r}"

    def test_multiple_calls_return_distinct_values(self):
        """Calling get_random_user_agent 50 times should yield ≥ 2 distinct values."""
        results = {get_random_user_agent() for _ in range(50)}
        assert len(results) >= 2


# ---------------------------------------------------------------------------
# proxy_pool.py tests
# ---------------------------------------------------------------------------

from scraper.utils.proxy_pool import ProxyPool


class TestProxyPool:
    def test_empty_pool_when_env_not_set(self, monkeypatch):
        monkeypatch.delenv("PROXY_LIST", raising=False)
        pool = ProxyPool()
        assert pool.size == 0
        assert pool.is_empty is True

    def test_get_next_returns_none_when_empty(self, monkeypatch):
        monkeypatch.delenv("PROXY_LIST", raising=False)
        pool = ProxyPool()
        assert pool.get_next() is None

    def test_is_empty_true_when_no_proxies(self, monkeypatch):
        monkeypatch.delenv("PROXY_LIST", raising=False)
        pool = ProxyPool()
        assert pool.is_empty is True

    def test_is_empty_false_when_populated(self, monkeypatch):
        monkeypatch.setenv("PROXY_LIST", "http://proxy1:8080")
        pool = ProxyPool()
        assert pool.is_empty is False

    def test_size_zero_for_empty_pool(self, monkeypatch):
        monkeypatch.delenv("PROXY_LIST", raising=False)
        pool = ProxyPool()
        assert pool.size == 0

    def test_size_correct_for_populated_pool(self, monkeypatch):
        monkeypatch.setenv("PROXY_LIST", "http://proxy1:8080,http://proxy2:8080,http://proxy3:8080")
        pool = ProxyPool()
        assert pool.size == 3

    def test_round_robin_cycling_with_two_proxies(self, monkeypatch):
        monkeypatch.setenv("PROXY_LIST", "http://proxy1:8080,http://proxy2:8080")
        pool = ProxyPool()
        results = [pool.get_next() for _ in range(4)]
        assert results == [
            "http://proxy1:8080",
            "http://proxy2:8080",
            "http://proxy1:8080",
            "http://proxy2:8080",
        ]

    def test_thread_safety(self, monkeypatch):
        """10 threads each call get_next() 100 times — no exceptions, all values valid."""
        monkeypatch.setenv("PROXY_LIST", "http://proxy1:8080,http://proxy2:8080")
        pool = ProxyPool()
        valid_proxies = {"http://proxy1:8080", "http://proxy2:8080"}
        collected: List[str | None] = []
        errors: List[Exception] = []
        lock = threading.Lock()

        def worker():
            local: List[str | None] = []
            try:
                for _ in range(100):
                    local.append(pool.get_next())
            except Exception as exc:
                with lock:
                    errors.append(exc)
            else:
                with lock:
                    collected.extend(local)

        threads = [threading.Thread(target=worker) for _ in range(10)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert errors == [], f"Exceptions raised in threads: {errors}"
        assert len(collected) == 1000
        for val in collected:
            assert val in valid_proxies, f"Unexpected value returned: {val!r}"


# ---------------------------------------------------------------------------
# retry.py tests
# ---------------------------------------------------------------------------

from scraper.utils.retry import RetryExhausted, with_retry


class TestWithRetry:
    def test_succeeds_on_first_try_no_sleep(self):
        """A function that never raises should not trigger any sleep."""
        with patch("time.sleep") as mock_sleep:
            @with_retry(max_retries=3, base_delay=1.0)
            def always_succeeds():
                return "ok"

            result = always_succeeds()

        assert result == "ok"
        mock_sleep.assert_not_called()

    def test_retry_exhausted_after_max_retries(self):
        """RetryExhausted is raised after max_retries failures; last_exception is set."""
        call_count = 0

        with patch("time.sleep"):
            @with_retry(max_retries=3, base_delay=0.01)
            def always_fails():
                nonlocal call_count
                call_count += 1
                raise ValueError("boom")

            with pytest.raises(RetryExhausted) as exc_info:
                always_fails()

        # max_retries=3 means 1 initial + 3 retries = 4 total calls
        assert call_count == 4
        assert isinstance(exc_info.value.last_exception, ValueError)
        assert str(exc_info.value.last_exception) == "boom"

    def test_succeeds_on_third_attempt(self):
        """Function that fails twice then succeeds should return the result."""
        attempts = []

        with patch("time.sleep"):
            @with_retry(max_retries=5, base_delay=0.01)
            def fails_twice():
                attempts.append(1)
                if len(attempts) < 3:
                    raise RuntimeError("not yet")
                return "success"

            result = fails_twice()

        assert result == "success"
        assert len(attempts) == 3

    def test_non_matching_exception_propagates_immediately(self):
        """Exceptions not in the `exceptions` tuple should propagate without retrying."""
        call_count = 0

        with patch("time.sleep") as mock_sleep:
            @with_retry(max_retries=5, base_delay=0.01, exceptions=(ValueError,))
            def raises_type_error():
                nonlocal call_count
                call_count += 1
                raise TypeError("wrong type")

            with pytest.raises(TypeError, match="wrong type"):
                raises_type_error()

        # Should only be called once — no retries for non-matching exceptions
        assert call_count == 1
        mock_sleep.assert_not_called()

    def test_delay_capped_at_max_delay(self):
        """Sleep delay must never exceed max_delay regardless of attempt number."""
        max_delay = 3.0
        sleep_calls: List[float] = []

        with patch("time.sleep", side_effect=lambda d: sleep_calls.append(d)):
            with patch("random.uniform", return_value=0.0):
                @with_retry(max_retries=5, base_delay=2.0, max_delay=max_delay)
                def always_fails():
                    raise ValueError("x")

                with pytest.raises(RetryExhausted):
                    always_fails()

        assert len(sleep_calls) == 5  # one sleep per retry (not on final failure)
        for delay in sleep_calls:
            assert delay <= max_delay, f"Delay {delay} exceeded max_delay {max_delay}"

    def test_with_retry_preserves_name_and_doc(self):
        """with_retry should preserve the wrapped function's __name__ and __doc__."""
        @with_retry(max_retries=2)
        def my_function():
            """My docstring."""
            return 42

        assert my_function.__name__ == "my_function"
        assert my_function.__doc__ == "My docstring."
