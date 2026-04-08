# Ollama Provider — Current State

**Date:** 2026-04-08
**Scope:** What already exists for Ollama support in Arbor, before any changes.

## What the user asked for

> "We need an Ollama provider attached to this. Users should be able to define the model name."

Two requirements:

1. Ollama must be a functional, selectable advisory LLM provider
2. Users (company admins + individuals) must be able to define the model name

## What already exists — scaffolding is ~80% in place

The team built most of an Ollama path as part of the BYOK work (M13, `13-byok-api-keys`), but nobody has ever run a real advisory query through it end-to-end. The scaffolding is unexercised.

### 1. Backend — data layer

**DataFlow models** (`src/hr_advisory/models/company_user.py`):

- `CompanyLLMConfig` — `provider`, `encrypted_key`, `model_pref`, `base_url`, `is_active`, `status`
- `UserLLMConfig` — same fields, scoped to `user_id + company_id`

**Encryption** (`src/hr_advisory/security/llm_encryption.py`): Fernet wrapper, key from `LLM_ENCRYPTION_KEY` env.

### 2. Backend — service layer

**`services/llm_config.py`**:

- `VALID_PROVIDERS = {"openai", "anthropic", "gemini", "deepseek", "mistral", "ollama", "custom"}`
- `save_llm_config` / `save_user_llm_config` — upsert with soft-delete of previous
- `get_active_llm_config` — resolution order `user → company → None`
- `build_llm_context(company_id, user_id)` — returns an `LLMKeyContext`, handles Ollama via `LLMKeyContext.for_ollama(base_url, model, company_id)`

**`services/ollama_health.py`**:

- `check_ollama_health(base_url, model, timeout)` — hits `/api/tags`, returns reachability + model list + match flag.

**`agents/llm_context.py`**:

- Immutable `LLMKeyContext` dataclass with `api_key`, `provider`, `model`, `base_url`, `is_byok`, `company_id`.
- Factory `LLMKeyContext.for_ollama(base_url, model, company_id)` sets `provider="ollama"`.
- Factory `LLMKeyContext.from_server_env()` reads `ollama_model` / `ollama_base_url` from settings as a last-resort fallback.

**`config/settings.py`** (lines 45-46, 118-119):

- `ollama_model: str = ""` (from `OLLAMA_MODEL` env)
- `ollama_base_url: str = "http://localhost:11434"` (from `OLLAMA_BASE_URL` env)

### 3. Backend — API routes

**`api/routers/llm_config.py`** (810 lines):

- `POST /companies/{id}/llm-config` — save BYOK / Ollama config
- `GET /companies/{id}/llm-config` — fetch (masked)
- `DELETE /companies/{id}/llm-config` — revoke
- `POST /companies/{id}/llm-config/validate` — dispatch to `_validate_ollama` (hits `/api/tags`) or `_validate_cloud_provider`
- `GET /companies/{id}/llm-usage` — budget status
- `PUT /companies/{id}/llm-budget` — adjust monthly cap
- User-level: `GET/POST/DELETE /users/me/llm-config`

Ollama-specific save path:

- `base_url` is validated (non-empty, http/https, SSRF allowlist blocks metadata endpoints but allows private IPs — correct for institution DGX servers)
- No API key required for Ollama
- `model_pref` is **optional** ← problem (see gap analysis)

### 4. Backend — advisory integration (where it fails)

**`api/routers/advisory.py`**:

- Line 316: `build_llm_context(company_id, user_id)` — correctly resolves Ollama context per-request
- Lines 373-380 (`/advisory/query`) and 748-759 (stream): constructs `DelegateConfig` with `model`, `api_key`, `base_url` — but **not** `provider`
- Passes config into `run_delegate_sync(...)` / `create_delegate(...)`

**`delegate/arbor_loop.py`** — the seam where everything breaks:

- `DelegateConfig` has no `provider` field
- `_resolve_llm_settings()` reads env vars (`LLM_MODEL`, `OPENAI_BASE_URL`, etc.) as a fallback chain — legacy from pre-BYOK days
- Line 95-98:
  ```python
  if base_url:
      os.environ.setdefault("OPENAI_BASE_URL", base_url)
  if api_key and api_key != "not-needed":
      os.environ.setdefault("OPENAI_API_KEY", api_key)
  ```
  Tries to coerce Ollama through the OpenAI adapter by mutating process-global env. Three bugs here (see gap analysis).
- Always instantiates `Delegate(model=..., tools=..., system_prompt=...)` with default adapter resolution → OpenAI adapter.

### 5. Upstream — kaizen-agents already has a native Ollama adapter

**`kaizen_agents/delegate/adapters/ollama_adapter.py`** (on pyenv, site-packages):

- `OllamaStreamAdapter(base_url, default_model, default_temperature, default_max_tokens)`
- Hits `{base_url}/api/chat` (native Ollama API, not OpenAI-compatible `/v1/chat/completions`)
- Supports streaming, tool calls, system messages
- Returns the same `ChatChunk`/`ToolCallStart` event types as the OpenAI adapter

**`kaizen_agents/delegate/adapters/registry.py`**:

- `get_adapter(provider="ollama", model=..., base_url=...)` → returns `OllamaStreamAdapter`
- `_MODEL_PREFIX_MAP = [("claude-", "anthropic"), ("gemini-", "google")]` — no Ollama prefix detection; provider must be passed explicitly (comment in registry confirms this)

**`Delegate.__init__`** accepts:

- `adapter: StreamingChatAdapter | None = None` — a pre-built adapter that overrides provider resolution
- If `adapter` is passed, no env var lookup happens in the Delegate layer.

**This is the intended seam**: build the adapter per-request and pass it in. Arbor is not currently using it.

### 6. Frontend web — settings UI exists

**`apps/web/src/app/(dashboard)/settings/ai/page.tsx`**:

- `PROVIDERS` list includes `{ value: "ollama", label: "Ollama / Local AI", keyRequired: false }`
- Two-form flow: BYOK cloud providers OR Ollama endpoint
- Ollama form (lines 593-688):
  - `baseUrl` input — placeholder `http://localhost:11434`
  - `modelPref` input — placeholder `llama3.1:70b`, label says **"(optional — auto-detected if empty)"** ← problem, see gap analysis
- `handleSave()` — validates via `/llm-config/validate` before save
- Current Status panel renders Ollama config with endpoint + model

**`apps/web/src/services/api/llm-config.ts`**: typed client for the endpoints above.

### 7. Frontend mobile — nothing

`apps/mobile/lib/features/settings/` has no LLM config screen. No Ollama references anywhere in `apps/mobile/lib`. Mobile users cannot configure BYOK or Ollama at all.

## Existing analyses to respect

- `01-analysis/13-byok-api-keys/` — the BYOK work that laid the scaffolding. Option A (config-level override) was chosen but only partially implemented for the Ollama adapter seam.
- `01-analysis/16-engines-vs-primitives/` — reinforces "use Delegate engine, not raw LLM calls".
- `memory/project_byok_decision.md` — "Default gpt-5-mini with $5/month cap, BYOK for gpt-5-chat-latest, Ollama/DGX for local."

## Summary

Scaffolding exists for: DB models, encryption, services, API routes, validation endpoint, web settings UI, resolution of `LLMKeyContext` per request, and even the correct upstream Ollama adapter in kaizen-agents. **Nothing wires the adapter into the Delegate run path.** The only Ollama "integration" today is a process-level env var hack that is bug-ridden, insecure under concurrency, and never actually reaches the Ollama adapter — it still calls OpenAI, just with a wrong base URL.
