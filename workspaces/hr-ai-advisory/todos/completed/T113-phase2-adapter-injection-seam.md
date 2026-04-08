# T113 — Phase 2: Adapter injection seam in `arbor_loop.py`

**Status**: ACTIVE
**Phase**: 2 (Adapter injection seam)
**Plan ref**: `02-plans/06-ollama-provider-plan.md` lines 104-119
**Depends on**: T112
**Blocks**: T114
**Specialist**: kaizen-specialist

## Why this is the architectural keystone

This todo introduces the new `DelegateConfig.adapter` field — the **per-request adapter injection seam** that eliminates the C1 multi-tenant `os.environ.setdefault` leak and lets the advisory router pass a fully-built `OllamaStreamAdapter` (or any other `StreamingChatAdapter`) directly into the `Delegate`. After this, no caller mutates process env to switch providers.

ADR ref: `02-plans/06-ollama-provider-plan.md` lines 38-53 (ADR-17-01).

## What to build — `src/hr_advisory/delegate/arbor_loop.py`

### 1. New import

- Import `StreamingChatAdapter` from `kaizen_agents.delegate.adapters.protocol` (or wherever the type is defined — verify path with the kaizen-specialist if unsure)

### 2. Extend `DelegateConfig`

- Add a new field: `adapter: StreamingChatAdapter | None = None`
- Place it AFTER existing identity/tenant fields (`company_id`, `jwt_token`, `company_context`, `user_context`) so they remain a stable prefix
- Field must be type-annotated and default `None` (so legacy callers without an adapter still work)

### 3. Refactor `_resolve_llm_settings`

- Rename the function to `_resolve_llm_settings_from_env` to clarify that it is the **fallback path only**
- Add a docstring noting: "Used when `DelegateConfig.adapter is None`. BYOK contexts must pass an explicit adapter."
- Update the one caller inside `arbor_loop.py` to use the new name
- Search the rest of the package for any other reference to `_resolve_llm_settings` and update or remove

### 4. Refactor `create_delegate`

- Branch on `config.adapter is not None`:
  - **If adapter is provided**: pass `adapter=config.adapter` directly into `Delegate(...)`. Skip `_resolve_llm_settings_from_env` entirely. Pull the model name for logging from `config.adapter.default_model` (or equivalent).
  - **If adapter is None**: fall back to current env-var path via `_resolve_llm_settings_from_env`. This path is reserved for legacy/server-default callers; T114 will make the advisory router pass an adapter, so this branch will only be hit by tests, scripts, and batch jobs.
- **Delete unconditionally**: every `os.environ.setdefault(...)` line in this function. No caller should be mutating process env. The plan flagged lines `95-98` specifically; verify by reading the file.
- Update the log message: `Delegate LLM: adapter=%s, model=%s` so logs make the wiring obvious

## Acceptance criteria

- [ ] `DelegateConfig` has new field `adapter: StreamingChatAdapter | None = None`
- [ ] `_resolve_llm_settings` renamed to `_resolve_llm_settings_from_env` with updated docstring
- [ ] `create_delegate` branches on `config.adapter is not None` correctly
- [ ] **All `os.environ.setdefault` calls inside `arbor_loop.py` are deleted** — `rg "os.environ.setdefault" src/hr_advisory/delegate/` → 0 matches
- [ ] Log message includes adapter class name
- [ ] Existing `pytest tests/unit/delegate/test_arbor_loop.py` passes
- [ ] New unit test `test_delegate_config_adapter_injection`: `DelegateConfig(adapter=OllamaStreamAdapter(base_url="http://x:11434", default_model="llama3.1:8b"))` → `create_delegate(config)` returns a `Delegate` whose underlying adapter is the same `OllamaStreamAdapter` instance (identity check via `is`)
- [ ] New unit test `test_arbor_loop_does_not_mutate_env`: snapshot `os.environ` before calling `create_delegate(...)`, call it, snapshot after — assert dict equality. **Regression test for C1.**
- [ ] New unit test `test_concurrent_create_delegate_isolated`: two `create_delegate` calls with different adapters in parallel `ThreadPoolExecutor` workers — assert each Delegate's adapter is the one passed in (no cross-contamination)

## Out of scope

