# Ollama Provider — Red Team Findings

**Date:** 2026-04-08
**Reviewer:** analyst agent (red team round 1)
**Scope:** Stress-tested the `02-gap-analysis.md` findings against the code, looking for blind spots, missed bugs, and fix-direction errors.

This document captures the red team's verdict in full. Bugs labeled `Cn`, `Hn`, `Mn`, `Ln` are documented in `02-gap-analysis.md`; `An` are new bugs the red team discovered that were NOT in my first pass.

## Confirmation of initial findings

| Finding                                                     | Red team verdict                                                                                                                                                                                                                                                                                                             |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1 — setdefault silently ignores BYOK + poisons process env | **CONFIRMED and UNDERSTATED.** Under FastAPI + AsyncLocalRuntime the first-write-wins semantics of `os.environ.setdefault` create a live multi-tenant data leak: Company A's BYOK base_url poisons the env for Company B, whose OpenAI bearer token is then sent to Company A's endpoint. Security bug, not just a BYOK bug. |
| C2 / tool-capability                                        | **NEW — not in initial pass.** Red team added this one (see A3 below).                                                                                                                                                                                                                                                       |
| C3 — legacy AdvisoryEngine still live                       | **NEW — not in initial pass.** Red team added this one (see A1 below).                                                                                                                                                                                                                                                       |
| C4 — empty Ollama model falls through to OPENAI_PROD_MODEL  | **CONFIRMED.** In Arbor's prod `.env`, the cascade resolves to `gpt-5-chat-latest`, which Ollama rejects with a 404. User sees a cryptic connection error.                                                                                                                                                                   |
| H1 — provider field lost at DelegateConfig boundary         | **CONFIRMED.** Traced through `KzConfig.provider` in `loader.py:134` — defaults to `"openai"` and stays there. `get_adapter_for_model` in `registry.py:151` routes to `OpenAIStreamAdapter` every single time.                                                                                                               |
| H2 — validation doesn't check model is pulled               | **CONFIRMED.** `_validate_ollama` only checks reachability.                                                                                                                                                                                                                                                                  |
| H3 — embeddings path not Ollama-aware                       | **CONFIRMED.** `kb/embeddings.py:79` hardcodes `openai.OpenAI(api_key=api_key)`. No `base_url`. Also no fallback.                                                                                                                                                                                                            |

## Additional bugs found by the red team

### A1 → becomes C3: Legacy `AdvisoryEngine` still reachable, OpenAI-hardcoded

`src/hr_advisory/agents/advisory_engine.py:649,808` uses `from openai import OpenAI` unconditionally. Despite the `DeprecationWarning`, it is still instantiated by:

- `src/hr_advisory/api/platform.py:200,225` — active HTTP endpoint (`/advisory/autonomous` or similar)
- `src/hr_advisory/quality/adversarial_runner.py:380,382` — red-team baseline
- `src/hr_advisory/delegate/tools.py:175` — imports `_search_kb_with_fallback`

**Verdict:** Fix-direction must include deleting `advisory_engine.py` and migrating the 4 call sites. Leaving it is a `zero-tolerance.md` Rule 2 and Rule 6 violation. Promoted to CRITICAL and merged into the gap analysis as C3.

### A2 → becomes M1: Non-BYOK Ollama billed at GPT-4o fallback rate

`services/llm_budget.py:35-62` has `MODEL_PRICING["ollama"] = (0.0, 0.0)` — **dead code**, because `_estimate_cost` at lines 143-152 keys on the actual model name (e.g. `"llama3.1:70b"`), which falls through to `_FALLBACK_PRICING = (2.50, 10.00)`. Every Ollama request is billed at GPT-4o fallback rates.

BYOK Ollama is protected by `advisory.py:506` (`if not llm_context.is_byok: record_usage(...)`). But **non-BYOK** server-default Ollama — triggered when `LLMKeyContext.from_server_env()` returns an Ollama context with `is_byok=False` — is billed at fallback rates and hard-429s the company in ~500k tokens of free local compute. Audit trail (advisory.py:517-526) records Ollama calls with GPT-4o-equivalent cost, corrupting compliance reports.

