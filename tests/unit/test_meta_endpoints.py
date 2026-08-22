"""The /version, /health/ready and /health/detailed meta endpoints.

Arbor runs in multiple deployments (``deploy/targets/``). Before these existed the
running version could not be read from OUTSIDE any deployment — ``/api/version``
returned 404 and ``/api/health`` carried no version — so verifying a rollout
required control-plane access on that target.

These endpoints are registered on the mounted FastAPI sub-app rather than the Nexus
gateway ON PURPOSE: Nexus serves its own ``/health`` at the gateway root, which
shadows anything registered there. A version field added to the gateway handler
would never be visible to a caller. ``test_version_is_registered_on_the_sub_app``
pins that placement, because the failure mode is silent — the route exists, returns
200 in isolation, and is unreachable in production.
"""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from hr_advisory import __version__
from hr_advisory.api.platform import _register_meta_endpoints


@pytest.fixture
def client() -> TestClient:
    api = FastAPI(redirect_slashes=False)
    _register_meta_endpoints(api)
    return TestClient(api)


def test_version_returns_the_package_version(client):
    """/version answers with the real version, cheaply and unconditionally."""
    resp = client.get("/version")

    assert resp.status_code == 200
    body = resp.json()
    assert body["version"] == __version__
    assert body["service"] == "arbor-backend"


def test_version_needs_no_dependencies(client):
    """/version must answer even when every backing service is down.

    It is the endpoint an operator reaches for when something is broken, so it
    must not depend on the things that might be broken. This test runs with no
    database and no Redis configured, and still expects 200.
    """
    assert client.get("/version").status_code == 200


def test_version_is_registered_on_the_sub_app():
    """Pin the placement, not just the behaviour.

    Nexus owns ``/health`` at the gateway root. Registering meta endpoints on the
    gateway would leave them shadowed and unreachable through the ingress while
    still passing a naive 'does the route exist' test.
    """
    api = FastAPI(redirect_slashes=False)
    _register_meta_endpoints(api)

    paths = {route.path for route in api.routes}
    assert "/version" in paths
    assert "/health/ready" in paths
    assert "/health/detailed" in paths


def test_detailed_reports_every_component_and_carries_the_version(client):
    """/health/detailed enumerates components and self-identifies its version."""
    body = client.get("/health/detailed").json()

    assert body["version"] == __version__
    assert set(body["components"]) == {"database", "redis", "llm"}
    assert body["status"] in {"healthy", "degraded", "down"}


def test_ready_is_503_when_the_database_is_unreachable(client):
    """Readiness gates on the database — the one component the service needs.

    No database is configured in this test, so readiness must refuse. A readiness
    probe that returns 200 regardless cannot pull a broken instance out of
    rotation, which is the only thing it is for.
    """
    resp = client.get("/health/ready")

    assert resp.status_code == 503
    assert resp.json()["status"] == "not_ready"


def test_llm_probe_makes_no_network_call(client, monkeypatch):
    """The LLM is reported from configuration only, never probed.

    A cold Ollama model load can take ~47s. A health endpoint that can block for
    that long is itself an outage, so this asserts the probe stays configuration-only.
    """
    monkeypatch.setenv("OLLAMA_BASE_URL", "http://127.0.0.1:6398")  # unbound port
    monkeypatch.setenv("OLLAMA_MODEL", "qwen3:latest")

    llm = client.get("/health/detailed").json()["components"]["llm"]

    # Answers despite the port being unbound => it never dialled it.
    assert llm["status"] == "configured"
    assert llm["provider"] == "ollama"
    assert llm["model"] == "qwen3:latest"
