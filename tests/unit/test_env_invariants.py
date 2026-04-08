"""Unit tests for _validate_env_invariants — init-time LLM config validation.

T117 — Phase 6: Init-time tool-capability invariant.
Tests that the server refuses to start with invalid LLM configuration.
"""

from __future__ import annotations

import sys
from unittest.mock import MagicMock, patch

import pytest

# Prevent Kaizen import chain (pre-existing SDK version mismatch).
# Must be done before importing hr_advisory.api.server which triggers
# the full import chain through platform -> routers -> agents.
_kaizen_mods = [
    "kaizen",
    "kaizen.core",
    "kaizen.core.base_agent",
    "kaizen.memory",
    "kaizen.config",
    "kaizen.config.providers",
    "kaizen.signatures",
    "kaizen.signatures.core",
    "kaizen.core.workflow_generator",
    "kaizen.nodes",
    "kaizen.nodes.ai",
    "kaizen.nodes.ai.llm_agent",
]
# Build consistent mock chain: kaizen.signatures needs a real-ish SignatureMeta
# so that downstream Signature subclasses don't hit metaclass conflicts.
_sig_meta = type("SignatureMeta", (type,), {})
_mock_signature = _sig_meta("Signature", (), {})
for _m in _kaizen_mods:
    if _m not in sys.modules:
        mod = MagicMock()
        if _m == "kaizen.signatures":
            mod.Signature = _mock_signature
            mod.core.SignatureMeta = _sig_meta
        elif _m == "kaizen.signatures.core":
            mod.SignatureMeta = _sig_meta
        elif _m == "kaizen":
            mod.Signature = _mock_signature
            mod.InputField = MagicMock()
            mod.OutputField = MagicMock()
            mod.Agent = type("Agent", (), {"run_sync": lambda self, task: MagicMock(text="{}")})
        sys.modules[_m] = mod

from hr_advisory.api.server import _validate_env_invariants
from hr_advisory.config.settings import Settings


class TestValidateEnvInvariants:
    """Test _validate_env_invariants() in server.py."""

    def test_validate_llm_invariants_passes_with_openai_only(self) -> None:
        """No error when only OPENAI_API_KEY is configured."""
        settings = Settings(openai_api_key="sk-test-key-123", ollama_model="")
        _validate_env_invariants(settings)  # should not raise

    def test_validate_llm_invariants_passes_with_ollama_tool_capable_model(self) -> None:
        """No error when Ollama is configured with a tool-capable model."""
        settings = Settings(
            openai_api_key="",
            ollama_model="llama3.1:70b-instruct-q4_0",
            ollama_base_url="http://localhost:11434",
        )
        _validate_env_invariants(settings)  # should not raise

    def test_validate_llm_invariants_raises_with_no_provider_configured(self, monkeypatch) -> None:
        """RuntimeError when neither OpenAI nor Ollama is configured."""
        monkeypatch.delenv("PYTEST_CURRENT_TEST", raising=False)
        settings = Settings(
            app_env="production", openai_api_key="", ollama_model="", ollama_base_url=""
        )
        with pytest.raises(RuntimeError, match="No LLM provider configured"):
            _validate_env_invariants(settings)

    def test_validate_llm_invariants_raises_with_ollama_url_but_no_model(self, monkeypatch) -> None:
        """RuntimeError when OLLAMA_BASE_URL is set but OLLAMA_MODEL is empty."""
        monkeypatch.delenv("PYTEST_CURRENT_TEST", raising=False)
        settings = Settings(
            app_env="production",
            openai_api_key="",
            ollama_model="",
            ollama_base_url="http://gpu-server:11434",
        )
        with pytest.raises(RuntimeError, match="OLLAMA_MODEL is empty"):
            _validate_env_invariants(settings)

    def test_validate_llm_invariants_raises_with_non_tool_capable_model(self, monkeypatch) -> None:
        """RuntimeError when OLLAMA_MODEL is set to a non-tool-capable model."""
        monkeypatch.delenv("PYTEST_CURRENT_TEST", raising=False)
        settings = Settings(
            app_env="production",
            openai_api_key="",
            ollama_model="phi3:14b",
            ollama_base_url="http://localhost:11434",
        )
        with pytest.raises(RuntimeError, match="not tool-capable"):
            _validate_env_invariants(settings)

    def test_validate_llm_invariants_skips_in_test_mode(self) -> None:
        """No error in test mode even without any provider configured."""
        settings = Settings(app_env="test", openai_api_key="", ollama_model="")
        _validate_env_invariants(settings)  # should not raise

    @patch.dict("os.environ", {"PYTEST_CURRENT_TEST": "test_something"})
    def test_validate_llm_invariants_skips_with_pytest_env(self) -> None:
        """No error when PYTEST_CURRENT_TEST is set (pytest detection)."""
        settings = Settings(
            app_env="development",
            openai_api_key="",
            ollama_model="",
        )
        _validate_env_invariants(settings)  # should not raise

    def test_validate_llm_invariants_passes_with_both_providers(self) -> None:
        """No error when both OpenAI and Ollama are configured."""
        settings = Settings(
            openai_api_key="sk-test-key-123",
            ollama_model="llama3.1:8b",
            ollama_base_url="http://localhost:11434",
        )
        _validate_env_invariants(settings)  # should not raise

    def test_validate_llm_invariants_passes_qwen25(self) -> None:
        """qwen2.5 is tool-capable — should pass."""
        settings = Settings(
            openai_api_key="",
            ollama_model="qwen2.5:32b-instruct-q8_0",
            ollama_base_url="http://localhost:11434",
        )
        _validate_env_invariants(settings)  # should not raise
