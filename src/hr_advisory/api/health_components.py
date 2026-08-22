"""Component probes behind the readiness and detailed-health endpoints.

Arbor runs in multiple deployments (see ``deploy/targets/``), and the operator of
any one of them needs two questions answered from OUTSIDE the deployment, without
control-plane access:

1. What version is running?
2. Is anything silently degraded?

Question 2 exists because several components fail SOFT — Arbor keeps serving, but
with reduced guarantees. A soft failure that is not reported is indistinguishable
from health, so each probe below reports its own ``status`` and, when degraded,
the concrete ``impact`` of that degradation rather than a bare boolean.

No probe here performs a slow or expensive call. The LLM is deliberately NOT
probed: a cold Ollama inference can take ~47s, which would turn a health check
into an outage. Provider configuration is reported without a network round-trip.
"""

from __future__ import annotations

import asyncio
import logging
import os
from typing import Any

logger = logging.getLogger(__name__)

# Bound every probe so a hung dependency cannot hang the health endpoint itself.
_PROBE_TIMEOUT_SECONDS = 5.0


async def probe_database() -> dict[str, Any]:
    """Probe the DataFlow connection pool with a lightweight liveness check.

    Delegates to the DataFlow connection manager's own ``test_connection`` — a
    lightweight liveness check on a dedicated connection — rather than running a
    workflow. Per the connection-pool guidance a health check must never take a
    pooled worker, and per framework-first this probe issues no query of its own.
    """
    try:
        from hr_advisory.models.database import db as dataflow_db

        cm = getattr(dataflow_db, "_connection_manager", None)
        if cm is None or not hasattr(cm, "test_connection"):
            return {
                "status": "unknown",
                "detail": "connection manager not initialised",
            }

        result = await asyncio.wait_for(
            cm.test_connection(), timeout=_PROBE_TIMEOUT_SECONDS
        )
        if result.get("status") == "connected":
            return {"status": "ok"}
        return {"status": "down", "detail": "connection test did not report connected"}
    except asyncio.TimeoutError:
        return {
            "status": "down",
            "detail": f"connection test exceeded {_PROBE_TIMEOUT_SECONDS}s",
        }
    except Exception as exc:  # pragma: no cover - defensive
        return {"status": "down", "detail": type(exc).__name__}


def probe_redis() -> dict[str, Any]:
    """Probe Redis, distinguishing NOT-CONFIGURED from CONFIGURED-BUT-UNREACHABLE.

    The distinction is the whole point. Both consumers of Redis — the session
    store and the JWT token blocklist — fall back to in-process implementations
    when Redis is absent, so the service keeps answering either way:

    * ``not_configured`` — no ``REDIS_URL``. Intended for local development.
    * ``degraded``       — ``REDIS_URL`` is set but unreachable. A real fault:
      sessions become per-process (lost on restart) and token revocation becomes
      per-process too, so a token revoked on one replica is still accepted by
      every other replica until it expires.

    The second case is what this probe exists to surface. Reporting it as plain
    "healthy" is how a multi-replica deployment silently loses cross-replica
    session and revocation semantics.
    """
    redis_url = os.environ.get("REDIS_URL")
    if not redis_url:
        return {
            "status": "not_configured",
            "detail": "REDIS_URL unset; sessions and token revocation are per-process",
        }

    try:
        import redis as redis_lib

        client = redis_lib.from_url(redis_url, decode_responses=True)
        client.ping()
        return {"status": "ok"}
    except Exception as exc:
        return {
            "status": "degraded",
            "detail": type(exc).__name__,
            "impact": (
                "REDIS_URL is configured but unreachable. Sessions and JWT token "
                "revocation have fallen back to per-process in-memory stores: "
                "revocations do not propagate across replicas and are lost on restart."
            ),
        }


def probe_llm_config() -> dict[str, Any]:
    """Report LLM provider configuration WITHOUT a network round-trip.

    Deliberately configuration-only: a cold model load can take tens of seconds,
    and a health endpoint that can block for that long is itself an outage. This
    reports what the service is pointed at, never whether it answered.
    """
    if os.environ.get("OLLAMA_BASE_URL"):
        return {
            "status": "configured",
            "provider": "ollama",
            "model": os.environ.get("OLLAMA_MODEL", "unset"),
            "detail": "not probed — a cold model load can exceed any sane health budget",
        }
    for env_var, provider in (
        ("OPENAI_API_KEY", "openai"),
        ("ANTHROPIC_API_KEY", "anthropic"),
        ("GOOGLE_API_KEY", "google"),
        ("GEMINI_API_KEY", "google"),
    ):
        if os.environ.get(env_var):
            return {"status": "configured", "provider": provider, "detail": "not probed"}
    return {"status": "not_configured", "detail": "no LLM provider configured"}


def overall_status(components: dict[str, dict[str, Any]]) -> str:
    """Reduce component statuses to one overall verdict.

    ``down``      — at least one component the service cannot serve without.
    ``degraded``  — the service answers, but with reduced guarantees.
    ``healthy``   — nothing is reporting a fault.

    ``not_configured`` is NOT degraded: an unconfigured optional component is a
    deployment choice, not a fault. ``degraded`` is reserved for a component that
    was configured and then failed, which is the case an operator must see.
    """
    statuses = {name: c.get("status") for name, c in components.items()}
    if any(s == "down" for s in statuses.values()):
        return "down"
    if any(s == "degraded" for s in statuses.values()):
        return "degraded"
    return "healthy"
