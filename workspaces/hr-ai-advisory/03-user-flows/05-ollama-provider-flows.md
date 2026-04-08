# User Flows — Ollama Provider

**Date:** 2026-04-08
**Related:** `01-analysis/17-ollama-provider/`, `02-plans/06-ollama-provider-plan.md`, `03-user-flows/04-byok-api-key-flows.md`

Supersedes the Ollama portions of `04-byok-api-key-flows.md` with the tool-capability gate and the end-to-end verification added.

## Personas

- **Siti** — Owner of a 25-person marketing agency. Has a $40/month Ollama server on a local NUC to avoid per-query API costs. Not technical; needs to paste a URL and a model name without reading docs.
- **Dr. Tan** — HR director at a 300-person institution with an on-prem NVIDIA DGX. Security policy forbids cloud LLMs. Tool-savvy; will read help text but expects sensible defaults.
- **Claude** — Arbor platform admin. Needs to debug why advisory queries fail for a specific company.

## Flow 1 — Siti configures Ollama for the first time

**Entry:** Siti sees "You're on the free tier (GPT-5 mini)" banner in the advisory chat and clicks "Upgrade or connect local AI".

1. Lands on `/settings/ai`. Current Status shows "Free tier" with usage bar.
2. Two cards appear: "Use your own API key" and "Connect to a local AI service".
3. Clicks "Configure Endpoint" on the local AI card.
4. Ollama form opens:
   - **Endpoint URL** (required): placeholder `http://localhost:11434`
   - **Model** (required, no longer "optional"): help text reads "Choose a tool-capable model: `llama3.1`, `llama3.2`, `qwen2.5`, `mistral-nemo`, `firefunction-v2`, `command-r`. Tag variants like `llama3.1:70b` are supported."
5. Siti enters `http://192.168.1.42:11434` and `llama3.1:8b`.
6. Clicks "Test & Save".
7. Frontend calls `POST /llm-config/validate` with the provider, base_url, and model. Backend:
   a. Hits `http://192.168.1.42:11434/api/tags` — reachable, 3 models available.
   b. Verifies `llama3.1:8b` is present in the tags list.
   c. Returns `valid=true, message="Ollama endpoint is reachable. 3 model(s) available. llama3.1:8b is installed."`
8. Frontend calls `POST /companies/{id}/llm-config` to save. Backend enforces:
   - `model_pref` is required for Ollama → passes
   - `llama3.1` is in `OLLAMA_TOOL_CAPABLE_FAMILIES` → passes
9. Save succeeds. UI updates Current Status to show "Ollama / Local AI (your key)", endpoint, model `llama3.1:8b`, status Active.
10. Toast: "Local AI service connected."

**Next:** Siti navigates to the advisory chat and asks "How many days of paternity leave am I entitled to?"

## Flow 2 — Advisory query under Ollama (success)

Siti asks the question in the chat. Stream flows:

1. Frontend POSTs `/advisory/query` with the question.
2. Backend middleware: auth, tenant check, scope classifier (now also on Delegate → inherits Ollama via context).
3. `build_llm_context(company_id)` returns `LLMKeyContext(provider="ollama", model="llama3.1:8b", base_url="http://192.168.1.42:11434")`.
4. `build_adapter_from_context(ctx)` returns an `OllamaStreamAdapter` pointed at Siti's server.
5. `DelegateConfig(adapter=adapter, company_id=..., company_context=...)` → `create_delegate()` forwards the adapter to `Delegate(adapter=...)`.
6. Delegate streams tokens from Ollama's `/api/chat`:
   a. LLM reasons → emits a `tool_call` for `search_kb("paternity leave Singapore 2026")`.
   b. `search_kb` runs against Arbor's KB (still using OpenAI embeddings for now — Phase 7 fail-fast guard ensures this is configured).
   c. KB returns CDCSA 2025 amendment + ECA §77 provisions.
   d. LLM reasons → emits response text with citation markers.
7. Stream finishes. Response shows "28 days (4 weeks) as of 1 Jan 2025 under the CDCSA amendment" with the correct citation.
8. `log_llm_call(provider="ollama", model="llama3.1:8b", cost_usd=0.0, ...)` records the call with zero cost.
9. Siti sees the response with a green risk tier, high confidence, and a citation link.

**Verification gates hit:**

- `tools_called` includes `search_kb` → advisory is grounded, not hallucinated
- `cost_usd == 0.0` → budget not consumed; usage bar shows no change
- Response has citations → not degraded

## Flow 3 — Siti types a non-tool-capable model (rejected at save)

Alternate path from Flow 1, step 5. Siti read a blog and types `phi3:14b` (non-tool-capable).

