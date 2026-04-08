"""Regression: C1 — multi-tenant os.environ.setdefault leak.

Pre-fix: arbor_loop.create_delegate called os.environ.setdefault(
'OPENAI_API_KEY', config.api_key) for BYOK requests, leaking the BYOK
company's key into the process env. The next request from a different
company would then read the leaked key as if it were the server default.

Post-fix (T113): per-request adapter injection via DelegateConfig.adapter,
require_server_default=True flag in request context blocks env fallback.

This test reproduces the TWO-REQUEST sequence (red team H9): request A
with an explicit adapter, then request B with require_server_default=True.
A single-snapshot test passes on the pre-fix codebase because the
setdefault mutation only leaks on the NEXT request.

NEVER delete this test.
"""

from __future__ import annotations

import os

import pytest

from hr_advisory.delegate.arbor_loop import DelegateConfig, create_delegate


@pytest.mark.regression
def test_C1_no_byok_leak_to_subsequent_request(monkeypatch):
    """Regression: C1 multi-tenant env poisoning — two-request reproduction.

    Request A: Company A with explicit Ollama adapter.
    Request B: Company B with no adapter, require_server_default=True.

    After A runs, B must NOT see A's base_url or api_key in os.environ,
    and must raise RuntimeError (no adapter available).
    """
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_BASE_URL", raising=False)

    from kaizen_agents.delegate.adapters.ollama_adapter import OllamaStreamAdapter

    # Request A: Company A with explicit Ollama adapter (BYOK)
    adapter_a = OllamaStreamAdapter(
        base_url="http://customer-a-dgx:11434",
        default_model="llama3.1:8b",
    )
    cfg_a = DelegateConfig(
        adapter=adapter_a,
        company_id=1,
    )
    create_delegate(cfg_a)

    # Request B: Company B with no adapter, in request context
    cfg_b = DelegateConfig(
        adapter=None,
        require_server_default=True,
        company_id=2,
    )
    with pytest.raises(RuntimeError, match="adapter is required in request context"):
        create_delegate(cfg_b)

    # Final invariant: env was NOT mutated by request A
    assert (
        "OPENAI_API_KEY" not in os.environ
    ), "C1 regression: OPENAI_API_KEY leaked into os.environ after BYOK request"
    assert (
        "OPENAI_BASE_URL" not in os.environ
    ), "C1 regression: OPENAI_BASE_URL leaked into os.environ after BYOK request"