**Verdict:** Added to gap analysis as M1.

### A3 → becomes C2: Tool-capability is Ollama-model-dependent and undetectable

`ollama_adapter.py:96-97` forwards `tools` to Ollama unconditionally. But only newer Ollama models support the `tools` field:

- Tool-capable: `llama3.1`, `llama3.2`, `qwen2.5`, `mistral-nemo`, `firefunction-v2`, `command-r`, `command-r-plus`
- Tool-DEAD: `llama2`, `phi3`, `gemma2`, `codellama`, `mistral-7b`, `deepseek-coder`, most distilled/quantized variants

Tool-dead models silently ignore the `tools` field and return plain-text chat. Arbor's delegate then has no `tool_calls` to execute. The advisory engine never calls `search_kb`, never hits the legal KB, and returns hallucinated HR advice with no citations. `degraded=False`.

This is **worse than a 500** — it's silent correctness failure in a regulated SG employment law advisory. A hallucinated CPF rule or retrenchment provision could expose the customer to MOM enforcement.

**Verdict:** Promoted to CRITICAL and merged into gap analysis as C2. Fix-direction must include an allowlist and hard reject at save time.

### A4 → becomes H2: Validation endpoint doesn't verify the model is actually pulled

`_validate_ollama` at `llm_config.py:397-437` returns a list of available models but doesn't assert that the caller's `model_pref` is in the list. Added to gap analysis as H2.

### A5 → becomes M4: Upstream tool-call streaming state-accumulation bug

`.venv/.../kaizen_agents/delegate/adapters/ollama_adapter.py:146-157` — `tool_calls.append(tc_dict)` inside the per-line NDJSON loop. Ollama streams tool calls across multiple lines; each line creates a new `tc_dict` with a new `call_id` and empty arguments. Delegate then executes N duplicate calls with broken arguments.

**Verdict:** Upstream bug. File in `terrene-foundation/kailash-py` per `rules/zero-tolerance.md` Rule 4 and `rules/cross-sdk-inspection.md` Rule 1. Also inspect `esperie-enterprise/kailash-rs` for the equivalent issue. Do NOT patch locally. Added to gap analysis as M4.

### A6 → becomes M5: Delegate internal cost tracking may double-bill Ollama

