# T114 — Phase 3: Thread adapter through advisory router

**Status**: ACTIVE
**Phase**: 3 (Router wiring)
**Plan ref**: `02-plans/06-ollama-provider-plan.md` lines 122-129
**Depends on**: T113
**Blocks**: T115, T116, T117 (and indirectly the rest)
**Specialist**: nexus-specialist, kaizen-specialist

## Goal

Build the bridge between `LLMKeyContext` (already populated by `services/llm_config.build_llm_context`) and `DelegateConfig.adapter` (just added in T113). After this, every advisory query routes through whatever adapter the resolved context demands — Ollama, OpenAI, or any future provider — without env mutation.

## What to build

### 1. New helper in `src/hr_advisory/services/llm_config.py`

```python
def build_adapter_from_context(ctx: LLMKeyContext) -> "StreamingChatAdapter":
    """Build a per-request StreamingChatAdapter from a resolved LLMKeyContext.

    Delegates to kaizen_agents.delegate.adapters.get_adapter so the provider
    family stays in one place. Always returns a fresh adapter instance — never
    a cached one — so concurrent requests cannot share state.
    """
    from kaizen_agents.delegate.adapters import get_adapter
    return get_adapter(
        provider=ctx.provider,
        model=ctx.model,
        api_key=ctx.api_key,
        base_url=ctx.base_url,
    )
```

- Place near the existing `build_llm_context` function
- Use a forward-reference string for `StreamingChatAdapter` in the signature (or import at module top — match existing import style in the file)
- Add a docstring noting: "Per-request instance; never share between requests."

### 2. Wire both call sites in `src/hr_advisory/api/routers/advisory.py`

The plan flags two regions: lines **373-380** (`/advisory/query`) and **748-759** (`/advisory/query/stream`). Verify line numbers when reading the file — they may have shifted after T111.

For each call site:

- After `llm_context = build_llm_context(...)`, add `adapter = build_adapter_from_context(llm_context)`
- When constructing `DelegateConfig(...)`, pass `adapter=adapter`
- **Stop passing** `model=...`, `api_key=...`, `base_url=...` into `DelegateConfig` — they live inside the adapter now
- **Keep** the identity/tenant fields: `company_id`, `jwt_token`, `company_context`, `user_context`

### 3. Update import block in `advisory.py`

- Add `from hr_advisory.services.llm_config import build_adapter_from_context`
- Confirm `build_llm_context` import is still present (it should be — unchanged)

## Acceptance criteria

- [ ] `build_adapter_from_context` exists in `services/llm_config.py` with the contract above
- [ ] Both `/advisory/query` and `/advisory/query/stream` build an adapter and pass it via `DelegateConfig(adapter=...)`
- [ ] Neither call site passes `model`, `api_key`, or `base_url` to `DelegateConfig` anymore
- [ ] `rg "DelegateConfig\(.*model=" src/hr_advisory/api/routers/advisory.py` → 0 matches
- [ ] Identity/tenant fields (`company_id`, `jwt_token`, `company_context`, `user_context`) still flow through unchanged
- [ ] New unit test `test_build_adapter_from_context_ollama`: `LLMKeyContext(provider="ollama", model="llama3.1:8b", base_url="http://x:11434", api_key=None)` → returns `OllamaStreamAdapter` instance with matching base_url and default_model
- [ ] New unit test `test_build_adapter_from_context_openai`: `LLMKeyContext(provider="openai", model="gpt-5-chat-latest", api_key="sk-...")` → returns `OpenAIStreamAdapter`
- [ ] New unit test `test_advisory_router_passes_adapter_to_delegate_config`: monkey-patch `Delegate.__init__` to capture kwargs, hit `/advisory/query` in the test client with a BYOK Ollama config, assert `kwargs["adapter"]` is an `OllamaStreamAdapter`
- [ ] All advisory router unit tests pass: `pytest tests/unit/api/routers/test_advisory.py -x`
- [ ] Integration test (Tier 2, will be added in T126 — note as deferred dependency): `POST /advisory/query` with BYOK Ollama config observes a connection to the Ollama container and a tool call to `search_kb`

## Traps

