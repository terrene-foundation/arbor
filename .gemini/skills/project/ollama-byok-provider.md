---
name: ollama-byok-provider
description: "Arbor Ollama BYOK provider — tool-capable allowlist, per-request adapter injection, 1024-dim embeddings, kaizen-agents M4 runtime patch."
---

# Ollama BYOK Provider (v0.4.0+)

Arbor ships a first-class BYOK Ollama provider for self-hosted / air-gap deployments. Every advisory query can route through a local Ollama endpoint (or a company-specific DGX) via the same `run_delegate_sync` code path as OpenAI. This skill consolidates the knowledge a specialist needs to reason about, debug, or extend the Ollama path.

## Three places Ollama is configured

1. **Per-user BYOK** (web UI → `Settings > AI Configuration > Personal`)
2. **Per-company BYOK** (web UI → `Settings > AI Configuration > Company`)
3. **Server default** (`.env` → `OLLAMA_BASE_URL` + `OLLAMA_MODEL`)

Resolution precedence (highest wins): user BYOK > company BYOK > server .env defaults. Implemented in `services/llm_config.build_llm_context(company_id, user_id)`.

## Tool-capable model allowlist

Non-tool-capable Ollama models silently ignore the `tools` field and hallucinate answers without calling `search_kb` / `calculate_cpf`. In a regulated advisory context this is unacceptable, so Arbor enforces a **hard allowlist** at three layers:

1. **Save-time** — `api/routers/llm_config.py` save endpoints reject non-allowlisted models with HTTP 400 + clear message
2. **Validate-time** — `Settings > AI > Test & Save` verifies the model is both in the allowlist AND actually pulled on the user's Ollama server (via `/api/tags`)
3. **Init-time** — `api/server.py::_validate_env_invariants` refuses to boot the service if the server-default `OLLAMA_MODEL` is non-tool-capable

### Current allowlist (`services/llm_config.OLLAMA_TOOL_CAPABLE_FAMILIES`)

- `llama3.1`, `llama3.2`
- `qwen2.5`, `qwen3`, `qwq` (Qwen reasoning)
- `mistral-nemo`
- `firefunction-v2`
- `command-r`, `command-r-plus`

The allowlist is family-level (stripped at `:`) so users can pin specific quantizations (`llama3.1:70b-instruct-q4_0`) without us maintaining the full tag matrix.

### Adding a new family

When kaizen-agents adds support for a new tool-capable family, update `OLLAMA_TOOL_CAPABLE_FAMILIES` in `services/llm_config.py` AND the comment in `.env.example` AND the table in `docs/ollama-dev-setup.md`. All three must stay in sync.

## Per-request adapter injection (C1 fix)

**Critical invariant:** the Delegate must be constructed with an explicit `adapter` in every request context. The old `os.environ.setdefault` pattern leaked the BYOK company's API key / base_url into the process env, poisoning subsequent requests from OTHER companies.

### The pattern (advisory.py, shadow.py)

```python
from hr_advisory.services.llm_config import build_adapter_from_context, build_llm_context
from hr_advisory.delegate.arbor_loop import DelegateConfig, create_delegate

# 1. Resolve the LLM context for this request
llm_context = build_llm_context(
    company_id=int(company_id),
    user_id=int(user_id) if user_id else None,
)

# 2. Build a per-request adapter (raises if context is incomplete — no silent env fallback)
adapter = build_adapter_from_context(llm_context)

# 3. Pass adapter + require_server_default=True into DelegateConfig
delegate_config = DelegateConfig(
    adapter=adapter,
    require_server_default=True,
    company_id=int(company_id),
    jwt_token=jwt_token,
    company_context=company_profile,
    user_context=user_ctx,
)

delegate = create_delegate(delegate_config)
```

### Code path invariants

- `rg "os.environ.setdefault" src/hr_advisory/delegate/` → **0 matches** (regression test pins this)
- `rg "DelegateConfig\(" src/hr_advisory/api/routers/` — every result MUST include `adapter=` and `require_server_default=True`
- `create_delegate` raises `RuntimeError("DelegateConfig.adapter is required in request context...")` if `require_server_default=True` without an adapter
- `build_adapter_from_context` raises if OpenAI context has no `api_key` or Ollama context has no `base_url`

### Regression test

