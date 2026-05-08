# Ollama Developer Setup

**Audience:** Arbor developers + company admins configuring BYOK on a self-hosted Ollama endpoint. This guide walks you from zero to a working Arbor instance that answers Singapore HR queries via local Ollama, with zero cloud dependency.

> **No source rebuild needed.** Switching Arbor to Ollama is a **configuration change only** — no `docker build`, no `npm run build`, no image rebuild. Pre-built images are on Docker Hub (`terrenefoundation/arbor-backend`, `terrenefoundation/arbor-frontend`); you pull them with `docker compose pull` and restart. The only thing you "build" for Ollama is pulling the models themselves with `ollama pull`.

## TL;DR

```bash
# 1. Install Ollama (if not already)
curl -fsSL https://ollama.com/install.sh | sh

# 2. Pull the two required models (~6 GB total — this is the only "build" step)
ollama pull qwen3:latest           # chat / tool-calling (~5.2 GB)
ollama pull mxbai-embed-large      # KB embeddings (~670 MB)

# 3. Point Arbor at your Ollama server
# Edit .env (or configure via the web UI at Settings > AI Configuration):
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen3:latest
EMBEDDING_MODEL_OLLAMA=mxbai-embed-large

# 4. Restart Arbor — RESTART only, not rebuild
docker compose restart backend
# or, if running locally: .venv/bin/python -m hr_advisory.api.server
```

That's it. Arbor's advisory queries will now route through your local Ollama.

## Deploying a pre-built Arbor release (no source needed)

Pre-built backend + frontend images are published to Docker Hub on every `v*` tag at `terrenefoundation/arbor-backend:<X.Y.Z>` and `terrenefoundation/arbor-frontend:<X.Y.Z>` (multi-arch — `linux/amd64` + `linux/arm64`). Pull them and run them on whatever orchestrator suits your infra.

The Foundation's reference deploy is Kubernetes — see `deploy/deployment-config.md` for the manifest layout, namespace conventions, ingress wiring, and the in-cluster `arbor-jumper` rollout pattern. If you want a single-host docker-run pattern, you'll need to assemble compose / systemd / equivalent yourself; arbor does not ship a docker-compose stack.

The images themselves are runtime-complete: backend exposes `:8000` (FastAPI), frontend exposes `:3000` (Next.js standalone). Both expect the env-var surface documented in `deploy/deployment-config.md` § Environment Variables — `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET_KEY`, `LLM_KEY_ENCRYPTION_KEY`, plus the optional Ollama / BYOK / integration vars.

**This path never invokes a build command.** Pull the images, wire env, run.

## Why two models?

Arbor's advisory engine does two separate things that each need an LLM:

1. **Chat + tool use** — the main Delegate agent reasons about HR queries and invokes tools (`search_kb`, `calculate_cpf`, `calculate_leave`, etc.) to compose answers. This needs a tool-capable model.

2. **Knowledge base embeddings** — semantic search over Singapore employment law provisions (Employment Act, CPF Act, TAFEP guidelines). Every query gets embedded and matched against ~3,000 pre-embedded provisions. This needs a 1024-dim embedding model.

You cannot share a single model for both. Arbor ships with a hard validation that `mxbai-embed-large` (1024-dim) is the Ollama embedding model — using anything else raises a clear error at query time.

## Choosing the chat model

Any model in the tool-capable allowlist works. Current families:

| Family            | Recommended variant | Size   | Notes                                              |
| ----------------- | ------------------- | ------ | -------------------------------------------------- |
| `qwen3`           | `qwen3:latest`      | 5.2 GB | **Default.** Fast, clean output, aggressive KB use |
| `qwen2.5`         | `qwen2.5:32b`       | 20 GB  | Older generation, still solid                      |
| `qwq`             | `qwq:32b`           | 19 GB  | Reasoning model — emits `<think>` blocks, slow     |
| `llama3.1`        | `llama3.1:8b`       | 4.7 GB | Canonical small option                             |
| `llama3.2`        | `llama3.2:3b`       | 2 GB   | Tiny; OK for low-resource setups                   |
| `mistral-nemo`    | `mistral-nemo:12b`  | 7 GB   | Alternative                                        |
| `firefunction-v2` | —                   | —      | Tool-use specialist                                |
| `command-r`       | `command-r:35b`     | 20 GB  | Cohere Command R                                   |

