"""Regression: M1 — Ollama calls billed at GPT-4o fallback rates.

Pre-fix: _estimate_cost used _FALLBACK_PRICING (GPT-4o rates) for any
model not in MODEL_PRICING, so Ollama calls were billed at $2.50/$10.00
per million tokens, causing companies to hit their $5/month budget cap
after a handful of queries despite running local inference.

Post-fix (T117): provider-aware pricing — _estimate_cost short-circuits
to 0.0 when provider="ollama".

NEVER delete this test.
"""

from __future__ import annotations

from unittest.mock import patch

import pytest

# NOTE: Earlier revisions installed `MagicMock()` into `sys.modules` for
# `kaizen.*` to work around an SDK import chain issue. That workaround
# corrupted `sys.modules` for later test files, causing metaclass conflicts
# the first time a later test imported the REAL `hr_advisory.agents.actions.document_gen`
# (which does `from kaizen import Agent as BaseAgent`). kailash-kaizen 2.7.4
# imports cleanly, so the shim has been removed. If a future SDK bump
# reintroduces the need, scope the stub to a fixture with `sys.modules`
# restoration on teardown — do NOT pollute module-level state.

from hr_advisory.services.llm_budget import _estimate_cost, record_usage


@pytest.mark.regression
def test_M1_estimate_cost_ollama_returns_zero():
    """Regression: M1 — _estimate_cost(provider='ollama') must return 0.0.

    Even with large token counts and unknown model names, Ollama is local
    inference and must never incur cost.
    """
    # Large token count that would cost ~$3.50 at GPT-4o fallback rates
    cost = _estimate_cost(100_000, 50_000, "llama3.1:70b", provider="ollama")
    assert cost == 0.0, f"M1 regression: Ollama cost should be 0.0, got {cost}"


@pytest.mark.regression
def test_M1_estimate_cost_ollama_zero_for_unknown_model():
    """Any model name with provider='ollama' must return 0.0."""
    cost = _estimate_cost(10_000, 5_000, "some-custom-finetune:latest", provider="ollama")
    assert cost == 0.0, f"M1 regression: Ollama cost should be 0.0, got {cost}"


@pytest.mark.regression
@patch("hr_advisory.services.llm_budget._get_or_create_usage")
@patch("hr_advisory.services.dataflow_crud.update")
def test_M1_record_usage_ollama_records_zero_cost(mock_update, mock_get_usage):
    """Regression: M1 — record_usage with provider='ollama' must record 0.0 cost.

    The full pipeline (record_usage -> _estimate_cost -> update) must
    produce a zero-cost entry, not just the estimate function.
    """
    mock_get_usage.return_value = {
        "id": 99,
        "company_id": 1,
        "month": "2026-04-01",
        "query_count": 0,
        "input_tokens": 0,
        "output_tokens": 0,
        "estimated_cost": 0.0,
    }
    mock_update.return_value = {}

    result = record_usage(
        company_id=1,
        input_tokens=50_000,
        output_tokens=25_000,
        model="llama3.1:70b",
        provider="ollama",
    )

    assert (
        result["last_query_cost"] == 0.0
    ), f"M1 regression: record_usage Ollama cost should be 0.0, got {result['last_query_cost']}"
    assert result["estimated_cost"] == 0.0
