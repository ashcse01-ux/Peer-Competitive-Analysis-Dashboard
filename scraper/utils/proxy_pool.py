"""
Round-robin proxy pool for the scraper.

Reads proxy URLs from the ``PROXY_LIST`` environment variable
(comma-separated list of proxy URLs) and vends them in a cyclic,
thread-safe fashion via :meth:`ProxyPool.get_next`.

Example ``PROXY_LIST`` value::

    http://user:pass@proxy1:8080,http://user:pass@proxy2:8080

If the environment variable is absent or blank, the pool is empty and
:meth:`ProxyPool.get_next` returns ``None``.
"""

import itertools
import os
import threading
from typing import Iterator

__all__ = ["ProxyPool"]


class ProxyPool:
    """Thread-safe round-robin proxy pool backed by the ``PROXY_LIST`` env var.

    Parameters
    ----------
    proxy_list_env:
        Name of the environment variable to read.  Defaults to ``"PROXY_LIST"``.
    """

    def __init__(self, proxy_list_env: str = "PROXY_LIST") -> None:
        raw = os.environ.get(proxy_list_env, "").strip()
        self._proxies: list[str] = (
            [p.strip() for p in raw.split(",") if p.strip()]
            if raw
            else []
        )
        self._lock = threading.Lock()
        self._cycle: Iterator[str] = itertools.cycle(self._proxies) if self._proxies else iter([])

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def get_next(self) -> str | None:
        """Return the next proxy URL in the round-robin cycle.

        Returns ``None`` when the pool is empty (env var not set or blank).
        This method is safe to call from multiple threads concurrently.
        """
        with self._lock:
            if not self._proxies:
                return None
            return next(self._cycle)

    @property
    def is_empty(self) -> bool:
        """``True`` when no proxies are available."""
        return len(self._proxies) == 0

    @property
    def size(self) -> int:
        """Number of proxy URLs in the pool."""
        return len(self._proxies)
