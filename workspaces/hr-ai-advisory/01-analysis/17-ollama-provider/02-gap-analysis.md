# Ollama Provider — Gap Analysis

**Date:** 2026-04-08
**Context:** See `01-current-state.md` for what exists.

This document enumerates every bug blocking end-to-end Ollama. Ranked by severity. File paths and line numbers are included for every item.

## Severity legend

- **CRITICAL** — security, data leak, or silent correctness failure
- **HIGH** — Ollama path is unusable or produces wrong results
- **MEDIUM** — wrong telemetry, wrong billing, bad error messages
- **LOW** — papercuts, deferred scope

---

## CRITICAL

### C1 — Multi-tenant data leak via `os.environ` mutation

**Where:** `src/hr_advisory/delegate/arbor_loop.py:94-98`

```python
if base_url:
    os.environ.setdefault("OPENAI_BASE_URL", base_url)
if api_key and api_key != "not-needed":
    os.environ.setdefault("OPENAI_API_KEY", api_key)
```

**Impact:** `os.environ` is process-global. On a multi-company FastAPI server running under `AsyncLocalRuntime`, the FIRST request into the process "wins" and poisons the env for every subsequent request across every tenant. Concrete attack:

1. Company A sets a BYOK config pointing to `http://attacker.example:11434` (Ollama "server")
2. First advisory request from Company A sets `OPENAI_BASE_URL=http://attacker.example:11434` in the process env
3. Company B (with a real OpenAI key in the server `.env`) makes its next advisory request
4. `setdefault` is a no-op because the key already exists, BUT Company B's OpenAI adapter reads the poisoned `OPENAI_BASE_URL` — and sends Company B's OpenAI API key as a bearer token to Company A's attacker-controlled endpoint
5. Company B's key is now stolen

This is a critical security bug even setting aside Ollama. It exists today.

**Fix direction:** Delete the env-var mutation entirely. Build a per-request adapter and pass `adapter=...` to the `Delegate` constructor. See `03-red-team-findings.md` bug 2 for corroboration.

### C2 — Silent correctness failure: non-tool-capable Ollama models

**Where:** `kaizen_agents/delegate/adapters/ollama_adapter.py:96-97` (upstream) + absence of validation in `src/hr_advisory/api/routers/llm_config.py`

**Impact:** Ollama forwards a `tools` field to the model unconditionally. Only these Ollama models actually honor tool calls:

- `llama3.1`, `llama3.2` (and derivatives)
- `qwen2.5`
- `mistral-nemo`
- `firefunction-v2`
- `command-r`, `command-r-plus`

**Everything else** (`llama2`, `phi3`, `gemma2`, `codellama`, `mistral-7b`, etc.) silently ignores the `tools` field and returns plain-text chat. For Arbor this means:

- The advisory engine never calls `search_kb` → the legal knowledge base is never consulted
- The engine never calls `calculate_cpf` / `calculate_leave` → calculations are hallucinated
- `tools_called` is empty → `degraded=False` because there's text in the response
- User receives confident, cited-free, wrong employment law advice in a regulated domain

This is worse than a 500 error. It's advisory malpractice. In a Singapore HR advisory product, a hallucinated CPF calculation or a wrong retrenchment rule could expose the customer to MOM enforcement.

**Fix direction:** Maintain a server-side allowlist of tool-capable Ollama model families. Reject saves that don't match. Document the allowlist in the UI help text.

### C3 — Legacy `AdvisoryEngine` still live, hardcoded to OpenAI

**Where:**

- `src/hr_advisory/agents/advisory_engine.py:649, 808` — `from openai import OpenAI`
- `src/hr_advisory/api/platform.py:200, 225` — instantiates `AdvisoryEngine` (active HTTP endpoint)
- `src/hr_advisory/quality/adversarial_runner.py:380, 382` — red-team baseline
- `src/hr_advisory/delegate/tools.py:175` — indirect import

