# T117 — Phase 6: Provider-aware billing + init-time tool-capability invariant

**Status**: ACTIVE
**Phase**: 6 (Provider-aware billing + init-time invariant)
**Plan ref**: `02-plans/06-ollama-provider-plan.md` lines 166-230
**Depends on**: T114, T115
**Specialist**: nexus-specialist (init), kaizen-specialist (cost)

## Goal

Two related invariants ship in this todo:

1. **Cost integrity (Q3)** — every Ollama call records `cost_usd=0.0`. No fallback pricing, no "GPT-4o rates as a placeholder", no `MODEL_PRICING["ollama"]` ghost entry.
2. **Init-time tool-capability invariant (Q1)** — Arbor refuses to start if its server-default LLM config is misconfigured. This is **stronger than save-time** rejection: it catches deployments where `OLLAMA_MODEL` was set to a non-tool-capable model in the env file before any user got to the save UI.

## Part A — Provider-aware cost (Q3)

### Files

- `src/hr_advisory/services/llm_budget.py`
- `src/hr_advisory/services/llm_metrics.py`
- `src/hr_advisory/agents/llm_context.py` (only if shape changes leak through it — verify when reading)
- `src/hr_advisory/api/routers/advisory.py:506,517-526` (call sites)

### Steps

1. Add `provider: str = ""` parameter to `_estimate_cost` in `llm_budget.py`. When `provider == "ollama"`, short-circuit: `return 0.0`. Place the check before any pricing-table lookup.
2. Thread `provider` through `record_usage` and `log_llm_call` (whatever the public surface is — read the file to confirm function names).
3. **Delete** the dead `MODEL_PRICING["ollama"]` entry. There is no such thing as Ollama pricing; the entry is misleading and will catch a future maintainer with a "wait, why is the cost non-zero?" bug.
4. Update `advisory.py:506` and `:517-526` to pass `provider=llm_context.provider` to whichever billing call exists at those lines.

### Cost acceptance

- [ ] `_estimate_cost("llama3.1:70b", provider="ollama") == 0.0`
- [ ] `_estimate_cost("gpt-5-mini", provider="openai")` returns the OpenAI rate
- [ ] `_estimate_cost("some-unknown-cloud-model", provider="openai")` returns the conservative `_FALLBACK_PRICING`
- [ ] `MODEL_PRICING["ollama"]` no longer exists in the file
- [ ] `record_usage` and `log_llm_call` accept and propagate `provider`
- [ ] `advisory.py` call sites pass `provider=llm_context.provider`
- [ ] New unit tests:
  - `test_estimate_cost_ollama_returns_zero`
  - `test_estimate_cost_unknown_cloud_model_returns_fallback_pricing`
  - `test_record_usage_skips_for_ollama_provider`
  - `test_log_llm_call_records_zero_cost_for_ollama`

## Part B — Init-time tool-capability invariant (Q1)

### Files

- `src/hr_advisory/main.py` (or wherever `app = FastAPI()` is constructed — verify with a grep for `FastAPI(`)
- `src/hr_advisory/config/settings.py` (settings field references)
- `docs/setup.md` and `.env.example` (documentation)

### Steps

1. Add a `_validate_llm_invariants` function in `main.py` matching the structure in the plan (lines 175-217). The function:
   - Reads `settings.openai_api_key`, `settings.ollama_model`, `settings.ollama_base_url`
   - Raises `RuntimeError` if BOTH providers are unconfigured (with a message naming `OPENAI_API_KEY`, `OLLAMA_MODEL`, `OLLAMA_BASE_URL` and pointing at `docs/setup.md`)
   - Raises `RuntimeError` if `OLLAMA_BASE_URL` is set but `OLLAMA_MODEL` is empty (the M2 misconfiguration)
   - Calls `validate_ollama_model(settings.ollama_model)` and re-raises any `ValueError` as a `RuntimeError` naming the bad value
2. Call `_validate_llm_invariants()` BEFORE `app.start()` (or before the `FastAPI()` constructor returns to the caller — wherever the lifecycle hook is)
3. **Stored configs handling (do NOT fail-fast):** for each `CompanyLLMConfig` / `UserLLMConfig` row with `provider="ollama"` at startup, run `validate_ollama_model` against the saved model. On `ValueError`:
   - Log a CRITICAL warning naming the company/user
   - Mark the config row `status="invalid"` so the request path falls back to server defaults
   - Do NOT crash the service — that would brick everyone for one bad row
4. Document the invariant in `docs/setup.md` with the allowlist constants visible inline, and add the same content as comments in `.env.example`

### Init-invariant acceptance

- [ ] `_validate_llm_invariants` exists in `main.py` and is called before app start
- [ ] Stored bad configs are downgraded to `status="invalid"` (NOT fail-fast)
- [ ] `docs/setup.md` documents the invariant and lists tool-capable families
- [ ] `.env.example` has commented allowlist near the `OLLAMA_MODEL` line
- [ ] New unit tests:
  - `test_validate_llm_invariants_raises_with_no_provider_configured`
  - `test_validate_llm_invariants_raises_with_ollama_url_but_no_model`
  - `test_validate_llm_invariants_raises_with_non_tool_capable_model`
  - `test_validate_llm_invariants_passes_with_openai_only`
  - `test_validate_llm_invariants_passes_with_ollama_tool_capable_model`
  - `test_stored_invalid_ollama_config_marked_invalid_at_startup`