`tests/regression/test_regression_C1_env_leak.py` pins the two-request reproduction: request A (BYOK Ollama, explicit adapter) then request B (no adapter, `require_server_default=True`) must raise + leave `os.environ` unchanged.

## Embedding pipeline (1024-dim, provider-aware)

Arbor standardizes on **1024-dim** vectors for KB semantic search, enabling dual-provider embeddings:

- **OpenAI**: `text-embedding-3-large` with `dimensions=1024` parameter
- **Ollama**: `mxbai-embed-large` (native 1024-dim)

### EmbeddingPipeline dispatch (`kb/embeddings.py`)

```python
class EmbeddingPipeline:
    def __init__(self, ctx: LLMKeyContext | None = None):
        self._ctx = ctx or LLMKeyContext.from_server_env()

    def generate_embedding(self, text: str) -> list[float]:
        if self._ctx.provider == "ollama":
            return self._embed_ollama(text)   # POST /api/embeddings
        return self._embed_openai_compatible(text)  # client.embeddings.create
```

### Invariants

- Every embedding call returns exactly `EMBEDDING_DIMENSIONS` (1024) floats
- Wrong-dim raises `RuntimeError` naming the expected model (no silent fallback)
- Unreachable Ollama raises with an actionable message (no silent None-return)
- `mxbai-embed-large` is the ONLY supported Ollama embedding model in v0.4.0 — other 1024-dim models (`bge-large-en-v1.5`, `snowflake-arctic-embed`, `nomic-embed-text`) are in the `OLLAMA_EMBEDDING_MODELS` allowlist but not actively validated

### Vector dim migration (one-time, already complete on the live cluster)

