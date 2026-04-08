# Legacy Code Inventory

**Date:** 2026-04-08
**Source:** parallel `analyst` agent audit (round 2)
**Trigger:** Q4 resolution — "all legacy components must be removed"

This document is the complete inventory of legacy / deprecated / dead code in `src/hr_advisory/`, organized by disposition. Every removal must be planned dependency-safe (extract before delete) so the build doesn't break mid-cleanup.

## Group A — DELETE

### A1. `agents/advisory_engine.py` (entire file, ~900 lines)

The deprecated multi-agent ReAct loop. Has a `DeprecationWarning` in `__init__` (line 617). Imports `openai` directly twice (lines 649, 808). Contains `TOOL_DEFINITIONS`, `_build_system_prompt`, `_search_python_kb`, `_search_kb_with_fallback`, `_execute_tool_call`, `_build_client`, four inline `CalculatorAgent` tool handlers.

**Blocked by extraction:** `_search_kb_with_fallback` and `_search_python_kb` must move to a new neutral module first (see migration path below).

### A2. `tests/unit/test_advisory_engine_quality.py` (entire file)

Imports `_build_system_prompt`, `_search_python_kb`, `_execute_tool_call` from `advisory_engine`. 5+ test classes exercising dead code.

### A3. `tests/redteam_advisory_engine.py` (entire file, 40+ lines)

M59-era HTTP probe. Orphan scaffolding.

### A4. Nexus `advisory_query` handler — `api/platform.py` lines 186-244

`@app.handler("advisory_query", ...)` instantiates `AdvisoryEngine` for CLI/MCP channels. Bypasses parts of the safety chain that the REST endpoint enforces. Per Q7 resolution: **delete entirely**, do not migrate. The REST `/advisory/query` is the single source of truth.

### A5. `tests/adversarial/conftest.py` lines 37-65 — adversarial test helper using AdvisoryEngine

The `run_advisory_query` helper imports `AdvisoryEngine` at line 54 and calls `.run()` at line 57. **MIGRATE** (not delete) — rewrite the helper body to call `run_delegate_sync` with the same return shape. All 8 adversarial test files (`test_cpf.py`, `test_employment_act.py`, etc.) keep working unchanged.

Reclassified to MIGRATE. Listed here for traceability.

### A6. `delegate/tools.py` line 175 — import from advisory_engine

`from hr_advisory.agents.advisory_engine import _search_kb_with_fallback`. Pulls advisory_engine into every delegate startup. **MIGRATE** — extract `_search_kb_with_fallback` + `_search_python_kb` into a new `delegate/kb_search.py` module first, then update this import.

Reclassified to MIGRATE.

### A7. `delegate/__init__.py` line 8 — historical docstring

Sentence: "It replaces the manual advisory_engine.py ReAct loop". Cosmetic; delete.

### A8. `quality/adversarial_runner.py` lines 378-386 — AdvisoryEngine call

Inside `_run_one`. **MIGRATE** to `run_delegate_sync`. The runner class itself stays — it's still used by `scripts/run_adversarial_baseline.py`, `tests/integration/test_adversarial_baseline.py`, `tests/unit/test_adversarial_runner.py`.

Reclassified to MIGRATE.

### A9. `api/routers/advisory.py` lines 410, 457 — stale agent_id labels

`agent_version_hashes={"advisory_engine": "v2.0.0"}` (line 410) and `agent_id="advisory_engine"` (line 457). These pollute the EATP trust-lineage attestation: every current trust chain reports the wrong component name. **MIGRATE** — rename to `arbor_delegate` and pull the version from a constant.

Reclassified to MIGRATE.

### A10. `api/routers/advisory.py` lines 571-578 — dead comment block

Unreachable comment narrating the old Kaizen pipeline removal. Delete.

### A11. `mcp_servers/adapters/regulatory_classifier.py` lines 228-231 — capability strings

`Domain.FAIR_EMPLOYMENT: ["compliance_checker", "advisory_engine"]` and 3 others. Cosmetic; rename to `"arbor_advisory"` to stop propagating the legacy name through MCP tool discovery.

Reclassified to MIGRATE.

## Group B — Orphan modules with no live consumers

### B1. `agents/memory/shared_pool.py` — `HRSharedMemoryPool`

