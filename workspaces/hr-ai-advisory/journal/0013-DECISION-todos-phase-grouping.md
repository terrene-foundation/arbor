# 0013 — DECISION: Phase grouping for Ollama provider todos

**Date:** 2026-04-08
**Status:** decided
**Phase:** /todos
**Plan:** `02-plans/06-ollama-provider-plan.md`

## Decision

Group the 11 plan phases into 20 todos following the dependency-order outlined in the plan, with these splits:

- Phase 1 → 3 todos (1A extract, 1B rewire, 1C+D delete+verify) — the cleanup is large enough that one todo would obscure the dependency chain
- Phase 7 → 3 todos (7A migration script, 7B embedder, 7C+D docs+quality) — migration script and embedder are blocking each other and must be staged
- Phase 7.5 → 2 todos (7.5A delete regex, 7.5BC call sites + prompt) — separating the deletes from the prompt strengthening lets reviewers verify each step independently
- Phase 10 → 4 todos (10A unit, 10B integration, 10C E2E, 10D regression) — each tier is gated independently per `rules/testing.md`

All other phases (2, 3, 4, 5, 6, 8, 9, 11) → 1 todo each.

## Why this grouping (rather than 1 todo per plan phase)

- The plan's Phase 1 is a 19-step cleanup; if it lived in one todo, an /implement run would balloon and lose granularity for /redteam to audit
- Splitting Phase 7 by sub-phase makes the dependency on T119 (embedder) explicit before T118 (script) can do its iteration loop
- Splitting Phase 10 by tier matches `rules/testing.md` which treats Tier 1, 2, 3 as separate gates
- The split keeps each todo small enough to be implementable in a focused autonomous cycle (~30-90 min equivalent), large enough to be a meaningful unit of progress

## Why NOT 1 todo per micro-step

- Each plan phase has 5-19 steps; one todo per step would yield ~80 todos, defeating the purpose of /todos as a structural plan
- Micro-steps that share files (e.g. "rename `_resolve_llm_settings`" and "delete `os.environ.setdefault`") belong in the same commit and the same todo
- Per `rules/autonomous-execution.md`, todo granularity should match autonomous execution cycles, not human-day estimates

## Cross-cutting test guard captured in master

Every Ollama-specific test MUST `monkeypatch.delenv("OPENAI_API_KEY", raising=False)` to prevent the `conftest.py` `.env` auto-load from silently passing the test via OpenAI fallback. This is captured in T125's "Cross-cutting test guardrail" section so testing-specialist references it during /implement.

## Specialist routing

| Phase | Specialist                                           |
| ----- | ---------------------------------------------------- |
| 1A-1C | kaizen-specialist                                    |
| 2-3   | kaizen-specialist + nexus-specialist                 |
| 4-5   | nexus-specialist                                     |
| 6     | nexus-specialist (init) + kaizen-specialist (cost)   |
| 7A    | dataflow-specialist (pgvector) + ml-specialist (dim) |
| 7B    | ml-specialist + kaizen-specialist                    |
| 7C-D  | ml-specialist                                        |
| 7.5   | kaizen-specialist                                    |
| 8     | react-specialist                                     |
| 9     | gh-manager                                           |
| 10A-D | testing-specialist                                   |
| 11    | security-reviewer + gold-standards-validator         |

## Approval gate

The 20-todo list awaits human approval before /implement may begin. Per `rules/autonomous-execution.md`, the human approves the structural plan; execution is autonomous after approval.