`scripts/migrate_kb_to_1024_dim.py` — idempotent script that migrates the `provisions.embedding` column from 1536-dim to 1024-dim. Uses `pg_attribute.format_type` (NOT `information_schema.udt_name` which can't distinguish dims). Dumps JSONL.gz backup with SHA-256 checksum before any DROP. Captures the existing pgvector index definition from `pg_indexes` and replays it after the column recreate. See `docs/migrations/embedding-1024.md` for the runbook.

## kaizen-agents M4 runtime patch

**Upstream bug:** [kailash-py#361](https://github.com/terrene-foundation/kailash-py/issues/361). `kaizen_agents/delegate/adapters/ollama_adapter.py::_convert_messages_for_ollama` passes tool-call arguments through as JSON strings (OpenAI wire format) on the second turn to Ollama. Ollama expects `tool_calls[].function.arguments` as an object, sees a string, returns HTTP 400:

> `{"error":"Value looks like object, but can't find closing '}' symbol"}`

**Impact without the patch:** every advisory query that needs a tool call fails. Advisory engine, KB search, calculators — none work end-to-end via Ollama.

### Patch location

`src/hr_advisory/delegate/_kaizen_patches.py` — a module-level runtime monkey-patch that wraps `_convert_messages_for_ollama` to unwrap stringified tool-call args. Imported at the top of `delegate/arbor_loop.py` so it applies before any Delegate is constructed.

Properties:

- Idempotent (sets `_arbor_m4_patched` flag on the kaizen module)
- Reversible — delete the patch file + the import line in `arbor_loop.py` once upstream ships the fix
- Regression-tested — `tests/regression/test_regression_M4_kaizen_ollama_tool_args.py` has 4 tests (apply, preserve-object-args, malformed-json-graceful, idempotent)
- Documented inline with the upstream issue URL

### When upstream fixes it

1. Bump `kaizen-agents` pin in `pyproject.toml` to the fixed version
2. Run `tests/regression/test_regression_M4_kaizen_ollama_tool_args.py` — the tests should still pass (the patch becomes a no-op over the already-fixed upstream)
3. Delete `_kaizen_patches.py`
4. Remove the `import hr_advisory.delegate._kaizen_patches` line from `arbor_loop.py`
5. Keep the regression tests — they pin the invariant at the kaizen layer regardless of whether our patch is active

## Model choice guidance

### Recommended default: `qwen3:latest`

- Size: 5.2 GB
- Speed: ~16 s median on HR queries (vs OpenAI 5 s, qwq 60-90 s)
- Tool-call behavior: aggressive (5/6 HR queries trigger `search_kb`)
- Output: clean — no `<think>` blocks
- Refusal Policy compliance: verified end-to-end

### Reasoning alternative: `qwq:32b`

- Size: 19 GB
- Speed: 60-90 s median
- Output: includes `<think>...</think>` chain-of-thought before the answer
- Use case: when you want the reasoning chain visible for audit / debug
- Caveat: strip `<think>` blocks server-side if surfacing to non-developer users

### Canonical small: `llama3.1:8b`

- Size: 4.7 GB
- Speed: similar to qwen3
- Output: clean
- Use when: testing the path with the smallest possible footprint

### NOT multi-modal

`qwq`, `qwen3`, `qwen2.5` are all text-only. The vision-capable Qwen variants are `qwen2-vl` / `qwen2.5-vl`, which are NOT in the tool-capable allowlist. Arbor's advisory path is text-only; vision use cases are out of scope.

## Comparing providers side-by-side

`scripts/compare_qwen_vs_openai.py` sends the same 6 HR queries through `run_delegate_sync` with both providers and prints a latency/tool-call/response comparison. Use it to:

- Calibrate latency expectations before a deploy decision
- Sanity-check a new Ollama model before adding to the allowlist
- Regression-check after kaizen-agents version bumps

```bash
DATABASE_URL=sqlite:///:memory: \
  .venv/bin/python scripts/compare_qwen_vs_openai.py --qwen-model qwen3:latest
```

## Debugging checklist

When an Ollama path breaks:

1. **Is it reachable?** `curl -s http://localhost:11434/api/tags | jq '.models[].name'`
2. **Is the model pulled?** The chat model AND `mxbai-embed-large` must be in the `/api/tags` list
3. **Is the model in the allowlist?** Grep `OLLAMA_TOOL_CAPABLE_FAMILIES` in `services/llm_config.py`
4. **Is the M4 patch loaded?** `python -c "import kaizen_agents.delegate.adapters.ollama_adapter as m; print(getattr(m, '_arbor_m4_patched', False))"` → should print `True`
5. **Is the adapter being injected?** Check logs for `Delegate LLM: adapter=OllamaStreamAdapter` — if you see `adapter=env-fallback`, the BYOK path isn't being hit
6. **Is the embedding dim right?** `mxbai-embed-large` returns 1024; `nomic-embed-text` returns 768 and will raise

## Related files

- `src/hr_advisory/delegate/arbor_loop.py` — `DelegateConfig`, `create_delegate`, `run_delegate_sync`
- `src/hr_advisory/delegate/_kaizen_patches.py` — M4 runtime patch
- `src/hr_advisory/delegate/system_prompt.py` — Refusal Policy (5 clauses before tool instructions)
- `src/hr_advisory/services/llm_config.py` — allowlist, `build_llm_context`, `build_adapter_from_context`, `validate_ollama_model`
- `src/hr_advisory/kb/embeddings.py` — provider-aware `EmbeddingPipeline`
- `src/hr_advisory/api/routers/advisory.py` — `/advisory/query` + `/advisory/query/stream` adapter wiring
- `src/hr_advisory/api/routers/shadow.py` — `/execute` adapter wiring (round 15 C1 regression fix)
- `src/hr_advisory/api/server.py::_validate_env_invariants` — init-time tool-capability gate
- `scripts/migrate_kb_to_1024_dim.py` — vector dim migration
- `scripts/compare_qwen_vs_openai.py` — provider comparison harness
- `docs/ollama-dev-setup.md` — developer onboarding
- `docs/setup.md` — general setup with Ollama section
- `docs/migrations/embedding-1024.md` — migration runbook
- `tests/regression/test_regression_C1_env_leak.py` — two-request C1 regression
- `tests/regression/test_regression_M4_kaizen_ollama_tool_args.py` — M4 patch regression (4 tests)
- (loom-internal reference) — plan red team
- (loom-internal reference) — security review (shadow.py C1 regression)
- (loom-internal reference) — live testing report

## Cross-references

- Upstream tracked issues (all 9 filed 2026-04-08):
  - kailash-py: #361 (M4), #363 (tool_call_id strip), #364 (stream+tools), #365 (embedding adapter), #366 (allowlist), #367 (polish)
  - kailash-rs: #286 (M4 equivalent), #287 (dead parser), #288 (streaming drops tool deltas), #289 (allowlist)
- Arbor PR: #14 (feature), #15 (ship prep)
