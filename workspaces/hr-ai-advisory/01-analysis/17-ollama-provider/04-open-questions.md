# Ollama Provider — Open Questions

**Date:** 2026-04-08
**For:** User decision before `/todos` and `/implement`.

These seven questions must be answered before the implementation plan can be finalized. Each has a recommendation based on the gap analysis and red team findings. If you agree with the recommendations, answer "all recommended" and the plan will proceed with those defaults.

---

## Q1. Tool-capability gate — hard reject or soft warn?

**Context:** Only newer Ollama models (`llama3.1`, `llama3.2`, `qwen2.5`, `mistral-nemo`, `firefunction-v2`, `command-r*`) support tool calls. Others silently ignore the `tools` field and return plain-text chat, meaning the advisory engine never calls `search_kb` / `calculate_cpf` and produces hallucinated answers with no citations.

**Option A (recommended):** Hard reject at save time. The UI presents an allowlist of tool-capable model families as a dropdown; unknown model names are rejected with a helpful error. Simple, deterministic, safe for a regulated domain.

**Option B:** Save with a warning, degrade gracefully at query time. Complex to implement (need runtime detection that tool calls were silently dropped), and a degraded advisory in SG employment law is worse than no advisory.

**Recommendation:** **A — hard reject.** A silent wrong answer in SG employment law is a compliance risk.

---

## Q2. Is "server-default Ollama" a supported deployment mode?

**Context:** `LLMKeyContext.from_server_env()` today falls back to Ollama when the server has no `OPENAI_API_KEY`. This mode is never tested and has multiple bugs (M1 billing, M2 empty model, no tool-capability gate).

**Option A (recommended):** Yes, it's supported. Fix M1 (billing), M2 (fail-fast), and require `OLLAMA_MODEL` in startup env validation when no OpenAI key is present. This enables fully air-gapped SME deployments (the "institution DGX" case named in `ollama_health.py`).

**Option B:** No, it's not supported. `from_server_env()` raises if `openai_api_key` is empty. Ollama is BYOK-only.

**Recommendation:** **A — yes, supported.** The `memory/project_byok_decision.md` already names "Ollama/DGX for local" as an intended mode, and Arbor's open-source value proposition includes air-gap deployment. Fix the bugs rather than remove the mode.

---

## Q3. How should unknown model names be priced?

**Context:** `llm_budget._FALLBACK_PRICING = (2.50, 10.00)` — GPT-4o rates. Affects any model not in `MODEL_PRICING` (today, that includes all Ollama models and any new cloud model).

**Option A (recommended):** Unknown models via Ollama provider → `$0` cost. Unknown models via cloud providers → `_FALLBACK_PRICING` (conservative over-estimate). Provider-aware cost lookup.

**Option B:** Block saves of unknown models entirely. Too restrictive for cloud BYOK users who may use fine-tuned or newly released models.

**Option C:** Log a warning and use `_FALLBACK_PRICING` uniformly. Continues to bill Ollama users wrongly.

**Recommendation:** **A — provider-aware pricing.** Ollama is $0 because the company operates the inference server. Cloud unknowns stay at fallback for safety.

---

## Q4. Legacy `AdvisoryEngine` — delete now or follow-up PR?

**Context:** `agents/advisory_engine.py` is deprecated but still reachable via `api/platform.py:200,225` (active HTTP endpoint) and `quality/adversarial_runner.py:380,382`. It hardcodes `openai.OpenAI()` and will 500 on Ollama-only deployments.

**Option A (recommended):** Delete in this PR. Migrate the 4 call sites to `run_delegate_sync`. If `/advisory/autonomous` is unused by any frontend, delete the endpoint with the engine.

**Option B:** Leave it, mark it with a runtime check that raises on Ollama-only contexts. Kicks the can; violates `zero-tolerance.md` Rule 2.

**Recommendation:** **A — delete now.** The file is large (1000+ lines) but the migration is mechanical. Shipping Ollama with a live OpenAI-hardcoded fallback path is an incident waiting to happen.

**Decision needed sub-question:** Does any frontend call `/advisory/autonomous` today, or is it dead code?

---

## Q5. Embeddings strategy — fail-fast, or ship Ollama embeddings now?

**Context:** `kb/embeddings.py:79` unconditionally uses `openai.OpenAI()`. KB search breaks on Ollama-only deployments. Three options:

**Option A (recommended):** Fail-fast with an actionable error. If `OPENAI_API_KEY` is missing and an embedding is requested, raise a clear error naming the missing variable. Document that KB embeddings currently require an OpenAI key even when advisory is Ollama. This is the minimum viable fix.

**Option B:** Ship an Ollama embeddings path (`nomic-embed-text` via `/api/embeddings`) in this PR. Correct but significant scope creep — touches the KB pipeline, embedding dimension config, re-embed migrations.

**Option C:** Return `None` silently and let KB search produce empty results. Violates `zero-tolerance.md` Rule 3 (no silent fallbacks).

**Recommendation:** **A — fail-fast now, file a follow-up for B.** Shipping a partial Ollama path is better than blocking on a KB-pipeline rewrite.

---

## Q6. Tenant isolation disclosure

**Context:** Bug C1 (`os.environ.setdefault` mutation) is a live multi-tenant data leak, not just a BYOK wiring bug. On a production server where Company A has BYOK configured and Company B is on server defaults, Company B's OpenAI key can be sent as a bearer token to Company A's endpoint.