- [ ] Tier 2 integration test (deferred to T126): app refuses to start with bad Ollama env config (use a subprocess or `TestClient` lifecycle)

## Combined exit criteria

- [ ] Cost: integration test in T126 will assert `log_llm_call` records `cost_usd=0.0` for an Ollama BYOK request end-to-end
- [ ] Invariant: subprocess startup test in T126 will assert the app refuses to boot with `OLLAMA_MODEL=phi3:14b`

## Traps

- **The init invariant must NOT touch the database before settings are validated** — startup ordering matters. Settings validation runs first (env-only), DB-stored config validation runs second (after the DB connection is up).
- **Do not import `validate_ollama_model` at module top of `main.py`** if it would create a circular import — use a local import inside `_validate_llm_invariants` (the plan already does this).
- **`MODEL_PRICING["ollama"]` deletion** — search the test suite for fixtures referencing this key and clean them up in the same commit. A leftover test fixture is the most likely place to break.
- **Don't conflate** Part A and Part B in the same commit's failure mode. If cost tests are failing, the invariant check is fine and vice versa. Stage them as two commits inside the same PR if it helps debugging.

## Red team round 1 revisions (H1, H2, M3, M9, L3, L4)

### H1 — `main.py` does not exist; the entrypoint is `api/server.py`

The actual entrypoint is `src/hr_advisory/api/server.py:21-42`. The `FastAPI(...)` constructor lives inside `api/platform.py:131` (sub-app pattern). T117 Part B must be retargeted:

- Place `_validate_env_invariants()` in `api/server.py:main()`, called BETWEEN `get_settings()` and `create_platform(settings)`
- Place `_validate_stored_configs()` inside `create_platform` or as a FastAPI `lifespan` startup hook AFTER the DB connection is up

### H2 — Init invariant must respect test mode

`_validate_env_invariants` raises `RuntimeError` on import/startup. Without a test-mode carve-out, every test that imports `hr_advisory.api.server` without a configured LLM provider hard-crashes. Existing pattern: `tests/adversarial/conftest.py:50` uses `has_llm_available()` to skip cleanly.

**Required gate at the top of `_validate_env_invariants`:**

```python
def _validate_env_invariants() -> None:
    settings = get_settings()
    # Test-mode carve-out: skip the invariant check during pytest runs.
    if settings.app_env == "test" or os.environ.get("PYTEST_CURRENT_TEST"):
        return
    # ... rest of the original logic
```

This preserves the production safety while keeping the test suite green.

### M3 — Split into env-time vs lifespan-time validation

Don't run stored-config validation before the DB is connected. Two functions:

- `_validate_env_invariants()` — pure env-only, runs in `server.py:main()` BEFORE FastAPI() construction. Raises `RuntimeError` on bad config.
- `_validate_stored_configs()` — DB-dependent, runs as a FastAPI `@app.on_event("startup")` or `lifespan` hook AFTER DB is up. Marks bad rows `status="invalid"` but does NOT raise.

### M9 — Cost test for the streaming endpoint

The original cost tests only cover `run_delegate_sync` (`advisory.py:506,517-526`). The streaming endpoint at `advisory.py:740-768` uses `create_delegate` directly with a custom event_generator. Cost recording in that path is uncovered.

Add: `test_streaming_endpoint_records_zero_cost_for_ollama` (Tier 2 with real Ollama, since SSE is hard to unit-test cleanly).

### L3 — Pin the `MODEL_PRICING["ollama"]` deletion as a regression invariant

Add a unit test that asserts the key is gone:

```python
def test_model_pricing_no_longer_has_ollama_entry():
    """Regression: M1 — `MODEL_PRICING["ollama"]` was a misleading dead entry."""
    from hr_advisory.services.llm_budget import MODEL_PRICING
    assert "ollama" not in MODEL_PRICING
```

Also add a "grep first" guard: if `MODEL_PRICING["ollama"]` does not currently exist (verify with `rg`), skip the delete step and note in the commit message.

### L4 — Re-grep call sites after T111 lands

T117 references `advisory.py:506` and `:517-526`. T111 may shift line numbers when it removes the audit-trail strings at lines 410/457. Re-grep before editing.

### Updated acceptance criteria

- [ ] Init-invariant lives in `api/server.py:main()`, NOT `main.py`
- [ ] Test-mode carve-out gates the invariant on `app_env == "test"` OR `PYTEST_CURRENT_TEST`
- [ ] Two functions: `_validate_env_invariants` (pre-construct) and `_validate_stored_configs` (lifespan startup)
- [ ] `test_streaming_endpoint_records_zero_cost_for_ollama` exists in T126's Tier-2 suite
- [ ] `test_model_pricing_no_longer_has_ollama_entry` exists in T125's Tier-1 suite
- [ ] Pre-flight grep confirms `MODEL_PRICING["ollama"]` exists before the delete attempt
- [ ] Re-grep advisory.py for the cost call sites before editing