1. Clicks "Test & Save".
2. Frontend calls `POST /llm-config/validate` → backend hits `/api/tags` → returns `valid=true` reachability + model list.
3. Frontend calls `POST /companies/{id}/llm-config`. Backend runs `validate_ollama_model("phi3:14b")`:
   - `.split(":")[0] == "phi3"` → not in `OLLAMA_TOOL_CAPABLE_FAMILIES`
   - Returns 400: `"'phi3' does not support tool calls. Arbor's advisory engine requires tool-capable models. Supported families: llama3.1, llama3.2, qwen2.5, mistral-nemo, firefunction-v2, command-r. Pick one from this list."`
4. Frontend shows the error inline under the Model field.
5. Siti swaps to `llama3.1:8b` and succeeds (Flow 1).

## Flow 4 — Dr. Tan configures DGX, model isn't pulled

1. Dr. Tan enters `http://dgx.institution.edu:11434` and `llama3.1:70b`.
2. Validate call: hits `/api/tags` → server only has `llama3.1:8b` installed.
3. Backend: `llama3.1:70b` is not in the tags response. Returns `valid=false, message="Model 'llama3.1:70b' is not installed on this Ollama server. Available models: llama3.1:8b, qwen2.5:32b, mistral-nemo. Install it with 'ollama pull llama3.1:70b' on the server."`
4. Frontend shows inline error with the actionable message.
5. Dr. Tan either pulls the model on the DGX or picks from the listed models. Retries → success.

## Flow 5 — Concurrent multi-tenant safety (regression test for C1)

Test-only flow; not user-visible. Verifies that bug C1 is fixed.

1. Two companies hit `/advisory/query` simultaneously:
   - Company A: BYOK Ollama `http://a.example:11434` / `llama3.1:8b`
   - Company B: server-default OpenAI `gpt-5-chat-latest`
2. Each request goes through `build_llm_context` independently.
3. Each gets its own `OllamaStreamAdapter` or `OpenAIStreamAdapter` instance — per-request, not env-var-based.
4. No shared state. Company B's `OPENAI_API_KEY` is read from `settings.openai_api_key`, never from `os.environ` after mutation.
5. Both responses complete. Test asserts:
   - Company A's response tools-called include only Ollama-served tools
   - Company B's response comes from `api.openai.com` (verified via test fixture)
   - `os.environ["OPENAI_BASE_URL"]` (if it was set before the test) is unchanged
   - `os.environ["OPENAI_API_KEY"]` is unchanged

## Flow 6 — Claude (platform admin) debugs a failing Ollama query

1. Customer reports "Advisory queries are failing for us". Claude opens the admin dashboard.
2. Checks recent `log_llm_call` entries for that company — sees `provider="ollama"`, `error="connection refused"`.
3. Opens `/settings/ai` (as an impersonated admin or via the platform admin tools).
4. Clicks "Validate" on the stored config — the validate endpoint hits the customer's Ollama server.
5. Returns: `valid=false, message="Cannot connect to Ollama endpoint. Is Ollama running?"`
6. Claude reaches out to the customer: "Your Ollama server at `http://10.0.1.5:11434` is not responding. Please check that the Ollama service is running."
7. Customer restarts Ollama. Claude re-runs validate → `valid=true`. Queries resume.

## Edge cases handled

- **User leaves model blank (web form)**: HTML5 `required` prevents submit; if bypassed, server returns 400.
- **User types a tagged variant (`llama3.1:70b-instruct-q4_K_M`)**: allowlist matches on the family prefix (`llama3.1`) so any tag works.
- **User types a completely unknown model**: allowlist rejects with actionable message.
- **Ollama server returns HTTP 500**: adapter emits `ErrorEvent`, UI shows "Ollama server returned an error. Please check your Ollama server logs."
- **Ollama server is slow (>60s)**: advisory timeout at 60s (existing), UI shows "Advisory is taking longer than expected. Your Ollama model may be too large for the hardware."
- **Company admin deletes the config while a stream is in flight**: stream completes with the in-flight adapter; next query uses the new config.
- **Embeddings fail because no OPENAI_API_KEY**: `search_kb` tool fails fast with the actionable message; UI shows "Knowledge base is temporarily unavailable. Contact your administrator."

## Deferred flows (future work)

- **Full Ollama embeddings**: ingest and search KB entirely via `nomic-embed-text` on Ollama, zero OpenAI dependency. Requires KB pipeline rework.
- **Ollama on mobile**: Flutter BYOK/Ollama settings screen. Not in current brief.
- **Model warmup ping**: optimistic ping of the Ollama server on save to trigger model load, avoiding cold-start latency on the first advisory query.
- **Model-capability auto-detection**: use Ollama's `/api/show` to read model metadata and check for tool support dynamically instead of the static allowlist.
