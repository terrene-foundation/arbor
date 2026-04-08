# T119 — Phase 7B: Provider-aware `EmbeddingPipeline` (Ollama mxbai + OpenAI 1024)

**Status**: ACTIVE
**Phase**: 7B (Embeddings — pipeline refactor)
**Plan ref**: `02-plans/06-ollama-provider-plan.md` lines 250-308
**Depends on**: T112, T118 (uses the new dim constant)
**Blocks**: T120
**Specialist**: ml-specialist (model selection, dim verification), kaizen-specialist (LLMKeyContext shape)

## Goal

Replace the OpenAI-hardcoded `EmbeddingPipeline` with a provider-aware implementation that dispatches on `LLMKeyContext.provider`:

- `provider == "ollama"` → POST to `<base_url>/api/embeddings` with model `mxbai-embed-large`, expect 1024-dim
- `provider == "openai"` (default) → call `openai.OpenAI().embeddings.create(model="text-embedding-3-large", dimensions=1024)`

No silent fallback. No "skip with warning if no API key". On any failure, raise `RuntimeError` with an actionable message naming the missing config and the path to fix it. This is per `zero-tolerance.md` Rule 3.

## What to build

### 1. Refactor `src/hr_advisory/kb/embeddings.py`

Replace the existing `EmbeddingPipeline` with the version in the plan (lines 254-291). Critical points:

- Constructor takes `ctx: LLMKeyContext | None = None`, defaults to `LLMKeyContext.from_server_env()`
- `generate_embedding(text)` dispatches on `self._ctx.provider`
- `_embed_ollama(text)`:
  - POST `{base_url}/api/embeddings` with `{"model": "mxbai-embed-large", "prompt": text}`
  - Use `httpx.post` with `timeout=30.0`
  - `resp.raise_for_status()`
  - Verify `len(embedding) == 1024` and raise `RuntimeError` if not (with "Check that mxbai-embed-large is pulled on the Ollama server")
- `_embed_openai_compatible(text)`:
  - Use `openai.OpenAI(api_key=ctx.api_key, base_url=ctx.base_url)`
  - Call `client.embeddings.create(input=text, model="text-embedding-3-large", dimensions=1024)`
  - Return `response.data[0].embedding`

### 2. Add new env vars to `src/hr_advisory/config/settings.py` and `.env.example`

```bash
EMBEDDING_DIMENSIONS=1024
EMBEDDING_MODEL_OPENAI=text-embedding-3-large
EMBEDDING_MODEL_OLLAMA=mxbai-embed-large
```

- Wire them into the settings class so they can be overridden per environment
- The pipeline can read from the settings instead of hardcoding the model names — this allows future tweaks without code change

### 3. Add the embedding model allowlist to `services/llm_config.py`

```python
OLLAMA_EMBEDDING_MODELS: frozenset[str] = frozenset({
    "mxbai-embed-large",
    "bge-large-en-v1.5",
    "snowflake-arctic-embed",
    "nomic-embed-text",
})
```

- Used by future validation flows (not enforced today, but available for the validate endpoint to optionally check)
- Document why each is on the list (all 1024-dim, all known to work with Ollama's `/api/embeddings`)

### 4. Delete the silent-fallback path

- The old `EmbeddingPipeline` had a "skip with warning if no API key" branch — DELETE it. The new behavior: raise `RuntimeError` with a message naming `OPENAI_API_KEY` or `OLLAMA_BASE_URL` depending on which is missing.
- Search the file for `try`/`except` blocks that swallow errors and remove or convert them to explicit raises.

## Acceptance criteria

- [ ] `EmbeddingPipeline.__init__` accepts `ctx: LLMKeyContext | None`
- [ ] `_embed_ollama` POSTs to `/api/embeddings` with the right shape
- [ ] `_embed_openai_compatible` uses `dimensions=1024`
- [ ] On wrong-dim response from Ollama, raises `RuntimeError` naming `mxbai-embed-large` and the pull instruction
- [ ] On missing provider config, raises `RuntimeError` (not silent return)
- [ ] No `except: pass` or `except Exception: return None` patterns remain in the file
- [ ] `EMBEDDING_DIMENSIONS=1024`, `EMBEDDING_MODEL_OPENAI=text-embedding-3-large`, `EMBEDDING_MODEL_OLLAMA=mxbai-embed-large` are in `.env.example`
- [ ] `OLLAMA_EMBEDDING_MODELS` constant declared in `services/llm_config.py`
- [ ] New unit tests (mocked transport):
  - `test_embedding_pipeline_ollama_returns_1024_dim_vector` (mocked httpx)
  - `test_embedding_pipeline_openai_returns_1024_dim_vector` (mocked openai)
  - `test_embedding_pipeline_ollama_raises_on_wrong_dim`
  - `test_embedding_pipeline_raises_on_missing_provider`
  - `test_embedding_pipeline_no_silent_fallback`

## Traps

- **`mxbai-embed-large` returns 1024-dim natively** — no `dimensions=` parameter for Ollama. If the user pulled a different embedding model that returns a different dim, the explicit length check catches it. Don't try to "auto-detect dim".
- **OpenAI `dimensions=1024` requires `text-embedding-3-*` family** — the older `text-embedding-ada-002` does not support dimension reduction. If a user has a custom OpenAI-compatible endpoint that doesn't support `dimensions`, the call will fail; document this in `docs/setup.md`.
- **Don't reuse a single `httpx.Client` across calls** — for now, `httpx.post` (function form) is fine. A persistent client would be a future optimization but introduces shared state across requests, which is what we're trying to avoid system-wide.
- **`LLMKeyContext.from_server_env()` may return `provider="openai"` even if no key is set** — verify the fallback behavior. If it returns `("openai", None, None)`, the OpenAI branch will fail with a clear error. If it returns `("none", ...)`, add a third branch raising "no provider configured".
- **Concurrency for the migration script (T118)** — the migration in T118 will call `EmbeddingPipeline` for ~3,000 provisions. A serial loop is fine for one-time migration; do NOT add a thread pool here without understanding Ollama's queueing behavior.

## Red team round 1 revisions (L12)

### L12 — Single source of truth for embedding dimension

`EMBEDDING_DIMENSIONS=1024` is hardcoded in `.env.example` AND `VECTOR_DIMENSIONS = 1024` is hardcoded in `vector_setup.py`. If they drift, pgvector silently fails INSERTs at runtime.

**Required:** make `VECTOR_DIMENSIONS` a derived constant or add a startup assertion:

```python
# In vector_setup.py
from hr_advisory.config.settings import get_settings
VECTOR_DIMENSIONS = get_settings().embedding_dimensions
```

OR (if the import order makes that awkward):

```python
# In api/server.py:main(), after _validate_env_invariants:
from hr_advisory.models.vector_setup import VECTOR_DIMENSIONS
from hr_advisory.config.settings import get_settings
assert VECTOR_DIMENSIONS == get_settings().embedding_dimensions, (
    f"VECTOR_DIMENSIONS ({VECTOR_DIMENSIONS}) drifted from "
    f"settings.embedding_dimensions ({get_settings().embedding_dimensions}). "
    f"Both must agree to avoid pgvector dimension mismatches."
)
```

### Updated acceptance criteria

- [ ] Single source of truth between `EMBEDDING_DIMENSIONS` env var and `VECTOR_DIMENSIONS` Python constant
- [ ] Startup assertion catches drift between the two before any DB write