`.venv/.../delegate/delegate.py:228-236` computes cost internally. If a future change passes `budget_usd` to `DelegateConfig`, Ollama users would see fabricated costs consuming a cloud-billing budget. Currently latent (Arbor doesn't pass `budget_usd`), but fragile. Added to gap analysis as M5.

### A7 (merged into M1): Audit logs Ollama with bogus cost

`advisory.py:517-526` calls `log_llm_call(..., provider=llm_context.provider, ..., cost_usd=...)` with a fallback-priced cost. Merged into M1's fix scope.

### A8 → becomes M2: `from_server_env()` silently downgrades to empty-model Ollama

If server has no `openai_api_key` AND no `ollama_model`, `LLMKeyContext.from_server_env()` returns `provider="ollama", model=""`. Arbor boots fine, every advisory query 500s. Added to gap analysis as M2.

### A9 → becomes M3: `conftest.py` `.env` auto-load leaks real `OPENAI_API_KEY` into tests

Per `rules/env-models.md`, root `conftest.py` auto-loads `.env`. Any future Ollama unit test inherits the real OpenAI key, so broken Ollama wiring can pass CI by falling back to OpenAI. Tests must explicitly `monkeypatch.delenv("OPENAI_API_KEY")`. Added to gap analysis as M3.

### A10 → becomes L1: No mobile BYOK/Ollama UI

Confirmed via grep of `apps/mobile/lib` — zero references. Deferred per `zero-tolerance.md` Rule 2 (do not exceed the brief). Added to gap analysis as L1.

### A11 → becomes L2: `clear_key()` dead for Ollama contexts

Dead code but not blocking. Added to gap analysis as L2.

## Red team's fix-direction corrections

The red team corrected my initial fix direction in three important ways:

### Correction 1: Use `adapter=` kwarg, not a `provider` field

**My initial proposal:** Add `provider: str = ""` to `DelegateConfig`, thread it through, branch inside `create_delegate()`.

**Red team's correction:** Build the adapter OUTSIDE `arbor_loop._resolve_llm_settings` entirely and pass `adapter=` to the `Delegate` constructor. `_resolve_llm_settings` exists only to read env var fallbacks from pre-BYOK days — for BYOK/Ollama the resolution already happened in `services/llm_config.build_llm_context()`. **Don't resolve twice.**

Concrete signature change:

```python
@dataclass
class DelegateConfig:
    adapter: StreamingChatAdapter | None = None
    # ... existing fields
```

`advisory.py` calls `kaizen_agents.delegate.adapters.get_adapter(llm_context.provider, model=..., api_key=..., base_url=...)` and passes the instance into `DelegateConfig(adapter=...)`. `create_delegate()` forwards it to `Delegate(adapter=...)`. **Delete the `os.environ.setdefault(...)` lines entirely** — they are the bug.

This also fixes C1 (tenant isolation) because adapters are now per-request instances, not process-global env state.

### Correction 2: "Required model name for Ollama" must be enforced in multiple places

**My initial proposal:** Reject empty model name when provider == "ollama" inside the delegate.

**Red team's correction:** Enforce at three layers:

1. Save endpoint (`api/routers/llm_config.py:174`) — make `model_pref` required for `provider in ("ollama", "custom")`, not just `base_url`.
2. UI copy (`apps/web/src/app/(dashboard)/settings/ai/page.tsx:633-650`) — remove "(optional — auto-detected if empty)"; make it a required field with an example list of tool-capable models.
3. Validation endpoint — reject when `model_pref` is missing OR not present in `/api/tags` results.

### Correction 3: Embeddings fail-fast, not "interim document"

**My initial proposal:** "Interim document that KB embeddings always use server `OPENAI_API_KEY`".

**Red team's correction:** That's a `zero-tolerance.md` Rule 3 violation (silent fallback). Minimum viable fix: if `OPENAI_API_KEY` is missing AND an embedding is requested, raise an actionable error naming the missing variable. Don't return `None`. Documentation alone is not enough.

## Red team's minimum viable scope

The red team endorsed a specific minimum viable scope for the PR:

1. Per-request adapter construction in `arbor_loop.create_delegate` via `adapter=` kwarg. Delete `os.environ.setdefault(...)` lines. Delete the `_resolve_llm_settings` fallback chain for the BYOK path.
2. Thread `provider` through `advisory.py` both call sites (query + stream).
3. Save-time validation: require `model_pref` AND allowlist tool-capable models for Ollama.
4. Validation endpoint checks selected model is in `/api/tags` response.
5. Fix billing (M1): provider-aware `_estimate_cost` or skip `record_usage` for Ollama entirely.
6. Delete `advisory_engine.py` and migrate 4 call sites.
7. Fail-fast on embeddings with no `OPENAI_API_KEY`.
8. Fail-fast at app startup if neither OpenAI nor Ollama is configured (M2).
9. Regression tests for C1–C4, H1–H3, M1–M2 (with `monkeypatch.delenv("OPENAI_API_KEY")`).

## Red team's deferred / out-of-scope list

- Ollama embeddings via `nomic-embed-text` — needs its own plan, touches KB pipeline
- Mobile BYOK/Ollama UI — not in brief
- Upstream `ollama_adapter.py` tool-call streaming fix — file issue in `kailash-py`, do not patch locally (zero-tolerance Rule 4)
- Model capability auto-detection via Ollama's `/api/show` — just ship the allowlist
- `clear_key()` dead code cleanup

## Red team's open questions (user must decide)

See `04-open-questions.md` for the full list.

## References

- Red team report in full is embedded in the /analyze session transcript and summarized above.
- All bug IDs (C1–C4, H1–H3, M1–M5, L1–L2) are now documented in `02-gap-analysis.md`.
