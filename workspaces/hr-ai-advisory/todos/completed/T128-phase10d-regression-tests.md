# T128 — Phase 10D: Regression tests pinning C1, C4, M1, V1/V2/V3

**Status**: ACTIVE
**Phase**: 10D (Tests — Regression)
**Plan ref**: `02-plans/06-ollama-provider-plan.md` lines 518-523
**Depends on**: T125 (regression tests sit alongside Tier-1 unit tests)
**Specialist**: testing-specialist

## Why a separate todo

Per `rules/testing.md`:

> Every bug fix MUST include a regression test BEFORE the fix is merged.
> Regression tests are NEVER deleted.

This todo creates the four regression test files in `tests/regression/`. Each pins a specific bug from the analysis so a future refactor cannot silently re-introduce it. Naming follows `test_issue_<short>.py` with `@pytest.mark.regression`.

## Tests to add — `tests/regression/`

### `test_regression_ollama_provider_byok_via_adapter_injection_C1.py`

Pins the C1 multi-tenant `os.environ.setdefault` leak.

```python
import os
import pytest
from hr_advisory.delegate.arbor_loop import DelegateConfig, create_delegate

@pytest.mark.regression
def test_C1_create_delegate_does_not_mutate_os_environ(monkeypatch):
    """Regression: C1 — `os.environ.setdefault` in arbor_loop.create_delegate
    leaked Company A's BYOK config into Company B's process env, allowing one
    tenant's API key to be sent as a bearer token to another tenant's endpoint.

    Fix: per-request adapter injection via DelegateConfig.adapter (T113).
    """
    # Implementation: snapshot env, build a config with an explicit adapter,
    # call create_delegate, snapshot env again, assert dict equality.
    ...
```

### `test_regression_ollama_model_required_for_save_C4.py`

Pins C4: save endpoint accepted Ollama configs without a model name.

```python
@pytest.mark.regression
def test_C4_save_ollama_config_without_model_returns_400():
    """Regression: C4 — saving an Ollama BYOK config without `model_pref`
    used to succeed and produce a config that crashed every advisory query.

    Fix: required-model + allowlist enforcement (T115).
    """
    ...
```

### `test_regression_ollama_billed_zero_M1.py`

Pins M1: Ollama calls were billed at GPT-4o fallback rates.

```python
@pytest.mark.regression
def test_M1_ollama_call_records_zero_cost():
    """Regression: M1 — `_estimate_cost` used `_FALLBACK_PRICING` (GPT-4o
    rates) for any model not in MODEL_PRICING, so Ollama calls were billed
    at $2.50/$10.00 per million tokens.

    Fix: provider-aware pricing (T117).
    """
    ...
```

### `test_regression_workflows_guardrails_no_keyword_routing_V1V2V3.py`

Pins V1/V2/V3: regex-based pre-filtering of user input bypassed the LLM.

```python
@pytest.mark.regression
def test_V1V2V3_no_input_side_regex_classifiers():
    """Regression: V1/V2/V3 — workflows/guardrails.py contained ~25 regex
    patterns that pre-filtered user input before the Delegate saw it. This
    caused paraphrased queries to bypass the canned refusals while
    legitimate queries were blocked.

    Fix: delete the input-side regex screens; refusal policy moved into
    the system prompt (T121, T122).
    """
    import hr_advisory.workflows.guardrails as guardrails
    forbidden = [
        "_CIRCUMVENTION_PATTERNS",
        "_INJECTION_PATTERNS",
        "_ESCALATION_PATTERNS",
        "_HR_SCOPE_KEYWORDS",
        "_OFF_TOPIC_PATTERNS",
        "screen_query",
        "screen_injection",
        "screen_scope",
    ]
    for symbol in forbidden:
        assert not hasattr(guardrails, symbol), (
            f"{symbol} resurfaced in workflows/guardrails.py — autonomy violation. "
            f"See plan 06 phase 7.5 for context."
        )
```

## Acceptance criteria

- [ ] All 4 regression test files exist in `tests/regression/`
- [ ] Each test is decorated with `@pytest.mark.regression`
- [ ] Each test reproduces the original bug (would FAIL on the pre-fix codebase)
- [ ] Each test passes on the post-fix codebase
- [ ] Each test docstring names the bug ID, the symptom, and the fix todo
- [ ] `pytest tests/regression/ -m regression -q` runs all 4 tests successfully
- [ ] CI runs the regression suite as a separate job (so a failure here is loud)

## Traps

- **A regression test that doesn't actually reproduce the bug is worse than no test** — for each test, mentally simulate "if I deleted the fix, would this test fail?" If the answer is no, the test is testing the wrong thing.
- **`@pytest.mark.regression`** — register this marker in `pytest.ini` / `pyproject.toml` if not already done; otherwise pytest emits a warning and the marker is treated as plain text.
- **Don't combine all four into one test file** — each bug gets its own file so `git blame` and CI failure messages stay precise.
- **The C1 regression test must NOT use any mocking** — the whole point is to verify real `os.environ` is not mutated. Mocking `os.environ` defeats the test.