**Impact:** Despite a `DeprecationWarning` comment, `AdvisoryEngine` is still reachable via `platform.py`'s HTTP route. An Ollama-only company hitting that route gets a 500 as `openai.OpenAI()` tries to authenticate against `api.openai.com` with no key or a wrong key.

Leaving deprecated-but-live code is a `rules/zero-tolerance.md` Rule 2 violation (no stubs / deferred implementation) and Rule 6 violation (implement fully).

**Fix direction:** Delete `advisory_engine.py` entirely in the same PR. Migrate the 4 call sites to `run_delegate_sync`. If `/advisory/autonomous` is not used by any frontend, delete the endpoint with the engine.

### C4 — Empty Ollama model silently falls through to cloud defaults

**Where:** `src/hr_advisory/delegate/arbor_loop.py:56-62` + `apps/web/src/app/(dashboard)/settings/ai/page.tsx:633-636` ("(optional — auto-detected if empty)")

```python
model = (
    config.model
    or os.environ.get("LLM_MODEL")
    or os.environ.get("DEFAULT_LLM_MODEL")
    or os.environ.get("OPENAI_PROD_MODEL")
    or ""
)
```

**Impact:** The UI presents the Ollama model as optional with "auto-detected" placeholder text. Auto-detection doesn't exist. Empty model falls through the env chain to `OPENAI_PROD_MODEL="gpt-5-chat-latest"`. Ollama `/api/chat` returns 404 `model 'gpt-5-chat-latest' not found`. User sees a cryptic connection error with no clue.

**Fix direction:**

- Save endpoint (`api/routers/llm_config.py:174`): require `model_pref` for `provider in ("ollama", "custom")`
- UI copy: remove "auto-detected if empty"; make it a required field with the allowlist as a dropdown or explicit example list
- Delete the cloud-model fallback from `_resolve_llm_settings` when provider is Ollama

---

## HIGH

### H1 — `DelegateConfig` has no `provider` field; `provider` is dropped

**Where:**

- `src/hr_advisory/delegate/arbor_loop.py:36-48` — `DelegateConfig` dataclass
- `src/hr_advisory/api/routers/advisory.py:373-380, 748-759` — both places where `DelegateConfig` is built from `llm_context`

**Impact:** `LLMKeyContext.provider` is the only signal Arbor has that a request wants Ollama. Neither advisory.py call site copies it into `DelegateConfig`, and `DelegateConfig` has no field for it anyway. By the time `create_delegate()` runs, the provider information is gone — there is no way for arbor_loop to know it should build an `OllamaStreamAdapter` instead of the default OpenAI adapter.

**Fix direction:** Replace the env-var-mutation approach with an `adapter: StreamingChatAdapter | None = None` field on `DelegateConfig`. Construct the adapter in `advisory.py` (or a small helper in `services/llm_config.py`) using `kaizen_agents.delegate.adapters.get_adapter(provider, model, api_key, base_url)`, pass into `DelegateConfig(adapter=...)`, forward as `Delegate(adapter=...)`.

### H2 — Validation endpoint doesn't verify the model is actually pulled

**Where:** `src/hr_advisory/api/routers/llm_config.py:397-437` (`_validate_ollama`)

**Impact:** Validator hits `/api/tags`, returns the list of installed models, but does not check that `model_pref` is in the list. User saves `llama3.1:70b` but the server only has `llama3.1:8b` pulled → save succeeds → first advisory query fails at runtime with a confusing error.

**Fix direction:** When validating Ollama with a `model_pref` in the body, assert `model_pref.split(":")[0]` matches at least one model in the tags response. Return a helpful error naming the available models.

### H3 — KB embeddings path not Ollama-aware

**Where:** `src/hr_advisory/kb/embeddings.py:79-82`

```python
client = openai.OpenAI(api_key=api_key)
response = client.embeddings.create(
    input=text,
    model=self.model,
)
```

**Impact:** `openai.OpenAI()` is unconditional. No `base_url` override. For an Ollama-only deployment:

- If the server has no `OPENAI_API_KEY`: the embedding call raises, KB search is broken, semantic retrieval is dead, the advisory engine loses its grounding entirely.
- If the server does have `OPENAI_API_KEY`: embeddings leak to `api.openai.com` even though the company intended to be fully air-gapped on Ollama.