**Anything not in this list is rejected at save time** with an inline error naming the allowed families. Arbor refuses at server boot if `OLLAMA_MODEL` is set to a non-tool-capable value — this prevents the class of bug where the model silently ignores tool calls and hallucinates HR advice.

### Performance (reference)

Measured with `scripts/compare_qwen_vs_openai.py` on 6 representative HR queries:

| Provider     | Median latency | Tool calls | Notes                                      |
| ------------ | -------------- | ---------- | ------------------------------------------ |
| OpenAI gpt-5 | ~5 s           | Selective  | Fastest, most precise on numeric specifics |
| qwen3:latest | ~16 s          | Aggressive | **Recommended default for local/air-gap**  |
| qwq:32b      | ~60-90 s       | Aggressive | Reasoning chain visible, slower            |

Accept ~3x latency vs OpenAI as the cost of local inference. For high-throughput production, stay on OpenAI.

## Where to configure

Arbor supports Ollama in three places, in order of precedence (highest wins):

### 1. Per-user BYOK (web UI)

`Settings > AI Configuration > Personal Configuration > Configure Ollama Endpoint`

Enter:

- Base URL (e.g. `http://localhost:11434` for local, or `http://your-dgx:11434` for remote)
- Model (e.g. `qwen3:latest`) — **required field**, no auto-detect

Click **Test & Save**. Arbor validates:

- Server is reachable
- Model is in the tool-capable allowlist
- Model is actually pulled on the server (`/api/tags` check)
- Only then encrypts and saves the config

This config only affects queries from your user account.

### 2. Per-company BYOK (admin web UI)

`Settings > AI Configuration > Company Configuration > Configure Ollama Endpoint`

Same form, same validation. Applies to every user in the company who hasn't set a personal config.

### 3. Server default (`.env`)

Used as the fallback when no company or user BYOK is configured:

```bash
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen3:latest
EMBEDDING_MODEL_OLLAMA=mxbai-embed-large     # default; can be overridden
EMBEDDING_DIMENSIONS=1024                    # leave at 1024; must match embed model
```

At server boot, Arbor validates `OLLAMA_MODEL` against the tool-capable allowlist. **Booting with a non-tool-capable model is refused** — the service won't start, and the error message names the allowed families. This is a hard invariant from Arbor's safety chain: non-tool-capable models silently return hallucinated advice without calling `search_kb`, which is unacceptable in a regulated domain.

## Running Ollama somewhere else (remote / DGX)

You don't have to run Ollama on the same host as Arbor. Common patterns:

- **Local dev:** `http://localhost:11434` (default Ollama install)
- **Remote DGX / GPU server:** `http://your-gpu-host:11434` — make sure Ollama is started with `OLLAMA_HOST=0.0.0.0` so it binds all interfaces, and that the port is reachable from the Arbor host.
- **Docker Compose sidecar:** add an `ollama` service to `docker-compose.yml` and point `OLLAMA_BASE_URL` at `http://ollama:11434`.

Arbor validates the base URL against a cloud-metadata blocklist (169.254.169.254, metadata.google.internal, etc.) to prevent SSRF. Private LAN addresses, loopback, and normal DNS hostnames are allowed.

## Air-gap deployment checklist

For a fully offline Arbor instance (no internet access):

1. ✅ Ollama running with `qwen3:latest` + `mxbai-embed-large` pulled
2. ✅ `.env` has `OPENAI_API_KEY=""` (empty) or just omit it
3. ✅ `.env` has `OLLAMA_BASE_URL=http://localhost:11434` (or your LAN address)
4. ✅ `.env` has `OLLAMA_MODEL=qwen3:latest`
5. ✅ `.env` has `EMBEDDING_MODEL_OLLAMA=mxbai-embed-large`
6. ✅ Knowledge base already seeded (DataFlow migration run once) — the KB seed is bundled in the Docker image, so first-run is offline-safe
7. ✅ At first query, watch the logs: you should see `Delegate LLM: adapter=OllamaStreamAdapter, model=qwen3:latest`