## Red team round 1 revisions (H9, H11, M19, L6)

### H9 — C1 regression must reproduce the cross-request leak, not single-request snapshot

The original snapshot test passes on the pre-fix codebase (the `setdefault` mutation only leaks on the NEXT request). The real bug needs a two-request reproduction.

**Required rewrite of `test_regression_ollama_provider_byok_via_adapter_injection_C1.py`:**

```python
import os
import pytest
from hr_advisory.delegate.arbor_loop import DelegateConfig, create_delegate
from kaizen_agents.delegate.adapters import OllamaStreamAdapter

@pytest.mark.regression
def test_C1_no_byok_leak_to_subsequent_request(monkeypatch):
    """Regression: C1 multi-tenant env poisoning.

    Pre-fix: arbor_loop.create_delegate called os.environ.setdefault(
    'OPENAI_API_KEY', config.api_key) for BYOK requests, leaking the BYOK
    company's key into the process env. The next request from a different
    company would then read the leaked key as if it were the server default.

    Post-fix (T113): per-request adapter injection via DelegateConfig.adapter,
    require_server_default=True flag in request context blocks env fallback.
    """
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_BASE_URL", raising=False)

    # Request A: Company A with explicit Ollama adapter
    cfg_a = DelegateConfig(
        adapter=OllamaStreamAdapter(
            base_url="http://customer-a-dgx:11434",
            default_model="llama3.1:8b",
        ),
        company_id="company-a",
    )
    create_delegate(cfg_a)

    # Request B: Company B with no adapter, in request context
    cfg_b = DelegateConfig(
        adapter=None,
        require_server_default=True,
        company_id="company-b",
    )
    with pytest.raises(RuntimeError, match="adapter is required in request context"):
        create_delegate(cfg_b)

    # Final invariant: env was NOT mutated by request A
    assert "OPENAI_API_KEY" not in os.environ
    assert "OPENAI_BASE_URL" not in os.environ
```

This test FAILS on the pre-fix codebase (where `setdefault` writes into env) AND on a half-fix (where `setdefault` is gone but `adapter is None` falls back to env-reading adapter).

### H11 — M1 regression must read back the cost ledger from the DB

The original test asserts zero cost via the in-memory return value. DataFlow could silently skip the write to `llm_usage`.

**Required addition:**

```python
@pytest.mark.regression
def test_M1_ollama_call_records_zero_cost_in_ledger(test_client, db, ollama_only_env):
    """Regression: M1 — Ollama calls were billed at GPT-4o fallback rates."""
    response = test_client.post("/advisory/query", json={
        "query": "How many days of paternity leave?",
        "byok": {"provider": "ollama", "base_url": "http://ollama:11434", "model": "llama3.1:8b"},
    })
    assert response.status_code == 200
    request_id = response.json()["request_id"]

    # Read back from the cost ledger
    with db.cursor() as cur:
        cur.execute("SELECT cost_usd, provider, model FROM llm_usage WHERE request_id = %s", (request_id,))
        row = cur.fetchone()
    assert row is not None, "llm_usage row was never written"
    cost_usd, provider, model = row
    assert cost_usd == 0.0
    assert provider == "ollama"
    assert model == "llama3.1:8b"
```

### M19 — V1/V2/V3 regression needs a behavioral assertion

Symbol-absence is necessary but not sufficient — someone could re-add the regex under a different name. Add behavioral assertion:

```python
@pytest.mark.regression
def test_V1V2V3_paraphrased_circumvention_reaches_delegate(test_client, db, ollama_only_env):
    """Regression: V1 — paraphrased circumvention queries used to be blocked
    by regex without reaching the LLM. The Delegate must now process the query
    and respond with compliant alternatives, not a canned refusal."""
    response = test_client.post("/advisory/query", json={
        "query": "What's the best way to save money on monthly statutory payroll deductions?",
    })
    assert response.status_code == 200
    body = response.json()
    # The Delegate ran (multi-token response, not a canned 1-line reject)
    assert len(body["response_text"]) > 200
    # The response addresses the underlying business need with compliant options
    text_lower = body["response_text"].lower()
    assert any(term in text_lower for term in ["cpf", "sdl", "compliant", "lawful"])
    # The Delegate called at least one tool (proves it engaged with the query, not a regex match)
    assert len(body.get("tools_called", [])) > 0
```

### L6 — Register `@pytest.mark.regression` in `pyproject.toml`

Add to acceptance:

- [ ] `pyproject.toml` `[tool.pytest.ini_options] markers` includes `regression: bug regression test (never delete)`

### Updated acceptance criteria

- [ ] C1 regression rewritten to reproduce two-request leak (not single-snapshot)
- [ ] C1 regression test FAILS on pre-fix codebase (verify by reverting fix locally and running)
- [ ] M1 regression reads back from `llm_usage` table, not just in-memory return value
- [ ] V1/V2/V3 regression has behavioral assertion (multi-token response + tool call)
- [ ] `pytest.mark.regression` marker registered in `pyproject.toml`
