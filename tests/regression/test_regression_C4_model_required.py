"""Regression: C4 — save Ollama config without model_pref accepted silently.

Pre-fix: the save endpoint accepted Ollama BYOK configs without a model
name, producing a config that crashed every advisory query with an opaque
error deep in the Delegate.

Post-fix (T115): required-model + allowlist enforcement rejects the save
with a 400 and an actionable error message.

NEVER delete this test.
"""

from __future__ import annotations

import pytest

from hr_advisory.services.llm_config import validate_ollama_model


@pytest.mark.regression
def test_C4_save_ollama_config_without_model_is_rejected():
    """Regression: C4 — validate_ollama_model rejects empty model.

    The save endpoint calls validate_ollama_model(model_pref) before
    persisting. An empty model_pref must raise ValueError.
    """
    with pytest.raises(ValueError, match="required and may not be empty"):
        validate_ollama_model("")


@pytest.mark.regression
def test_C4_save_ollama_config_whitespace_model_is_rejected():
    """Regression: C4 — whitespace-only model_pref is also rejected."""
    with pytest.raises(ValueError, match="required and may not be empty"):
        validate_ollama_model("   ")


@pytest.mark.regression
def test_C4_save_ollama_config_non_tool_capable_model_is_rejected():
    """Regression: C4 — phi3 (non-tool-capable) must be rejected with
    an error message naming the allowlist."""
    with pytest.raises(ValueError, match="not tool-capable") as exc_info:
        validate_ollama_model("phi3:14b")
    # Error message must name at least one valid alternative
    assert "llama3.1" in str(exc_info.value)