- Changing the advisory router (that's T114)
- Touching the `Delegate` class itself in `kaizen_agents` (upstream — file via T124 if needed)
- Provider-aware billing (T117)
- Embeddings (T118-T120)

## Traps

- **`StreamingChatAdapter` import path** — the kaizen-agents package may export this from multiple places. Use the canonical `kaizen_agents.delegate.adapters.protocol` path; if missing, ask kaizen-specialist before guessing.
- **Default value placement** — Python dataclass field ordering: a field with a default cannot precede a field without a default. Verify `DelegateConfig` field order doesn't break — if all earlier fields already have defaults, just append; if not, refactor.
- **Tests that monkeypatch env vars** — existing tests may rely on `os.environ.setdefault` to "stick" across calls. After this change those tests need to either pass an adapter or accept that env mutation is gone. Update them in the same commit.
- **Don't add a fallback in the `if config.adapter is not None` branch** — the whole point is that the adapter is fully resolved at the call site. Trusting it is the contract.

## Red team round 1 revisions (C-1, C-2, M1, M2, L5)

These findings are CRITICAL — they prevent T113 from actually closing the C1 multi-tenant leak. Apply ALL of them.

### C-1 — Close the env-mutation backdoor in the `adapter is None` fallback path

The original todo deletes `os.environ.setdefault` but leaves the `adapter is None` branch calling `_resolve_llm_settings_from_env`, which then constructs `OpenAIStreamAdapter(api_key=None, ...)`. That adapter reads `os.environ["OPENAI_API_KEY"]` at construction (verified at `kaizen_agents/delegate/adapters/openai_adapter.py:54`). Same for `stream_delegate` at `arbor_loop.py:260-273` — no caller filter.

**Required additional change to `create_delegate` (and `stream_delegate`):**

- Add a `require_server_default: bool = False` parameter to `DelegateConfig`. Defaults `False` for legacy/script callers; the advisory router (T114) sets it to `True` so request-context calls cannot fall through to env.
- In `create_delegate` / `stream_delegate`:
  - If `config.adapter is not None`: use it (current happy path)
  - If `config.adapter is None and config.require_server_default`: raise `RuntimeError("DelegateConfig.adapter is required in request context — env fallback is disabled to prevent multi-tenant key leakage. See T113.")`
  - If `config.adapter is None and not config.require_server_default`: fall back to `_resolve_llm_settings_from_env` (legacy/script path only)

### C-2 — Replace the snapshot regression test with a true two-request reproduction

The original `test_arbor_loop_does_not_mutate_env` snapshots `os.environ` before/after one call. The C1 bug only manifests when one request poisons env state for the next. Rewrite the test:

```python
def test_C1_create_delegate_does_not_leak_byok_to_subsequent_request(monkeypatch):
    """Regression: C1 multi-tenant env poisoning. Request A configured with
    Ollama BYOK (explicit adapter); request B configured with no adapter and
    no env. After A runs, B must NOT see A's base_url or api_key in
    os.environ."""
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_BASE_URL", raising=False)

    # Request A: explicit Ollama adapter
    cfg_a = DelegateConfig(
        adapter=OllamaStreamAdapter(base_url="http://customer-a:11434", default_model="llama3.1:8b"),
        company_id="company-a",
    )
    delegate_a = create_delegate(cfg_a)

    # Request B: no adapter, server-default-required path
    cfg_b = DelegateConfig(adapter=None, require_server_default=True, company_id="company-b")
    with pytest.raises(RuntimeError, match="adapter is required in request context"):
        create_delegate(cfg_b)

    # Final invariant: env was NOT mutated by request A
    assert "OPENAI_API_KEY" not in os.environ
    assert "OPENAI_BASE_URL" not in os.environ
```

This test FAILS on the pre-fix codebase (because `setdefault` would have written into env) AND on a half-fix (where `setdefault` is gone but `adapter is None` still falls through to the env-reading adapter).

### M1 — Use asyncio executor pattern in concurrency test, not bare ThreadPoolExecutor

The router calls `loop.run_in_executor(None, lambda: run_delegate_sync(...))` (`advisory.py:384`). The original `test_concurrent_create_delegate_isolated` uses `ThreadPoolExecutor` directly. Rewrite:

```python
async def test_concurrent_create_delegate_isolated_via_asyncio_executor():
    loop = asyncio.get_running_loop()
    cfg_a = DelegateConfig(adapter=OllamaStreamAdapter(base_url="http://a:11434", default_model="llama3.1:8b"))
    cfg_b = DelegateConfig(adapter=OpenAIStreamAdapter(api_key="sk-b", default_model="gpt-5-mini"))
    da, db = await asyncio.gather(
        loop.run_in_executor(None, lambda: create_delegate(cfg_a)),
        loop.run_in_executor(None, lambda: create_delegate(cfg_b)),
    )
    assert da._loop._adapter is cfg_a.adapter
    assert db._loop._adapter is cfg_b.adapter
```

### M2 — Identity assertion instead of init-kwargs capture

Replace `monkey-patch Delegate.__init__` with:

```python
delegate = create_delegate(DelegateConfig(adapter=ollama_adapter))
assert delegate._loop._adapter is ollama_adapter  # identity, not equality
```

The identity check pins the actual invariant (the adapter ends up plumbed into `AgentLoop._adapter`).

### L5 — Test name should match assertion

Rename `test_arbor_loop_does_not_mutate_env` to the C-2 test name above so the test file is self-explanatory.

### Updated acceptance criteria — supersede or augment original list

- [ ] `DelegateConfig` has `adapter: StreamingChatAdapter | None = None` AND `require_server_default: bool = False`
- [ ] `create_delegate` and `stream_delegate` raise `RuntimeError` when `adapter is None and require_server_default is True`
- [ ] `test_C1_create_delegate_does_not_leak_byok_to_subsequent_request` exists and passes
- [ ] Asyncio-executor concurrency test exists and passes
- [ ] Identity assertion (`is`) used in adapter-plumbing tests
- [ ] Original tests (`test_delegate_config_adapter_injection`, `test_arbor_loop_does_not_mutate_env`) updated or replaced