**Recommendation:**

1. This PR should include a **security-reviewer** pass per `rules/agents.md` Rule 2.
2. Check audit logs (`log_audit_event` via `llm_config.py`) for any production company that has ever saved a BYOK config.
3. If any non-admin BYOK configs exist in production, we should rotate the server-default `OPENAI_API_KEY` before merging, in case any base_url poisoning has already occurred.
4. Depending on findings in step 2, may require disclosure to affected customers.

**Decision needed:** Does the user want to proceed with a security review pass and audit log inspection before or after the fix is implemented?

---

## Q7. Is `/advisory/autonomous` still in use?

**Context:** Sub-question of Q4. `src/hr_advisory/api/platform.py:194-225` exposes an endpoint that instantiates `AdvisoryEngine`. Need to determine if any frontend calls it before deciding whether to delete it with the engine.

**Recommendation:** Check `apps/web/src/services/api/` and `apps/mobile/lib/` for references. If zero references, delete the endpoint with the engine in this PR. If references exist, migrate the endpoint to `run_delegate_sync` in this PR.

**Action item for `/todos`:** Grep for `/advisory/autonomous` across frontend code as the first investigative step.

---

## Resolved decisions (2026-04-08)

| Q   | Question                         | User decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Tool-capability gate             | **Stronger than recommended — fail-fast at INITIALIZATION.** Service refuses to start if Ollama is configured but the model is not in `OLLAMA_TOOL_CAPABLE_FAMILIES`. Save-time check is not enough; runtime check at app boot is the invariant.                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Q2  | Server-default Ollama supported? | **Yes, with default `http://localhost:11434`.** Standard Ollama deployment listens on `127.0.0.1:11434` (HTTP). Default base URL stays `http://localhost:11434`; user supplies their own IP+port for non-local servers.                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Q3  | Unknown model pricing            | **$0 for Ollama, period.** No fallback billing for any Ollama-served model. Provider-aware `_estimate_cost`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Q4  | Delete legacy AdvisoryEngine     | **All legacy components must be removed** — broader than just AdvisoryEngine. See `05-legacy-inventory.md` for the full DELETE/MIGRATE list.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Q5  | Embeddings strategy              | **Ship Ollama embeddings now, select the best model.** Choice: `mxbai-embed-large` (335M params, 1024-dim, top MTEB scores for English). Standardize on 1024-dim across both providers (OpenAI `text-embedding-3-large` with `dimensions=1024` for cloud, Ollama `mxbai-embed-large` for local). One-time KB re-embed migration from 1536-dim to 1024-dim.                                                                                                                                                                                                                                                                                                                        |
| Q6  | Tenant isolation disclosure      | **Yes — security review + audit log inspection before merge.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Q7  | `/advisory/autonomous` status    | **Verified: no such endpoint exists.** The legacy path is the Nexus `advisory_query` handler in `api/platform.py:186-244` (CLI/MCP channels), not an HTTP endpoint. Disposition: DELETE the handler entirely (not migrate — REST `/advisory/query` is the single source of truth and the handler bypasses parts of the safety chain). Plus: full Arbor Delegate autonomy audit was run — see `06-autonomy-audit.md`. Three BLOCKING violations found in `workflows/guardrails.py` (regex-based circumvention/injection/escalation classifiers that pre-filter user input before the LLM sees it). Fix: delete the regex screens, move protections into the system prompt instead. |

## Scope expansion driven by resolutions

The user's choices expand scope beyond the original "minimum viable" plan:

1. **Q1 stronger** — adds an init-time invariant check; fails the app at boot if misconfigured
2. **Q4 broader** — full legacy cleanup is now a 7-file deletion + 5 call-site migration (see `05-legacy-inventory.md`)
3. **Q5 wider** — adds the entire Ollama embeddings path including:
   - `mxbai-embed-large` Ollama embedding adapter
   - Provider-aware embedder dispatch (chosen by `LLMKeyContext.provider`)
   - 1536-dim → 1024-dim pgvector migration
   - One-time KB re-embed migration script
   - Test that retrieval quality is maintained after the dim change
4. **Q7 broader** — adds an autonomy fix phase that deletes ~25 regex patterns from `workflows/guardrails.py` and strengthens the Delegate system prompt to handle scope, injection, escalation, and circumvention via reasoning instead of keyword matching

The expanded plan is in `02-plans/06-ollama-provider-plan.md` (see "scope-expansion phases" added 2026-04-08).

## What this gets us

- **Functional Ollama provider** — end-to-end, with native adapter, model selection, validation
- **Tenant isolation** — fixes the live multi-tenant data leak from bug C1
- **Fully autonomous Delegate** — every user query reaches the LLM; no code-based pre-filtering
- **Consistent embedding dimension** — 1024-dim across providers, single vector index
- **Full air-gap deployment mode** — companies can run Arbor entirely on-prem with Ollama serving both advisory AND embeddings
- **Clean codebase** — ~1,700 lines of legacy code removed, no deprecated paths still reachable
- **Cost integrity** — Ollama is $0, audit trail accurate, budget tracker correct
- **Compliance posture** — no silent wrong advice (tool-capability invariant), full security review pass
