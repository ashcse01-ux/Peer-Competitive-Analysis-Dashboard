"""
Structured JSON logger for the scraper module.

Provides ISO 8601 timestamps, log level, logger name, and message via structlog.
Log level is read from the LOG_LEVEL environment variable when not passed explicitly.
"""

from __future__ import annotations

import logging
import os
import sys

import structlog

__all__ = [
    "configure_logging",
    "get_logger",
    "log_http_request",
    "log_http_response",
    "log_http_error",
]


def configure_logging(log_level: str | None = None) -> None:
    """Configure structlog to output JSON to stdout.

    Sets up processors that emit ISO 8601 timestamps, log level, logger name,
    and message. Falls back to the LOG_LEVEL environment variable when
    ``log_level`` is not provided, defaulting to ``"INFO"``.

    Args:
        log_level: Optional log level string (e.g. "DEBUG", "INFO", "WARNING").
                   If *None* or empty, reads from the ``LOG_LEVEL`` env var.
    """
    resolved_level: str = (
        log_level
        if log_level
        else os.environ.get("LOG_LEVEL", "INFO")
    ).upper()

    numeric_level = getattr(logging, resolved_level, logging.INFO)

    # Configure the standard library root logger so structlog has a backend.
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=numeric_level,
    )

    structlog.configure(
        processors=[
            # Add log level to the event dict.
            structlog.stdlib.add_log_level,
            # Add logger name to the event dict.
            structlog.stdlib.add_logger_name,
            # Render timestamps as ISO 8601 UTC strings.
            structlog.processors.TimeStamper(fmt="iso", utc=True),
            # Render stack traces for exceptions.
            structlog.processors.StackInfoRenderer(),
            # Format exceptions.
            structlog.processors.format_exc_info,
            # Serialize the event dict to a JSON string.
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.stdlib.BoundLogger,
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )


def get_logger(name: str) -> structlog.stdlib.BoundLogger:
    """Return a bound structlog logger for the given *name*.

    Args:
        name: Identifies the logger (e.g. the module ``__name__``).

    Returns:
        A :class:`structlog.stdlib.BoundLogger` bound with the provided name.
    """
    return structlog.get_logger(name)


# ---------------------------------------------------------------------------
# Helper functions for common scraper HTTP events
# ---------------------------------------------------------------------------


def log_http_request(
    logger: structlog.stdlib.BoundLogger,
    method: str,
    url: str,
    proxy: str | None = None,
) -> None:
    """Log an outgoing HTTP request.

    Emits a structured JSON record with ``event="http_request"``.

    Args:
        logger: Bound logger instance obtained from :func:`get_logger`.
        method: HTTP method (e.g. ``"GET"``, ``"POST"``).
        url: Target URL.
        proxy: Proxy address being used, or *None* if no proxy.
    """
    logger.info(
        "http_request",
        method=method,
        url=url,
        proxy=proxy,
    )


def log_http_response(
    logger: structlog.stdlib.BoundLogger,
    method: str,
    url: str,
    status_code: int,
    elapsed_ms: float,
) -> None:
    """Log a received HTTP response.

    Emits a structured JSON record with ``event="http_response"``.

    Args:
        logger: Bound logger instance obtained from :func:`get_logger`.
        method: HTTP method of the originating request.
        url: URL of the originating request.
        status_code: HTTP status code returned by the server.
        elapsed_ms: Round-trip time in milliseconds.
    """
    logger.info(
        "http_response",
        method=method,
        url=url,
        status_code=status_code,
        elapsed_ms=elapsed_ms,
    )


def log_http_error(
    logger: structlog.stdlib.BoundLogger,
    method: str,
    url: str,
    error: str,
    attempt: int,
) -> None:
    """Log an HTTP error (e.g. a failed request that will be retried).

    Emits a structured JSON record with ``event="http_error"`` at WARNING level.

    Args:
        logger: Bound logger instance obtained from :func:`get_logger`.
        method: HTTP method of the failing request.
        url: URL of the failing request.
        error: Human-readable error description.
        attempt: The attempt number (1-based) at which the error occurred.
    """
    logger.warning(
        "http_error",
        method=method,
        url=url,
        error=error,
        attempt=attempt,
    )
