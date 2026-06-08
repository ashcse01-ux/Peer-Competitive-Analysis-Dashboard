"""
Exponential back-off retry decorator for the scraper utility layer.

Provides:
  - ``with_retry`` — decorator factory with configurable retries, delays, and jitter
  - ``RetryExhausted`` — raised after all retry attempts are consumed, wrapping the
    original exception so callers can distinguish exhausted retries from other errors.
"""

from __future__ import annotations

import functools
import random
import time
from typing import Callable, Tuple, Type

import structlog

__all__ = ["RetryExhausted", "with_retry"]

logger = structlog.get_logger(__name__)


class RetryExhausted(Exception):
    """Raised when all retry attempts are exhausted.

    Attributes:
        last_exception: The final exception that caused retry failure.
    """

    def __init__(self, last_exception: Exception) -> None:
        self.last_exception = last_exception
        super().__init__(
            f"All retries exhausted. Last error: {last_exception!r}"
        )


def with_retry(
    max_retries: int = 5,
    base_delay: float = 2.0,
    max_delay: float = 8.0,
    exceptions: Tuple[Type[Exception], ...] = (Exception,),
) -> Callable:
    """Decorator factory that retries a sync function with exponential back-off.

    The delay before each retry attempt is computed as::

        delay = min(base_delay * (2 ** attempt) + jitter, max_delay)

    where ``jitter = random.uniform(0, 1)`` and ``attempt`` is 0-indexed.

    Args:
        max_retries: Maximum number of retry attempts (default 5).
        base_delay: Base delay in seconds for exponential back-off (default 2.0 s).
        max_delay: Maximum delay cap in seconds (default 8.0 s).
        exceptions: Tuple of exception types that should trigger a retry.
                    Exceptions not in this tuple propagate immediately.

    Returns:
        A decorator that wraps the target function with retry logic.

    Raises:
        RetryExhausted: After all ``max_retries`` attempts fail, wrapping the
            last exception that was raised.

    Example::

        @with_retry(max_retries=3, base_delay=1.0, max_delay=4.0)
        def fetch_page(url: str) -> str:
            ...
    """

    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            last_exc: Exception | None = None

            for attempt in range(max_retries + 1):
                try:
                    return func(*args, **kwargs)
                except exceptions as exc:  # type: ignore[misc]
                    last_exc = exc

                    if attempt == max_retries:
                        # All attempts consumed — break out to raise RetryExhausted
                        break

                    jitter = random.uniform(0, 1)
                    delay = min(base_delay * (2 ** attempt) + jitter, max_delay)

                    logger.warning(
                        "retry_attempt",
                        function=func.__qualname__,
                        attempt=attempt + 1,
                        max_retries=max_retries,
                        delay_seconds=round(delay, 3),
                        exception_type=type(exc).__name__,
                        exception_message=str(exc),
                    )

                    time.sleep(delay)

            raise RetryExhausted(last_exc)  # type: ignore[arg-type]

        return wrapper

    return decorator