**Fix direction (minimum viable):** Fail-fast with an actionable error if `OPENAI_API_KEY` is missing and an embedding is requested. Do NOT return `None` silently — that's `rules/zero-tolerance.md` Rule 3 (no silent fallbacks).

**Fix direction (longer term, deferred):** Add a dedicated Ollama embedding path using `nomic-embed-text` via `/api/embeddings`. Not in scope for this PR.

---

## MEDIUM

### M1 — Non-BYOK Ollama users billed at GPT-4o fallback rates

**Where:** `src/hr_advisory/services/llm_budget.py:35-62, 143-152`

```python
MODEL_PRICING = {
    ...
    "ollama": (0.0, 0.0),  # ← dead code; never matched
    ...
}
_FALLBACK_PRICING = (2.50, 10.00)
```

`_estimate_cost(model, ...)` keys on the model name (e.g. `"llama3.1:70b"`), which is NOT in `MODEL_PRICING` → falls through to `_FALLBACK_PRICING` → bills the company $2.50/M input + $10/M output for free local inference.

Two layers of fallout:

1. Non-BYOK server-default Ollama users (when server has no OpenAI key and `LLMKeyContext.from_server_env()` returns an Ollama context with `is_byok=False`) get billed.
2. `advisory.py:517-526` logs Ollama calls to audit with GPT-4o-equivalent cost, corrupting compliance reports.

BYOK Ollama users are NOT billed because `advisory.py:506` already skips `record_usage` when `is_byok=True`.

**Fix direction:** Make cost estimation provider-aware: `_estimate_cost(model, provider="ollama")` returns `0.0`. Thread `provider` through `record_usage`. Remove the dead `"ollama"` key from `MODEL_PRICING` since it's not keyed by provider.

### M2 — `LLMKeyContext.from_server_env()` can return an empty-model Ollama context

**Where:** `src/hr_advisory/agents/llm_context.py:94-100`

```python
if settings.openai_api_key:
    return cls(api_key=..., provider="openai", model=..., ...)
return cls(provider="ollama", model=settings.ollama_model or "", base_url=settings.ollama_base_url, ...)
```

**Impact:** If neither `OPENAI_API_KEY` nor `OLLAMA_MODEL` is set, the server returns `provider="ollama", model=""`. Arbor boots successfully, every advisory query returns a cryptic error. No fail-fast at startup. This is C4 at the server-default level.

**Fix direction:** Fail-fast at app startup: if no OpenAI key AND no Ollama model, refuse to start with a clear error naming both env vars.

### M3 — Tests will leak real `OPENAI_API_KEY` into Ollama adapter tests

**Where:** `conftest.py` (per `rules/env-models.md`, auto-loads `.env`) + future `tests/unit/delegate/test_ollama_adapter.py`

**Impact:** Any new test for the Ollama path will inherit the real `OPENAI_API_KEY` from `.env`. If the test incorrectly falls back to OpenAI, it will PASS because the key is valid, masking a broken Ollama wiring in CI.

**Fix direction:** Ollama test fixtures must `monkeypatch.delenv("OPENAI_API_KEY", raising=False)` and `monkeypatch.delenv("OPENAI_BASE_URL", raising=False)`.

### M4 — Upstream `OllamaStreamAdapter` tool-call streaming has a state-accumulation bug

**Where:** `.venv/.../kaizen_agents/delegate/adapters/ollama_adapter.py:146-157`

```python
tool_calls.append(tc_dict)  # inside per-line loop
# each line creates a new tc_dict with id = f"call_ollama_{len(tool_calls)}"
```

**Impact:** Ollama streams tool calls across multiple NDJSON lines. Each line creates a new entry instead of accumulating arguments into the existing one. The Delegate receives N duplicate tool calls with partial/empty arguments. Arbor's delegate loop would execute duplicates with broken input.

