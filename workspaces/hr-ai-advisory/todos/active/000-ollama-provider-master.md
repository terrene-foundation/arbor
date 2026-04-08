# Ollama Provider End-to-End — Master Index

**Workspace:** `hr-ai-advisory`
**Plan:** `02-plans/06-ollama-provider-plan.md`
**Open questions:** `01-analysis/17-ollama-provider/04-open-questions.md` (all 7 resolved)
**Branch:** `feat/ollama-provider-e2e-q1q4q5q7`
**Estimated:** 1-2 autonomous execution cycles (per `rules/autonomous-execution.md` 10x multiplier)

## Goal

Ship a functional, safe, end-to-end Ollama provider for Arbor with:

1. Native `OllamaStreamAdapter` routing (not OpenAI adapter coercion)
2. Tenant isolation (eliminate `os.environ.setdefault` C1 leak)
3. Init-time tool-capability invariant (Q1 — service refuses to start with non-tool-capable model)
4. Provider-aware billing (Q3 — `$0` for Ollama, never)
5. Ollama embeddings via `mxbai-embed-large` (Q5) with 1024-dim KB migration
6. Fully autonomous Delegate (Q7 — delete regex guardrails, strengthen system prompt)
7. Full legacy cleanup (~1,700 LOC removed, 5 call-sites rewired)

## Topology (dependency order)

```
T110 (Phase 1A) ──┐
T111 (Phase 1B) ──┼──> T112 (Phase 1C+D verify) ──> T113 (Phase 2 adapter seam) ──> T114 (Phase 3 router thread)
                  │                                                                      │
                  │                                                                      ├──> T115 (Phase 4 save allowlist)
                  │                                                                      ├──> T116 (Phase 5 validate model pulled)
                  │                                                                      └──> T117 (Phase 6 cost + init invariant)
                  │
                  ├──> T118 (Phase 7A vector dim migration) ──> T119 (Phase 7B embedder) ──> T120 (Phase 7C+D docs+quality)
                  │
                  └──> T121 (Phase 7.5A delete regex) ──> T122 (Phase 7.5B+C call sites + prompt)

Independent (any time after T112):
  T123 (Phase 8 frontend copy)
  T124 (Phase 9 upstream issues)

Final gates (require all above complete):
  T125 (Phase 10A unit tests)
  T126 (Phase 10B integration tests w/ real Ollama)
  T127 (Phase 10C E2E Playwright)
  T128 (Phase 10D regression tests)
  T129 (Phase 11 security review + audit log)
```

## Todos

| ID   | Phase | Title                                                                   | Blocks     |
| ---- | ----- | ----------------------------------------------------------------------- | ---------- |
| T110 | 1A    | Extract shared modules before legacy delete                             | T111, T112 |
| T111 | 1B    | Rewire 5 live call sites off AdvisoryEngine                             | T112       |
| T112 | 1C+D  | Delete legacy AdvisoryEngine + verify grep/tests clean                  | T113       |
| T113 | 2     | Adapter injection seam in `arbor_loop.py` (DelegateConfig.adapter)      | T114       |
| T114 | 3     | Thread adapter through advisory router via `build_adapter_from_context` | T115-T117  |
| T115 | 4     | Save-time enforcement: required model + allowlist                       | —          |
| T116 | 5     | Validate endpoint checks model is pulled on Ollama server               | —          |
| T117 | 6     | Provider-aware billing + init-time tool-capability invariant            | —          |
| T118 | 7A    | Vector dimension migration 1536→1024 + migration script                 | T119       |
| T119 | 7B    | Provider-aware `EmbeddingPipeline` (Ollama mxbai + OpenAI)              | T120       |
| T120 | 7C+D  | Embedding deployment docs + retrieval quality verification              | —          |
| T121 | 7.5A  | Delete regex guardrails in `workflows/guardrails.py`                    | T122       |
| T122 | 7.5BC | Remove guardrail call sites + strengthen system prompt                  | —          |
| T123 | 8     | Frontend Ollama settings copy + required model field                    | —          |
| T124 | 9     | File 3-4 upstream `kailash-py` issues                                   | —          |
| T125 | 10A   | Unit tests (Tier 1) — adapter, allowlist, cost, embeddings              | —          |
| T126 | 10B   | Integration tests (Tier 2) — real Ollama in docker-compose              | T125       |
| T127 | 10C   | E2E tests (Tier 3) — Playwright Ollama settings + advisory              | T126       |
| T128 | 10D   | Regression tests pinning C1, C4, M1, V1/V2/V3                           | T125       |
| T129 | 11    | Security review + audit log inspection (Q6 mandatory)                   | T125-T128  |

