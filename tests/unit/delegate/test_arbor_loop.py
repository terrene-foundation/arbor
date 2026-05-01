"""Tests for the Delegate adapter injection seam (T113).

Verifies:
- DelegateConfig accepts an adapter and threads it through to Delegate
- os.environ is never mutated by create_delegate (C1 regression)
- Concurrent create_delegate calls with different adapters are isolated
"""

import os

import pytest

from hr_advisory.delegate.arbor_loop import DelegateConfig, create_delegate


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def ollama_only_env(monkeypatch):
    """Force tests to use Ollama by removing OpenAI env vars."""
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_BASE_URL", raising=False)


@pytest.fixture
def _make_ollama_adapter():
    """Build an OllamaStreamAdapter for testing."""
    from kaizen_agents.delegate.adapters.ollama_adapter import OllamaStreamAdapter

    def _factory(base_url: str = "http://test-ollama:11434", model: str = "llama3.1:8b"):
        return OllamaStreamAdapter(base_url=base_url, default_model=model)

    return _factory


# ---------------------------------------------------------------------------
# T113: Adapter injection
# ---------------------------------------------------------------------------


def test_delegate_config_adapter_injection(_make_ollama_adapter):
    """DelegateConfig(adapter=...) threads the adapter into the Delegate."""
    adapter = _make_ollama_adapter()
    config = DelegateConfig(adapter=adapter)
    delegate = create_delegate(config)
    # Identity check: the exact adapter instance is plumbed through
    assert delegate.loop._adapter is adapter


def test_delegate_config_require_server_default_raises(ollama_only_env):
    """require_server_default=True without an adapter raises RuntimeError."""
    config = DelegateConfig(require_server_default=True)
    with pytest.raises(RuntimeError, match="adapter is required in request context"):
        create_delegate(config)


# ---------------------------------------------------------------------------
# C1 regression: env-mutation leak
# ---------------------------------------------------------------------------


def test_C1_create_delegate_does_not_leak_byok_to_subsequent_request(
    monkeypatch, _make_ollama_adapter
):
    """Regression: C1 multi-tenant env poisoning.

    Request A configured with Ollama BYOK (explicit adapter); request B
    configured with no adapter and require_server_default=True. After A
    runs, B must NOT see A's base_url or api_key in os.environ.
    """
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_BASE_URL", raising=False)

    # Request A: explicit Ollama adapter (BYOK company A)
    adapter_a = _make_ollama_adapter(base_url="http://customer-a-dgx:11434")
    cfg_a = DelegateConfig(adapter=adapter_a, company_id=1)
    create_delegate(cfg_a)

    # Request B: no adapter, request context (company B on server default)
    cfg_b = DelegateConfig(require_server_default=True, company_id=2)
    with pytest.raises(RuntimeError, match="adapter is required in request context"):
        create_delegate(cfg_b)

    # Final invariant: env was NOT mutated by request A
    assert "OPENAI_API_KEY" not in os.environ
    assert "OPENAI_BASE_URL" not in os.environ


def test_create_delegate_env_fallback_works_for_legacy_callers(monkeypatch):
    """Legacy callers (scripts, tests) with adapter=None and
    require_server_default=False should still work via env resolution."""
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test-legacy")
    monkeypatch.setenv("DEFAULT_LLM_MODEL", "gpt-5-mini")
    config = DelegateConfig()  # defaults: adapter=None, require_server_default=False
    delegate = create_delegate(config)
    assert delegate is not None


# ---------------------------------------------------------------------------
# Concurrency: adapter isolation
# ---------------------------------------------------------------------------


def test_concurrent_create_delegate_isolated(_make_ollama_adapter):
    """Two create_delegate calls with different adapters produce isolated
    delegates — no shared state, no cross-contamination."""
    from kaizen_agents.delegate.adapters.ollama_adapter import OllamaStreamAdapter

    adapter_a = OllamaStreamAdapter(base_url="http://a:11434", default_model="llama3.1:8b")
    adapter_b = OllamaStreamAdapter(base_url="http://b:11434", default_model="qwen2.5:32b")

    cfg_a = DelegateConfig(adapter=adapter_a)
    cfg_b = DelegateConfig(adapter=adapter_b)

    from concurrent.futures import ThreadPoolExecutor

    with ThreadPoolExecutor(max_workers=2) as pool:
        future_a = pool.submit(create_delegate, cfg_a)
        future_b = pool.submit(create_delegate, cfg_b)
        da = future_a.result()
        db = future_b.result()

    assert da.loop._adapter is adapter_a
    assert db.loop._adapter is adapter_b
    assert da.loop._adapter is not db.loop._adapter


# ---------------------------------------------------------------------------
# Ollama-first env fallback (legacy/script/test path)
# ---------------------------------------------------------------------------


def test_env_fallback_resolves_ollama_when_openai_absent(monkeypatch):
    """_resolve_llm_settings_from_env picks Ollama when only OLLAMA_* are set.

    Regression: arbor runs Ollama-first, but the legacy env fallback
    previously defaulted to OpenAI even with OLLAMA_BASE_URL + OLLAMA_MODEL
    set, causing adversarial-runner and other script-path callers to fail
    with "No OpenAI API key found".
    """
    from hr_advisory.delegate.arbor_loop import (
        DelegateConfig,
        _resolve_llm_settings_from_env,
    )

    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("LLM_MODEL", raising=False)
    monkeypatch.delenv("DEFAULT_LLM_MODEL", raising=False)
    monkeypatch.delenv("OPENAI_PROD_MODEL", raising=False)
    monkeypatch.setenv("OLLAMA_BASE_URL", "http://localhost:11434")
    monkeypatch.setenv("OLLAMA_MODEL", "qwen3:latest")

    provider, model, api_key, base_url = _resolve_llm_settings_from_env(DelegateConfig())
    assert provider == "ollama"
    assert model == "qwen3:latest"
    assert base_url == "http://localhost:11434"


def test_env_fallback_prefers_openai_when_key_present(monkeypatch):
    """OpenAI wins over Ollama when OPENAI_API_KEY is set."""
    from hr_advisory.delegate.arbor_loop import (
        DelegateConfig,
        _resolve_llm_settings_from_env,
    )

    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    monkeypatch.setenv("LLM_MODEL", "gpt-5-test")
    monkeypatch.setenv("OLLAMA_BASE_URL", "http://localhost:11434")
    monkeypatch.setenv("OLLAMA_MODEL", "qwen3:latest")

    provider, model, _api_key, _base_url = _resolve_llm_settings_from_env(DelegateConfig())
    assert provider == "openai"
    assert model == "gpt-5-test"


def test_create_delegate_builds_ollama_adapter_in_legacy_path(ollama_only_env, monkeypatch):
    """create_delegate builds an OllamaStreamAdapter when provider=ollama."""
    from kaizen_agents.delegate.adapters.ollama_adapter import OllamaStreamAdapter

    monkeypatch.setenv("OLLAMA_BASE_URL", "http://localhost:11434")
    monkeypatch.setenv("OLLAMA_MODEL", "qwen3:latest")

    delegate = create_delegate(DelegateConfig())
    assert isinstance(delegate.loop._adapter, OllamaStreamAdapter)