**Fix direction:** Per `rules/zero-tolerance.md` Rule 4 (no workarounds for SDK bugs) and `rules/cross-sdk-inspection.md` Rule 1 (cross-SDK inspection): file a `kailash-py` issue, also check if `kailash-rs` has the same bug, do NOT patch locally.

### M5 — Delegate internal cost tracking may double-bill Ollama requests

**Where:** `.venv/.../kaizen_agents/delegate/delegate.py:228-236` — `_record_usage` uses its own `_estimate_cost`

**Impact:** Latent. Currently Arbor does not pass `budget_usd` to `DelegateConfig`, so the Delegate's internal budget gate never activates. But the cost is still computed and returned in the `Usage` event. If a future change adds `budget_usd`, Ollama users would see fabricated costs against a budget meant for real cloud billing.

**Fix direction:** Do nothing now. Comment in `arbor_loop.py` to make the decision explicit: "do not pass `budget_usd` for Ollama provider". File upstream issue for provider-aware cost estimation in kaizen-agents.

---

## LOW

### L1 — No mobile BYOK/Ollama UI

**Where:** `apps/mobile/lib/features/settings/screens/` — no `llm_config` / `ollama` references

**Impact:** Flutter mobile users can't configure BYOK or Ollama from their phone. Must use the web app.

**Fix direction:** Defer. The brief does not require mobile parity, and `rules/zero-tolerance.md` Rule 2 warns against doing more than asked. File as a follow-up.

### L2 — `LLMKeyContext.clear_key()` is dead for Ollama contexts

**Where:** `src/hr_advisory/agents/llm_context.py:120-126`

**Impact:** Method unconditionally mutates a frozen dataclass to clear a key that doesn't exist for Ollama contexts. No-op but ugly.

**Fix direction:** Defer. Not blocking.

---

## Gap summary

| #   | Severity | Title                                                   | File                                  |
| --- | -------- | ------------------------------------------------------- | ------------------------------------- |
| C1  | CRITICAL | Multi-tenant data leak via `os.environ` mutation        | `delegate/arbor_loop.py:94-98`        |
| C2  | CRITICAL | Silent wrong-advice on non-tool-capable Ollama models   | `api/routers/llm_config.py` (missing) |
| C3  | CRITICAL | Legacy `AdvisoryEngine` hardcoded to OpenAI, still live | `agents/advisory_engine.py:649,808`   |
| C4  | CRITICAL | Empty Ollama model falls through to cloud defaults      | `delegate/arbor_loop.py:56-62`        |
| H1  | HIGH     | `DelegateConfig` has no `provider` / `adapter` seam     | `delegate/arbor_loop.py:36-48`        |
| H2  | HIGH     | Validation endpoint doesn't verify model is pulled      | `api/routers/llm_config.py:397-437`   |
| H3  | HIGH     | KB embeddings path not Ollama-aware (silent or leaking) | `kb/embeddings.py:79-82`              |
| M1  | MEDIUM   | Non-BYOK Ollama billed at GPT-4o fallback rates         | `services/llm_budget.py:35-152`       |
| M2  | MEDIUM   | `from_server_env()` returns empty-model Ollama context  | `agents/llm_context.py:94-100`        |
| M3  | MEDIUM   | Tests leak real `OPENAI_API_KEY` via `.env` auto-load   | (new tests, TBD)                      |
| M4  | MEDIUM   | Upstream tool-call streaming bug in `ollama_adapter.py` | upstream `kailash-py`                 |
| M5  | MEDIUM   | Delegate internal cost tracker not Ollama-aware         | upstream `kailash-py`                 |
| L1  | LOW      | No mobile BYOK/Ollama UI                                | `apps/mobile/lib/features/settings/`  |
| L2  | LOW      | Dead `clear_key()` on Ollama contexts                   | `agents/llm_context.py:120-126`       |

**Minimum viable scope** (must-fix for this PR): C1, C2, C3, C4, H1, H2, H3, M1, M2.
**Upstream** (file issues, do not patch locally): M4, M5.
**Defer** (post-PR follow-ups): L1, L2; full Ollama embeddings path.
