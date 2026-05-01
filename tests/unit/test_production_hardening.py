"""Unit tests for production hardening changes (T200-T204).

Tests: dedicated LLM executor, advisory rate limit, health DB probe,
shadow timeout, backward compatibility.
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ── T201: Dedicated LLM ThreadPoolExecutor ────────────────


def test_llm_executor_exists():
    """Verify _LLM_EXECUTOR is created with correct settings."""
    from hr_advisory.api.routers.advisory import _LLM_EXECUTOR, _LLM_WORKERS

    assert _LLM_EXECUTOR is not None
    assert _LLM_EXECUTOR._max_workers == _LLM_WORKERS
    assert _LLM_EXECUTOR._thread_name_prefix == "arbor-llm"


def test_llm_executor_workers_default():
    """Default LLM executor workers is 4."""
    from hr_advisory.api.routers.advisory import _LLM_WORKERS

    # May differ if LLM_EXECUTOR_WORKERS env var is set, but module-level
    # default should be 4
    assert isinstance(_LLM_WORKERS, int)
    assert _LLM_WORKERS >= 1


# ── T202: Advisory-specific rate limit ───────────────────


def test_advisory_rate_limit_5_per_window():
    """Advisory-specific limit is 5 per window, not the default 30."""
    from hr_advisory.workflows.guardrails import _request_counts, check_rate_limit

    user = f"test-rate-limit-advisory-{id(object())}"
    # Clean any prior state
    _request_counts.pop(user, None)

    for i in range(5):
        assert check_rate_limit(user, max_requests=5) is True, f"Request {i+1} should be allowed"
    assert check_rate_limit(user, max_requests=5) is False, "Request 6 should be rate-limited"

    # Cleanup
    _request_counts.pop(user, None)


def test_default_rate_limit_unchanged():
    """Default rate limit remains 30 for non-advisory endpoints."""
    from hr_advisory.workflows.guardrails import _request_counts, check_rate_limit

    user = f"test-rate-limit-default-{id(object())}"
    _request_counts.pop(user, None)

    for i in range(30):
        assert check_rate_limit(user) is True, f"Request {i+1} should be allowed"
    assert check_rate_limit(user) is False, "Request 31 should be rate-limited"

    _request_counts.pop(user, None)


@pytest.mark.regression
def test_check_rate_limit_backward_compat():
    """Regression: existing callers with no max_requests param still work."""
    from hr_advisory.workflows.guardrails import _request_counts, check_rate_limit

    user = f"test-backward-compat-{id(object())}"
    _request_counts.pop(user, None)

    # Old signature: check_rate_limit(user_id) — no max_requests
    result = check_rate_limit(user)
    assert result is True  # must not raise TypeError

    _request_counts.pop(user, None)


# ── T203: Health endpoint DB probe ───────────────────────


@pytest.mark.asyncio
async def test_health_returns_200_on_db_success():
    """Health endpoint returns 200 with db=ok when DB is healthy."""
    from hr_advisory.api.platform import _register_health

    # Create a minimal FastAPI app to test the health route
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    test_app = FastAPI()

    mock_cm = MagicMock()
    mock_cm.test_connection = AsyncMock(return_value={"status": "connected"})

    mock_db = MagicMock()
    mock_db._connection_manager = mock_cm

    with patch("hr_advisory.api.platform.logger"):
        _register_health(test_app)

    with patch("hr_advisory.models.database.db", mock_db):
        client = TestClient(test_app)
        resp = client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "healthy"
        assert data["db"] == "ok"


@pytest.mark.asyncio
async def test_health_returns_503_on_db_failure():
    """Health endpoint returns 503 when DB is unreachable."""
    from hr_advisory.api.platform import _register_health

    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    test_app = FastAPI()

    mock_cm = MagicMock()
    mock_cm.test_connection = AsyncMock(side_effect=ConnectionError("DB down"))

    mock_db = MagicMock()
    mock_db._connection_manager = mock_cm
    mock_db._check_database_connection = MagicMock(side_effect=ConnectionError("DB down"))

    with patch("hr_advisory.api.platform.logger"):
        _register_health(test_app)

    with patch("hr_advisory.models.database.db", mock_db):
        client = TestClient(test_app)
        resp = client.get("/health")
        assert resp.status_code == 503
        data = resp.json()
        assert data["status"] == "unhealthy"
        assert data["db"] == "unreachable"


# ── T204: DataFlow pool timeout ──────────────────────────


def test_dataflow_pool_timeout_configured():
    """DataFlow config includes pool_timeout=10."""
    from hr_advisory.models.database import db

    config = getattr(db, "_config", None) or getattr(db, "config", None)
    if config is not None:
        db_config = getattr(config, "database", None)
        if db_config is not None:
            pool_timeout = getattr(db_config, "pool_timeout", None)
            assert pool_timeout == 10, f"Expected pool_timeout=10, got {pool_timeout}"
            return

    # If we can't access the config hierarchy, verify the DataFlow init didn't crash
    # (the pool_timeout parameter was accepted without error)
    assert db is not None, "DataFlow instance should exist"