If the logs say `adapter=env-fallback` instead of `OllamaStreamAdapter`, you're hitting the legacy path — your `.env` or BYOK config isn't being picked up. Check for typos in the env var names.

## Troubleshooting

### "No LLM provider configured" at server startup

You have neither `OPENAI_API_KEY` nor `OLLAMA_MODEL + OLLAMA_BASE_URL` set. Add one.

### "OLLAMA_MODEL=... is not tool-capable"

Your configured chat model isn't in the allowlist. Change to one of the families listed above. Common mistakes:

- `phi3` — not tool-capable
- `bakllava` — vision model, not tool-capable
- `llama2:7b` — too old, doesn't support tool calls
- `gemma` / `gemma2` — not in the allowlist (pending kaizen-agents support)

### "Expected 1024-dim embedding from mxbai-embed-large, got 768"

You're using a different embedding model (like `nomic-embed-text` which returns 768-dim). Either:

- Pull the correct model: `ollama pull mxbai-embed-large`
- Or set `EMBEDDING_MODEL_OLLAMA` to a 1024-dim model from the embedding allowlist

### "Cannot reach Ollama at http://..."

Ollama isn't running, or the URL in `OLLAMA_BASE_URL` is wrong, or a firewall is blocking the port. Quick checks:

```bash
# Is Ollama running?
curl -sf http://localhost:11434/api/tags | jq '.models[].name'

# Is your Ollama binding all interfaces (for remote access)?
OLLAMA_HOST=0.0.0.0 ollama serve
```

### KB search returns no results

`mxbai-embed-large` isn't pulled, OR the KB hasn't been seeded. Check:

```bash
ollama list                                     # should show mxbai-embed-large
docker exec arbor-backend python -c "           # should return >0
  from hr_advisory.kb.admin import count_provisions
  print(count_provisions())
"
```

### "Ollama returned status 400: Value looks like object..."

This is the kaizen-agents M4 bug ([kailash-py#361](https://github.com/terrene-foundation/kailash-py/issues/361)) — tool-call arguments sent as string instead of object on multi-turn requests. Arbor ships a runtime patch that fixes it; if you see this error, verify the patch is loaded:

```python
import kaizen_agents.delegate.adapters.ollama_adapter as m
print(getattr(m, "_arbor_m4_patched", False))  # should be True
```

If `False`, the patch module (`src/hr_advisory/delegate/_kaizen_patches.py`) wasn't imported. It's imported automatically by `arbor_loop.py` — if you're bypassing that module, import it directly.

### qwq emits `<think>` blocks in responses

qwq is a reasoning model; it emits its chain-of-thought between `<think>` and `</think>` tags before the answer. This is expected behavior. If you want clean output, switch to `qwen3:latest` which doesn't emit `<think>` blocks.

## Comparing Ollama vs OpenAI side-by-side

Arbor ships a comparison script that runs the same queries through both providers:

```bash
DATABASE_URL=sqlite:///:memory: \
  .venv/bin/python scripts/compare_qwen_vs_openai.py --qwen-model qwen3:latest
```

Sends 6 representative HR queries through `run_delegate_sync` with both providers and prints a side-by-side comparison. Useful for:

- Calibrating latency expectations before a deploy decision
- Sanity-checking a new Ollama model before adding it to the allowlist
- Regression-checking after kaizen-agents version bumps

## See also

- `docs/setup.md` — general Arbor setup
- `docs/migrations/embedding-1024.md` — vector dimension migration runbook
- `src/hr_advisory/delegate/_kaizen_patches.py` — M4 patch source
- `src/hr_advisory/services/llm_config.py` — `OLLAMA_TOOL_CAPABLE_FAMILIES` allowlist
- `workspaces/hr-ai-advisory/04-validate/round-16-live-ollama-redteam.md` — live testing report
