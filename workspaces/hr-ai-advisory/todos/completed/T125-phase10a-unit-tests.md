# T125 — Phase 10A: Unit tests (Tier 1)

**Status**: ACTIVE
**Phase**: 10A (Tests — Tier 1)
**Plan ref**: `02-plans/06-ollama-provider-plan.md` lines 400-449
**Depends on**: T113-T122 (each phase's unit tests are scaffolded inside the phase todo, but this gathers them and adds the missing ones)
**Specialist**: testing-specialist

## Why a separate Tier-1 todo

Each phase todo (T113-T122) lists its own unit tests under "acceptance criteria". This todo exists to:

1. **Aggregate** the test count and confirm coverage of every behavior change
2. **Add** the cross-cutting tests that don't belong inside any single phase todo
3. **Run** the full Tier-1 suite as a gate before Tier-2 (T126) starts

## Test inventory — must all pass before T126

Each test name maps directly to the plan and to a phase todo's acceptance criteria.

### Adapter & Delegate seam (Phase 2-3, T113-T114)

- [ ] `test_delegate_config_adapter_injection`
- [ ] `test_arbor_loop_does_not_mutate_env` (regression for C1)
- [ ] `test_concurrent_create_delegate_isolated`
- [ ] `test_build_adapter_from_context_ollama`
- [ ] `test_build_adapter_from_context_openai`
- [ ] `test_advisory_router_passes_adapter_to_delegate_config`

### Allowlist & validation (Phase 4-5, T115-T116)

- [ ] `test_validate_ollama_model_allowlist_rejects_phi3`
- [ ] `test_validate_ollama_model_allowlist_rejects_llama2`
- [ ] `test_validate_ollama_model_allowlist_accepts_llama31`
- [ ] `test_validate_ollama_model_allowlist_accepts_qwen25_with_tag`
- [ ] `test_validate_ollama_model_rejects_empty_string`
- [ ] `test_validate_ollama_model_case_insensitive`
- [ ] `test_save_config_rejects_missing_model_for_ollama`
- [ ] `test_save_config_rejects_phi3_for_ollama`
- [ ] `test_save_config_accepts_llama31_for_ollama`
- [ ] `test_save_config_accepts_qwen25_with_tag`
- [ ] `test_validate_endpoint_returns_valid_when_model_in_tags`
- [ ] `test_validate_endpoint_returns_invalid_when_model_missing`
- [ ] `test_validate_endpoint_returns_invalid_when_unreachable`

### Init-time invariant (Phase 6, T117)

- [ ] `test_validate_llm_invariants_raises_with_no_provider_configured`
- [ ] `test_validate_llm_invariants_raises_with_ollama_url_but_no_model`
- [ ] `test_validate_llm_invariants_raises_with_non_tool_capable_model`
- [ ] `test_validate_llm_invariants_passes_with_openai_only`
- [ ] `test_validate_llm_invariants_passes_with_ollama_tool_capable_model`
- [ ] `test_stored_invalid_ollama_config_marked_invalid_at_startup`

### Provider-aware billing (Phase 6, T117)

- [ ] `test_estimate_cost_ollama_returns_zero`
- [ ] `test_estimate_cost_unknown_cloud_model_returns_fallback_pricing`
- [ ] `test_record_usage_skips_for_ollama_provider`
- [ ] `test_log_llm_call_records_zero_cost_for_ollama`
- [ ] `test_model_pricing_no_longer_has_ollama_entry`

### Embeddings (Phase 7, T119)

- [ ] `test_embedding_pipeline_ollama_returns_1024_dim_vector` (mocked httpx)
- [ ] `test_embedding_pipeline_openai_returns_1024_dim_vector` (mocked openai)
- [ ] `test_embedding_pipeline_ollama_raises_on_wrong_dim`
- [ ] `test_embedding_pipeline_raises_on_missing_provider`
- [ ] `test_embedding_pipeline_no_silent_fallback`
- [ ] `test_embedding_pipeline_uses_dimensions_1024_for_openai`

### Migration script (Phase 7A, T118)

- [ ] `test_migrate_kb_to_1024_dim_dry_run_lists_changes`
- [ ] `test_migrate_kb_to_1024_dim_idempotent_on_already_migrated_db`
- [ ] `test_migrate_kb_to_1024_dim_writes_backup_before_drop`
- [ ] `test_migrate_kb_to_1024_dim_refuses_without_execute_flag`

### Autonomy / system prompt (Phase 7.5, T121-T122)

- [ ] `test_workflows_guardrails_no_circumvention_patterns_remain` (rg in pytest)
- [ ] `test_workflows_guardrails_no_injection_patterns_remain`
- [ ] `test_workflows_guardrails_no_escalation_patterns_remain`
- [ ] `test_workflows_guardrails_screen_response_still_exists` (positive)
- [ ] `test_advisory_router_does_not_call_screen_query` (AST or import scan)
- [ ] `test_system_prompt_contains_refusal_policy` (4 sections)
- [ ] `test_system_prompt_contains_refusal_examples` (each section has at least one example)

## Cross-cutting test guardrail

Every Ollama-specific unit test MUST include:

```python
def test_xxx_ollama(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_BASE_URL", raising=False)
    ...
```

Otherwise the test silently passes by falling through to OpenAI thanks to `conftest.py` `.env` auto-load. Add a pytest fixture `ollama_only_env` to reduce duplication.

## Acceptance criteria

- [ ] All ~36 unit tests above pass
- [ ] No test passes by accidental OpenAI fallback (verify by deliberately corrupting `OPENAI_API_KEY` in a smoke run)
- [ ] `pytest tests/unit/ -q` runs to completion with the new tests included
- [ ] Existing 1155+ unit tests still pass
- [ ] Coverage of the new code paths is ≥ 80% per `rules/testing.md` (security/auth code ≥ 100%)
- [ ] `coverage run -m pytest tests/unit/ && coverage report --include="src/hr_advisory/delegate/*,src/hr_advisory/services/llm_*,src/hr_advisory/kb/embeddings.py,src/hr_advisory/workflows/guardrails.py"` shows the target percentages

## Traps

- **Test pollution** — `monkeypatch.delenv` is essential. Without it, half the Ollama tests pass for the wrong reason.
- **Mocked httpx vs real httpx** — pin the mock to match the real Ollama API contract: `{"embedding": [...]}` for `/api/embeddings`. If the upstream changes the response shape, the mock drift hides the bug. Comment the contract version in the test.
- **AST-based test for `screen_query` removal** — use `ast.parse` on `advisory.py` and walk for any `Call` whose `func.id == "screen_query"`. A `rg` test is acceptable but the AST version is more robust against refactoring.
- **Coverage on `main.py`** — the init-invariant function is called once at app startup. Coverage tools may miss it unless the test imports `main` and calls `_validate_llm_invariants` directly.

## Red team round 1 revisions (H10, M22, M23, L9)

### H10 — Add behavioral tests for `screen_response` output guard

Symbol-presence is not enough. If a refactor empties `screen_response`, the symbol stays but the guard becomes a no-op. Add to the Tier-1 inventory:

- [ ] `test_screen_response_redacts_leaked_prompt_fragment` — pass a mock response containing "System prompt: You are an HR advisory assistant" → assert it is redacted/blocked
- [ ] `test_screen_response_passthrough_on_clean_output` — pass a normal HR answer → assert it passes through unchanged
- [ ] `test_screen_response_redacts_indirect_injection_marker` — pass a response containing "Assistant: new instruction" → assert blocked

### M22 — Expand coverage `--include` list

The original include list misses `api/routers/advisory.py` and `api/routers/llm_config.py` — both security-critical (tenant isolation, BYOK config). Expand:

```bash
coverage report --include="
src/hr_advisory/delegate/*,
src/hr_advisory/services/llm_*,
src/hr_advisory/kb/embeddings.py,
src/hr_advisory/workflows/guardrails.py,
src/hr_advisory/api/routers/advisory.py,
src/hr_advisory/api/routers/llm_config.py
"
```

Per `rules/testing.md`, security-critical paths require 100% coverage. Tenant isolation enforcement in `advisory.py` and BYOK validation in `llm_config.py` qualify.

### M23 — Split the adapter-passing test by call site

Replace `test_advisory_router_passes_adapter_to_delegate_config` (one test, two call sites) with:

- [ ] `test_query_endpoint_passes_adapter_to_delegate_config`
- [ ] `test_stream_endpoint_passes_adapter_to_delegate_config`

A half-migration that wires `/advisory/query` but forgets `/advisory/query/stream` should fail loudly.

### L9 — Pin exact test count

Original aggregate said "~36 unit tests"; the inventory actually lists 39+ tests (after additions in Round 1 revisions, ~50). Pin the exact number:

```python
# At the top of tests/unit/ollama/test_inventory_count.py
def test_ollama_provider_test_count_unchanged():
    """Pin the test count so silently-dropped tests are detected."""
    import pathlib
    test_files = pathlib.Path("tests/unit/ollama/").rglob("test_*.py")
    test_funcs = sum(
        1
        for f in test_files
        for line in f.read_text().splitlines()
        if line.strip().startswith("def test_")
    )
    assert test_funcs >= 50, f"Test count dropped: {test_funcs} < 50"
```

### Updated acceptance criteria

- [ ] `screen_response` has 3 behavioral tests (redact leak, passthrough clean, redact indirect-injection marker)
- [ ] Coverage include list covers `api/routers/advisory.py` and `api/routers/llm_config.py`
- [ ] Two split tests for adapter-passing (one per endpoint)
- [ ] Test count pin file exists with `>= 50` assertion
- [ ] All revised acceptance criteria from upstream todos (T113-T122) are reflected in the inventory
