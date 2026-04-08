# Embedding Strategy — Provider-Aware, 1024-dim Standard

**Date:** 2026-04-08
**Trigger:** Q5 resolution — "ollama embeddings please, select the best today"

## Decision

**Standardize on 1024-dimensional embeddings across all providers, with provider-aware selection at query time.**

| Provider | Embedding model                                             | Dimensions | Notes                                            |
| -------- | ----------------------------------------------------------- | ---------- | ------------------------------------------------ |
| Ollama   | `mxbai-embed-large`                                         | 1024       | Default for self-hosted / air-gapped deployments |
| OpenAI   | `text-embedding-3-large` (with `dimensions=1024` parameter) | 1024       | Default for cloud BYOK                           |

The pgvector column is migrated from 1536-dim (current OpenAI `text-embedding-3-small`) to 1024-dim once. After the migration, the same vector store and the same retrieval logic work for both providers — only the embedder choice differs per request.

## Why `mxbai-embed-large`

Ollama supports several embedding models. As of 2026, the strongest English-language options are:

| Model                      | Params | Dim  | MTEB rank | Size on disk |
| -------------------------- | ------ | ---- | --------- | ------------ |
| `mxbai-embed-large`        | 335M   | 1024 | Top tier  | ~670 MB      |
| `bge-large-en-v1.5`        | 335M   | 1024 | Top tier  | ~670 MB      |
| `snowflake-arctic-embed:l` | 335M   | 1024 | Top tier  | ~670 MB      |
| `nomic-embed-text` v1.5    | 137M   | 768  | Strong    | ~275 MB      |
| `all-minilm` (l6-v2)       | 22M    | 384  | Baseline  | ~45 MB       |

`mxbai-embed-large` is selected because:

