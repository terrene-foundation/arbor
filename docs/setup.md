# Arbor Setup Guide

## LLM Provider Configuration

Arbor requires at least one LLM provider. The server validates this at startup and refuses to boot without a valid configuration.

### Cloud (OpenAI)

Set `OPENAI_API_KEY` in `.env`. The default model is read from `OPENAI_PROD_MODEL` or `DEFAULT_LLM_MODEL`.

### Self-Hosted (Ollama)

Set `OLLAMA_BASE_URL` and `OLLAMA_MODEL` in `.env`.

**Two models are required** for a fully functional Ollama deployment:

1. **Chat model** — must support tool calls. Tool-capable families:
   - `qwen3`, `qwen2.5`, `qwq` (Qwen reasoning)
   - `llama3.1`, `llama3.2`
   - `mistral-nemo`, `firefunction-v2`
   - `command-r`, `command-r-plus`

   **Recommended:** `qwen3:latest` — 5.2 GB, fast, clean output, strong tool-call
   behavior with aggressive KB search. Verified against Arbor's advisory engine
   with real Singapore HR content.

   ```bash
   ollama pull qwen3:latest     # ~5.2 GB (recommended)
   # or
   ollama pull qwq:32b          # ~19 GB (reasoning, slower, emits <think> blocks)
   # or
   ollama pull llama3.1:8b      # ~4.7 GB (canonical small option)
   ```

2. **Embedding model** — for knowledge base semantic search:

   ```bash
   ollama pull mxbai-embed-large   # ~670 MB
   ```

**Minimum disk**: ~6 GB (qwen3 + mxbai-embed-large). Plan for more if you pick qwq.

**Environment variables**:

```bash
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen3:latest
EMBEDDING_MODEL_OLLAMA=mxbai-embed-large   # default, can be overridden
```

### Both Providers

You can configure both providers simultaneously. BYOK users can choose their provider in the UI. The server uses `OPENAI_API_KEY` as the default for non-BYOK companies.

## Performance comparison (reference)

Measured with `scripts/compare_qwen_vs_openai.py` on 6 representative HR queries:

| Provider | Model               | Median latency | Tool calls       | Output quality                                   |
| -------- | ------------------- | -------------- | ---------------- | ------------------------------------------------ |
| OpenAI   | `gpt-5-chat-latest` | ~5 s           | Selective (2/6)  | Precise, age-banded CPF rates                    |
| Ollama   | `qwen3:latest`      | ~16 s          | Aggressive (5/6) | Clean, compliant, sometimes generic on specifics |
| Ollama   | `qwq:32b`           | ~60-90 s       | Aggressive       | Chain-of-thought visible, messier                |

qwen3 is the right default for self-hosted / air-gap deployments. OpenAI remains faster and slightly more precise on numeric specifics. All three correctly enforce the Refusal Policy (circumvention refusal + prompt-injection refusal verified end-to-end).

## Troubleshooting

### "No LLM provider configured" at startup

Set either `OPENAI_API_KEY` or `OLLAMA_MODEL` + `OLLAMA_BASE_URL` in `.env`. See `.env.example` for the full list.

### "OLLAMA_MODEL is not tool-capable"

The configured model does not support function/tool calls. Change `OLLAMA_MODEL` to one from the allowed families listed above.

### KB search returns no results after Ollama setup

Check that `mxbai-embed-large` is pulled on the Ollama server:

```bash
ollama list   # should show mxbai-embed-large
ollama pull mxbai-embed-large   # if missing
```

### Embedding dimension mismatch

If you see "Expected 1024-dim embedding", the embedding model is returning the wrong dimensions. Verify you're using `mxbai-embed-large` (native 1024-dim) for Ollama or `text-embedding-3-large` with `dimensions=1024` for OpenAI.
