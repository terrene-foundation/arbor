# Arbor Setup Guide

## LLM Provider Configuration

Arbor requires at least one LLM provider. The server validates this at startup and refuses to boot without a valid configuration.

### Cloud (OpenAI)

Set `OPENAI_API_KEY` in `.env`. The default model is read from `OPENAI_PROD_MODEL` or `DEFAULT_LLM_MODEL`.

### Self-Hosted (Ollama)

Set `OLLAMA_BASE_URL` and `OLLAMA_MODEL` in `.env`.

**Two models are required** for a fully functional Ollama deployment:

1. **Chat model** — must support tool calls. Allowed families:
   - `llama3.1`, `llama3.2`, `qwen2.5`, `mistral-nemo`
   - `firefunction-v2`, `command-r`, `command-r-plus`

   ```bash
   ollama pull llama3.1:8b     # ~4.7 GB
   ```

2. **Embedding model** — for knowledge base semantic search:

   ```bash
   ollama pull mxbai-embed-large   # ~670 MB
   ```

**Minimum disk**: ~5.5 GB for both models.

**Environment variables**:

```bash
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.1:8b
EMBEDDING_MODEL_OLLAMA=mxbai-embed-large   # default, can be overridden
```

### Both Providers

You can configure both providers simultaneously. BYOK users can choose their provider in the UI. The server uses `OPENAI_API_KEY` as the default for non-BYOK companies.

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