- **`LLMKeyContext.api_key` may be `None` for Ollama** — `get_adapter` must accept `None` for the Ollama branch and treat it as "no auth header". If kaizen-agents requires a non-None key, file an upstream issue (T124) and pass an empty string `""` as a temporary marker until the upstream fix lands; document this in code with a `# TODO(kailash-py-issue-XXX)` comment.
- **Streaming endpoint duplication** — both `/query` and `/query/stream` need the same adapter wiring. Don't fix one and forget the other; the streaming path is the one users actually hit in the chat UI.
- **Don't cache adapters in module-level state** — `build_adapter_from_context` MUST construct fresh instances every call. Caching by `(provider, base_url)` reintroduces tenant cross-contamination via shared httpx clients.
- **`build_llm_context` already does provider resolution** — do not duplicate the logic. The adapter builder is downstream of context resolution.

## Red team round 1 revisions (H4, H5, M2, M23)

### H4 — The streaming path mutates `DelegateConfig` attributes after construction

`api/routers/advisory.py:748-760` builds `DelegateConfig(...)` with identity fields only, then assigns `delegate_config.api_key`, `.base_url`, `.model`, and (probably) one more field POST-CONSTRUCTION on lines 754-759. The original acceptance check `rg "DelegateConfig\(.*model=" advisory.py` does NOT catch these post-construction assignments. Without explicit guidance, the implementer following T114 literally will miss the bug.

**Required additional changes to `api/routers/advisory.py:748-760`:**

- Read the file first; verify the exact post-construction assignments
- DELETE every `delegate_config.api_key = ...`, `delegate_config.base_url = ...`, `delegate_config.model = ...` (and any related field) on lines 754-759
- Replace them with a single line: `delegate_config.adapter = build_adapter_from_context(llm_context)` (or, if `DelegateConfig` is already instantiated with `adapter=...` in the constructor, just delete the post-construction assignments)
- Better: rewrite the streaming endpoint to pass `adapter=adapter` in the constructor like the non-stream path, eliminating post-construction assignment entirely

### H5 — `build_adapter_from_context` must NOT silently fall back to env

If `LLMKeyContext.api_key is None` for the OpenAI provider, `OpenAIStreamAdapter(api_key=None, ...)` reads `os.environ["OPENAI_API_KEY"]` — exactly the C1 reintroduction under a different code path.

**Required additional logic in `build_adapter_from_context`:**

```python
def build_adapter_from_context(ctx: LLMKeyContext) -> "StreamingChatAdapter":
    """Build a per-request StreamingChatAdapter from a resolved LLMKeyContext.

    Per-request instance; never share between requests. Raises if the context
    is incomplete — never silently falls back to env.
    """
    from kaizen_agents.delegate.adapters import get_adapter

    if ctx.provider == "openai" and not ctx.api_key:
        raise RuntimeError(
            "OpenAI provider context has no api_key. This indicates a bug in "
            "build_llm_context — server-default key should have been resolved upstream."
        )
    if ctx.provider == "ollama" and not ctx.base_url:
        raise RuntimeError(
            "Ollama provider context has no base_url. Set OLLAMA_BASE_URL or save a BYOK config."
        )
    return get_adapter(
        provider=ctx.provider,
        model=ctx.model,
        api_key=ctx.api_key,
        base_url=ctx.base_url,
    )
```

Add to the advisory router call sites: pass `require_server_default=True` to `DelegateConfig` (the field added in T113 round-1 revisions), so a buggy adapter resolution can never fall through to env.

### M2 — Identity assertion in the adapter-plumbing test

Original test "monkey-patches `Delegate.__init__`" — too brittle. Replace with:

```python
def test_advisory_router_passes_adapter_to_delegate_config(client, ollama_byok_config):
    # Hit /advisory/query, capture the Delegate instance via a fixture or test hook
    delegate = call_advisory_query_capturing_delegate(client, ollama_byok_config)
    assert isinstance(delegate._loop._adapter, OllamaStreamAdapter)  # type check
    assert delegate._loop._adapter.base_url == ollama_byok_config["base_url"]  # value check
```

### M23 — Split the adapter-passing test into two

There are two call sites (`/advisory/query` and `/advisory/query/stream`). One test won't catch a half-migration. Split into:

- `test_query_endpoint_passes_adapter_to_delegate_config`
- `test_stream_endpoint_passes_adapter_to_delegate_config`

### Updated acceptance criteria

- [ ] `build_adapter_from_context` raises `RuntimeError` for incomplete OpenAI context (missing api_key) and incomplete Ollama context (missing base_url)
- [ ] `advisory.py:748-760` no longer has post-construction assignments to `delegate_config.{api_key,base_url,model}`
- [ ] Both `/advisory/query` and `/advisory/query/stream` pass `require_server_default=True` to `DelegateConfig`
- [ ] Two split tests exist (one per call site)
- [ ] Identity check `delegate._loop._adapter is adapter_instance` is used (not `init` mocking)
