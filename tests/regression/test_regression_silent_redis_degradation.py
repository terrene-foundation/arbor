"""Regression: Redis degradation must be OBSERVABLE, not silent.

Both Redis consumers fail soft — the session store falls back to in-memory and the
JWT token blocklist falls back to ``InMemoryBlocklist``. The service keeps serving,
so a liveness check reports healthy either way. What is silently lost when Redis is
configured but unreachable:

* sessions become per-process — lost on restart, broken across replicas
* token revocation becomes per-process — a token revoked on one replica is still
  accepted by every other replica until it expires

Neither is visible from outside the deployment unless something reports it. These
tests pin the reporting, not the fallback: the fallback is correct behaviour, its
INVISIBILITY was the defect.

The load-bearing property is DISCRIMINATION — the probe must return three different
answers for three different states. A probe that returned "degraded" unconditionally
would pass a single-state test while carrying no information.

Origin: surfaced during the #45 Kailash SDK upgrade, when newer `kailash` stopped
pulling `redis` in transitively and the fallback engaged with no loud signal.
"""

from __future__ import annotations

import threading

import pytest

from hr_advisory.api.health_components import overall_status, probe_redis

# Serialize every test that mutates REDIS_URL through ONE lock domain.
# monkeypatch restores at teardown — i.e. AFTER the test body — so without this a
# sibling test running under xdist can observe either value (testing.md § env-var
# lock discipline). No other test in this repo currently touches REDIS_URL; this
# lock is the domain any future one MUST join rather than introducing a second
# mechanism, which would not interlock with this one.
_REDIS_ENV_LOCK = threading.Lock()


@pytest.fixture
def _redis_env_serialized():
    with _REDIS_ENV_LOCK:
        yield


@pytest.mark.regression
def test_unreachable_redis_reports_degraded_not_healthy(monkeypatch, _redis_env_serialized):
    """REDIS_URL set but unreachable => `degraded`, with the impact stated."""
    # Port 6398 is deliberately unbound — this asserts the CONFIGURED-BUT-BROKEN
    # branch, which is the one that used to be silent.
    monkeypatch.setenv("REDIS_URL", "redis://127.0.0.1:6398/0")

    result = probe_redis()

    assert result["status"] == "degraded", (
        "A configured-but-unreachable Redis must report degraded. Reporting it as "
        "healthy is the silent-degradation defect this test exists to catch."
    )
    # The operator needs to know WHAT was lost, not merely that something was.
    impact = result.get("impact", "")
    assert "replica" in impact.lower(), f"impact must name the cross-replica loss; got: {impact!r}"
    assert "revocation" in impact.lower(), f"impact must name revocation loss; got: {impact!r}"


@pytest.mark.regression
def test_absent_redis_is_not_configured_not_degraded(monkeypatch, _redis_env_serialized):
    """No REDIS_URL => `not_configured`. A deployment choice is not a fault.

    This is the other pole. Collapsing these two states into one would make the
    degraded signal fire constantly in local development, and a signal that always
    fires is one operators learn to ignore.
    """
    monkeypatch.delenv("REDIS_URL", raising=False)

    result = probe_redis()

    assert result["status"] == "not_configured"
    assert result["status"] != "degraded"


@pytest.mark.regression
def test_probe_discriminates_between_the_two_absent_states(monkeypatch, _redis_env_serialized):
    """The two non-ok states MUST be distinguishable.

    Guards against a future 'simplification' that collapses them — at which point
    the probe still returns a value on every call but no longer carries the one
    distinction it was built for.
    """
    monkeypatch.delenv("REDIS_URL", raising=False)
    absent = probe_redis()["status"]

    monkeypatch.setenv("REDIS_URL", "redis://127.0.0.1:6398/0")
    broken = probe_redis()["status"]

    assert absent != broken, (
        f"probe_redis returned {absent!r} for both absent and broken Redis — "
        "it cannot discriminate, so its output is not evidence of anything."
    )


@pytest.mark.regression
def test_overall_status_treats_configured_failure_as_degraded_but_absence_as_healthy():
    """`not_configured` must not drag overall status down; `degraded` must."""
    assert overall_status({"redis": {"status": "not_configured"}}) == "healthy"
    assert overall_status({"redis": {"status": "degraded"}}) == "degraded"
    assert overall_status({"redis": {"status": "ok"}}) == "healthy"
    # `down` outranks `degraded` — a hard failure is not softened by a soft one.
    assert (
        overall_status({"db": {"status": "down"}, "redis": {"status": "degraded"}}) == "down"
    )