1. **Highest MTEB scores in the 335M class** for English retrieval tasks (legal/technical text — exactly Arbor's KB content)
2. **Native Ollama support** with a stable model name (`mxbai-embed-large`)
3. **Matches OpenAI's `text-embedding-3-large` at 1024-dim** when that model's `dimensions` parameter is set, allowing a single column dimension across providers
4. **Acceptable resource footprint** — 670 MB on disk, runs comfortably on commodity hardware (no GPU required)
5. **Same vendor as the chat models** Arbor recommends (Mixedbread / mxbai consistency)

`nomic-embed-text` is the popular default in Ollama tutorials, but its 768-dim is non-standard against OpenAI's offerings, and its scores trail mxbai for English retrieval. We don't use it.

`bge-large-en-v1.5` is essentially tied with mxbai but Ollama's tag freshness has historically been better for mxbai. Either would work; the plan picks mxbai with a documented fallback to bge.

`snowflake-arctic-embed:l` is the third strong contender. Documented as a fallback for any future Ollama deployment that has issues pulling mxbai.

## Why 1024-dim instead of staying at 1536

The current KB uses OpenAI `text-embedding-3-small` at 1536-dim. Switching providers requires switching embedders, and:

- `mxbai-embed-large` is natively 1024-dim (cannot be configured otherwise)
- `text-embedding-3-large` supports `dimensions` parameter and can be set to 1024
- 1024-dim is sufficient for legal/HR retrieval (the small drop from 1536 vs 1024 is well within noise on MTEB benchmarks)
- Storing one dim across providers avoids dual columns or per-tenant indexes

The alternative — keeping 1536-dim and using `text-embedding-3-small` for OpenAI customers, plus padding mxbai's 1024-dim with zeros — is silently broken because zero-padded vectors have wrong cosine similarity properties. Don't do that.

## What changes in the code

### 1. `src/hr_advisory/models/vector_setup.py`

```python
VECTOR_DIMENSIONS = 1024  # was 1536 (OpenAI text-embedding-3-small)
```

### 2. `src/hr_advisory/models/vector_search_node.py` (line 27)

Update the docstring/description: `Query embedding vector (1024-dim)`.

### 3. `src/hr_advisory/kb/embeddings.py` — provider-aware

Replace the OpenAI-only `EmbeddingPipeline` with a class that takes an `LLMKeyContext` (or a provider name) and dispatches:

```python
class EmbeddingPipeline:
    def __init__(self, ctx: LLMKeyContext | None = None):
        self._ctx = ctx or LLMKeyContext.from_server_env()

    def generate_embedding(self, text: str) -> list[float]:
        if self._ctx.provider == "ollama":
            return self._embed_ollama(text)
        return self._embed_openai_compatible(text)

    def _embed_ollama(self, text: str) -> list[float]:
        # POST {base_url}/api/embeddings with {"model": "mxbai-embed-large", "prompt": text}
        ...

    def _embed_openai_compatible(self, text: str) -> list[float]:
        # client.embeddings.create(input=text, model="text-embedding-3-large", dimensions=1024)
        ...
```

Both branches return a 1024-dim list. No silent fallback — if either provider fails, raise with an actionable message (per zero-tolerance Rule 3).

### 4. New env vars (in `config/settings.py` and `.env.example`)

```bash
EMBEDDING_DIMENSIONS=1024              # canonical
EMBEDDING_MODEL_OPENAI=text-embedding-3-large
EMBEDDING_MODEL_OLLAMA=mxbai-embed-large
```

### 5. Migration script

`scripts/migrate_kb_to_1024_dim.py`:

1. Read all current provisions with their 1536-dim embeddings (for rollback safety, dump them to a JSONL file first)
2. `ALTER TABLE provisions DROP COLUMN embedding`
3. `ALTER TABLE provisions ADD COLUMN embedding vector(1024)`
4. Recreate the pgvector index (HNSW or IVFFlat — match what's currently used)
5. For each provision:
   - Build the embedding text via `generate_provision_text(provision)`
   - Call the new provider-aware `EmbeddingPipeline.generate_embedding(text)`
   - Write the new 1024-dim vector
6. Verify: count of provisions with embedding == count of provisions total
7. Run a sanity-check retrieval query against a known good provision and assert the top result is the expected one

The migration is idempotent (re-runnable). It runs once per environment (dev, staging, prod).

### 6. Tests

- Unit: `EmbeddingPipeline` with Ollama context returns 1024-dim vector via mocked httpx
- Unit: `EmbeddingPipeline` with OpenAI context returns 1024-dim vector via mocked openai client
- Unit: Both embedders return the same dimension
- Integration: Real Ollama container with `mxbai-embed-large` pulled — embed a test string, assert 1024 floats
- Integration: After migration, retrieve a known KB provision via semantic search and verify the result

### 7. Tool-capability allowlist scope

The `OLLAMA_TOOL_CAPABLE_FAMILIES` allowlist applies to **chat models**, not embedding models. `mxbai-embed-large` is an embedding-only model and does not need to be in the chat allowlist. Add a separate constant `OLLAMA_EMBEDDING_MODELS = frozenset({"mxbai-embed-large", "bge-large-en-v1.5", "snowflake-arctic-embed", "nomic-embed-text"})` for validation of the embedding model env var.

## Deployment implications

- **Self-hosted Ollama** users now need to pull TWO models: a chat model (e.g. `llama3.1:8b`) AND an embedding model (`mxbai-embed-large`). Document this in the Ollama setup guide.
- **Cloud OpenAI BYOK** users continue with their key; Arbor calls `text-embedding-3-large` with `dimensions=1024`.
- **GCE arbor-prod** deployment needs `OPENAI_API_KEY` for embeddings even if all customers are BYOK Ollama for chat — until/unless arbor-prod hosts its own Ollama for embeddings.
- **One-time KB re-embed** runs as part of the deployment migration. ~3,000 provisions × ~50ms per OpenAI call ≈ 2.5 minutes. Faster on Ollama.
- **Backup**: dump existing 1536-dim embeddings to a JSONL before the migration. Rollback path exists for the first week post-migration.

## Risks and mitigations

| Risk                                                          | Mitigation                                                                                                                                  |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `mxbai-embed-large` quality drops vs `text-embedding-3-large` | Run a side-by-side retrieval quality test on 50 representative HR queries during migration. Accept if precision@5 is within 5% of baseline. |
| Existing embeddings lost mid-migration                        | JSONL backup before drop; rollback script reverses the column change                                                                        |
| Ollama embeddings server is slow (large model on CPU)         | Document recommended hardware: 8+ GB RAM, modern x86 CPU. mxbai is CPU-friendly                                                             |
| Customers with custom KB content can't re-embed easily        | Migration script is idempotent and exposed as `scripts/migrate_kb_to_1024_dim.py` so customers can run it themselves                        |
| Provider-aware dispatch becomes a hidden routing bug          | The dispatch is on `LLMKeyContext.provider` (configuration, not user input) — permitted exception #5 in agent-reasoning                     |

## Future work (deferred)

- Per-company embedding model override (e.g., one company wants `bge-m3` for multilingual)
- GPU-accelerated embedding via Ollama on CUDA for high-volume deployments
- Embedding cache (Redis) to avoid re-embedding identical query strings
- Move to a dedicated embeddings microservice if Arbor's call volume exceeds the in-process embedder

## References

- Ollama embedding models: <https://ollama.com/library?q=embedding>
- mxbai embed v1 model card: <https://huggingface.co/mixedbread-ai/mxbai-embed-large-v1>
- OpenAI `text-embedding-3-large` `dimensions` parameter: <https://platform.openai.com/docs/guides/embeddings#use-cases>
- MTEB leaderboard: <https://huggingface.co/spaces/mteb/leaderboard>