Designed for the old `ResponseSynthesizerAgent` (which doesn't exist anymore). Zero callers in `src/`. DELETE the file + re-exports in `agents/memory/__init__.py` and `agents/__init__.py`.

### B2. `agents/memory/long_term.py` — `LongTermMemory`

Zero callers in `src/`. Designed for a per-company pattern system that never shipped. DELETE + remove re-exports.

### B3. `agents/specialists/_base.py` — `BaseDomainSpecialist`

340 lines. Old specialist interface. The only live consumer (`agents/actions/document_gen.py`) imports `_KaizenCompatMixin`, NOT `BaseDomainSpecialist`. **EXTRACT** the mixin to `agents/_kaizen_compat.py` (or inline it into `document_gen.py`), then DELETE the rest of `_base.py` and the entire `agents/specialists/` directory.

### B4. `agents/config.py` lines 246-262 — `SpecialistConfig` dataclass

Only used by `BaseDomainSpecialist._base.py`. Dies with B3.

### B5 / B6 — `TargetAgent.QUERY_ANALYZER` / `RESPONSE_SYNTHESIZER` enum values

`models/qa.py:53,55`. **KEEP** for historical data integrity — old QA records in production may carry these strings as `affected_agent`. Add a comment marking them as historical-only; verify no current code path writes them (verified by grep — only test assertions reference them).

### B7. `agents/specialists/signatures.py` — nearly empty

Only contains `DocumentGenerationSignature` (a misplaced signature, not a domain specialist). **EXTRACT** to `agents/actions/document_gen.py`, then delete the file and the empty `agents/specialists/` directory.

## Removal order (dependency-safe)

### Step 1 — Extract first (so deletes are clean)

1. Move `_search_python_kb` + `_search_kb_with_fallback` into a new `src/hr_advisory/delegate/kb_search.py`. Update `delegate/tools.py:175`.
2. Move `_KaizenCompatMixin` from `agents/specialists/_base.py` into `agents/_kaizen_compat.py`. Update `agents/actions/document_gen.py:20`.
3. Move `DocumentGenerationSignature` from `agents/specialists/signatures.py` into `agents/actions/document_gen.py:21`.

### Step 2 — Rewire live consumers off AdvisoryEngine

4. `api/platform.py:186-244` — delete the `advisory_query_handler`. Verify no CLI/MCP test breaks; if any does, port the test to hit `/advisory/query` directly.
5. `quality/adversarial_runner.py:378-386` — switch to `run_delegate_sync`.
6. `tests/adversarial/conftest.py:37-65` — switch to `run_delegate_sync`.
7. `api/routers/advisory.py` — rename agent_id/version labels (lines 410, 457).
8. `mcp_servers/adapters/regulatory_classifier.py:228-231` — rename capability strings.

### Step 3 — Delete the dead code

9. `agents/advisory_engine.py` (~900 lines)
10. `tests/unit/test_advisory_engine_quality.py`
11. `tests/redteam_advisory_engine.py`
12. `agents/memory/long_term.py` + re-exports
13. `agents/memory/shared_pool.py` + re-exports
14. `agents/specialists/_base.py` (BaseDomainSpecialist sections)
15. `agents/specialists/signatures.py`
16. `agents/specialists/__init__.py` + empty directory
17. `agents/config.py` lines 246-262 (`SpecialistConfig`)
18. `api/routers/advisory.py` lines 571-578 (dead comment)
19. `delegate/__init__.py` line 8 (docstring sentence)

### Step 4 — Verify

20. `rg "AdvisoryEngine"` across `src/hr_advisory/` → must return zero matches
21. `rg "QueryAnalyzerAgent|SpecialistAgent|ComplianceAgent|ResponseSynthesizerAgent|DispatchRouter"` → must return zero matches in `src/`
22. `rg "advisory_engine"` across `src/hr_advisory/` → only allowed match is the historical comment in models/qa.py (B5/B6) if any
23. Run full test suite (~1155+ unit + integration) — must pass
24. Build the docker image — must succeed

## Confirmed clean (do not touch)

These files were checked and are NOT legacy:

- `agents/orchestration/__init__.py` — already a tombstone, `__all__ = []`, comment confirms the old classes were removed
- `workflows/` directory — no old advisory pipeline workflows; current contents are classification, calculators, compliance_checker, guardrails, etc.
- `agents/llm_context.py` — active BYOK plumbing
- `agents/config.py` (except `SpecialistConfig`) — active provider resolution + Kaizen patch
- `agents/actions/calculator.py` — active tool backend
- `agents/actions/document_gen.py` — active Kaizen action agent
- `quality/mutation_engine.py`, `quality/pattern_detector.py`, `quality/rubric.py`, `quality/automated_checks.py`, `quality/llm_judge.py` — all active QA learning loop, called from `api/routers/qa.py:116`
- `agents/memory/short_term.py` — active conversation store, used by advisory.py lines 52, 68, 94, 292, 676

## Net impact

- **Files deleted:** 8 (`advisory_engine.py`, `test_advisory_engine_quality.py`, `redteam_advisory_engine.py`, `long_term.py`, `shared_pool.py`, `_base.py`, `signatures.py`, `specialists/__init__.py`)
- **Lines deleted:** ~1,700 in `src/`, ~500 in `tests/`
- **Live call sites rewired:** 5
- **New files added:** 2 (`delegate/kb_search.py`, `agents/_kaizen_compat.py`)
- **Behavior change:** Zero for the live REST `/advisory/query` path. CLI/MCP `advisory_query` Nexus handler is removed (not migrated) — any consumer must hit the REST endpoint instead.
- **Historical data:** preserved (TargetAgent enum values stay)