## Cross-cutting rules (apply to every todo)

- **Test pollution guard:** All Ollama tests MUST `monkeypatch.delenv("OPENAI_API_KEY", raising=False)` and `monkeypatch.delenv("OPENAI_BASE_URL", raising=False)` — `conftest.py` auto-loads `.env` and tests will pass by silently falling back to OpenAI otherwise.
- **No silent fallbacks:** `zero-tolerance.md` Rule 3 — every error path raises with an actionable message.
- **State persistence verification:** Tier 2/3 tests verify writes with read-back per `rules/testing.md`.
- **Specialist delegation:** kaizen-specialist for delegate/adapter; nexus-specialist for router; dataflow-specialist for vector migration; ml-specialist for embedding model selection.

## Decisions captured during planning

- `journal/0013-DECISION-todos-phase-grouping.md` — why 20 todos vs 11 phases vs 80 micro-steps
- `journal/0014-DECISION-redteam-round1-applied.md` — red team findings and applied revisions

## Red team round 1 (2026-04-08)

Four specialists (kaizen, nexus, dataflow, testing) red-teamed the 20 todos in parallel. Findings: **4 CRITICAL, 15 HIGH, 24 MEDIUM, 13 LOW**. Full report at `04-validate/round-14-ollama-todos-redteam.md`.

All CRITICAL and HIGH findings have been applied as revisions appended to each affected todo (search for `## Red team round 1 revisions` in any T1XX file). The plan structure is unchanged; the deltas are added requirements within each phase.

**Critical findings summary:**

| ID  | Specialist | Finding                                                                                        | Applied to |
| --- | ---------- | ---------------------------------------------------------------------------------------------- | ---------- |
| C-1 | kaizen     | T113 left an env-mutation backdoor via `adapter is None` fallback path                         | T113       |
| C-2 | kaizen     | T113 regression test was a single-call snapshot, didn't pin the actual cross-request leak      | T113, T128 |
| C-3 | dataflow   | T120 side-by-side test was architecturally impossible (single column can't hold two dim sizes) | T120       |
| C-4 | dataflow   | T118 idempotency check used wrong pgvector catalog (`udt_name` doesn't carry dimension)        | T118       |

## Approval gate

This master plan + all 20 todos (with round-1 revisions applied) require human approval before `/implement` may begin. Per `rules/autonomous-execution.md`, the human approves the structural plan; execution is autonomous after approval.

**Suggested approval questions for the user:**

1. Does the 20-todo decomposition cover the full plan in `02-plans/06-ollama-provider-plan.md`? Anything missing or out of scope?
2. Is the dependency order correct? T110-T112 (legacy cleanup) → T113-T117 (adapter + invariants) → T118-T120 (embeddings) → T121-T122 (autonomy fix) is the critical path. Phases 8-9 are independent; phases 10-11 are gates.
3. The plan now includes an in-place pgvector dimension migration on production. The migration script writes a JSONL backup before any DROP COLUMN, but the rollback path requires manual intervention. Acceptable?
4. Phase 7.5 deletes ~25 regex guardrails and moves the protections into the system prompt. The first integration test of the autonomy fix lands in T126 (Tier 2). Comfortable shipping that on autonomous execution alone, or do you want a human spot-check at T122 completion?
5. Phase 11 mandates a security-reviewer pass + audit log inspection + potential `OPENAI_API_KEY` rotation before merge. This is a hard gate. Confirm.
