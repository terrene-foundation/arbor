# T111 — Phase 1B: Rewire 5 live call sites off AdvisoryEngine

**Status**: ACTIVE
**Phase**: 1B (Legacy cleanup — rewire consumers)
**Plan ref**: `02-plans/06-ollama-provider-plan.md` lines 70-76
**Depends on**: T110
**Blocks**: T112
**Specialist**: kaizen-specialist, nexus-specialist (for the Nexus handler delete)

## Why this todo exists

`AdvisoryEngine` is still reachable from 5 live consumers. Each must be rewired to `run_delegate_sync` (or deleted outright in the case of the Nexus handler) before the engine itself can be removed in T112. The contract for each rewire is to keep the downstream consumer's payload shape unchanged so dependent tests and audit trails continue to work.

## What to do — exact files and lines

### 1. Delete Nexus `advisory_query_handler` (NOT migrate — Q7 resolution)

- File: `src/hr_advisory/api/platform.py`
- Lines: **186-244** (the entire `advisory_query_handler` Nexus tool registration block)
- Delete the function and the `@nexus.tool(...)` decorator that registers it
- Why delete instead of migrate: per resolved Q7, the REST `/advisory/query` is the single source of truth and this Nexus handler bypassed parts of the 13-step safety chain. Migrating would re-introduce a parallel path that could drift from the canonical one.
- After deletion, run `rg "advisory_query" apps/ tests/ scripts/` and confirm zero CLI/MCP consumers still expect this tool. If any are found, escalate to user before proceeding.

### 2. Rewire `quality/adversarial_runner.py` \_run_one

- File: `src/hr_advisory/quality/adversarial_runner.py`
- Lines: **378-386** (`_run_one` body)
- Replace the `AdvisoryEngine(...).process_query(...)` call with `run_delegate_sync(...)` from `hr_advisory.delegate.runner`
- Match the return shape so `ScenarioResult` parsing continues to work — specifically the keys `response_text`, `risk_tier`, `confidence`, `citations`, `tools_called`. If `run_delegate_sync` returns an object, wrap or unpack as needed. Add a comment noting which fields map to which.

### 3. Rewire `tests/adversarial/conftest.py` `run_advisory_query` helper

- File: `tests/adversarial/conftest.py`
- Lines: **37-65**
- Rewrite the helper to call `run_delegate_sync` with the same `{response_text, risk_tier, confidence, citations, ...}` contract
- Acceptance: all 8 adversarial test files (`tests/adversarial/test_*.py`) continue to pass without modification

### 4. Update EATP audit-trail capability strings in advisory router

- File: `src/hr_advisory/api/routers/advisory.py`
- Lines: **410** and **457**
- Change `agent_id="advisory_engine"` → `agent_id="arbor_delegate"`
- Change `agent_version_hashes={"advisory_engine": "v2.0.0"}` → pull version from a constant; create `ARBOR_DELEGATE_VERSION = "v3.0.0"` at module top and reference it
- Why: EATP audit trail integrity — old records still reference `"advisory_engine"`; new records must reference `"arbor_delegate"` so cross-version queries work

### 5. Rename capability strings in regulatory MCP adapter

- File: `src/hr_advisory/mcp_servers/adapters/regulatory_classifier.py`
- Lines: **228-231**
- Rename capability string literal `"advisory_engine"` → `"arbor_advisory"` (any reference)
- Update unit test fixtures that pin the old capability name

## Acceptance criteria

- [ ] Nexus `advisory_query_handler` is deleted from `api/platform.py:186-244`; `rg "advisory_query_handler" src/` → 0 matches
- [ ] `rg "AdvisoryEngine" src/hr_advisory/quality/` → 0 matches
- [ ] `rg "AdvisoryEngine" tests/adversarial/` → 0 matches
- [ ] `agent_id="advisory_engine"` no longer appears in `api/routers/advisory.py`
- [ ] `ARBOR_DELEGATE_VERSION` constant declared at module top of advisory router
- [ ] `regulatory_classifier.py` capability strings updated; corresponding unit test fixtures updated
- [ ] `rg "advisory_query" apps/ tests/ scripts/` returns no CLI/MCP consumer expectations (escalation point if any found)
- [ ] All 8 adversarial test files pass: `pytest tests/adversarial/ -x`
- [ ] All advisory router unit tests pass: `pytest tests/unit/api/routers/test_advisory.py -x`
- [ ] `pytest tests/unit/quality/` passes
- [ ] `pytest tests/unit/mcp_servers/adapters/` passes (regulatory adapter)

## Traps

- **Return shape drift** — `run_delegate_sync` may return a dataclass while old code expected a dict. Wrap as needed but do NOT add `dict()`/`vars()` calls that lose type info; explicit field-by-field mapping is preferred.
- **Audit trail backfill** — DO NOT rewrite existing audit log rows. The version constant only governs new writes.
- **TargetAgent enum values** — `QUERY_ANALYZER` and `RESPONSE_SYNTHESIZER` in `src/hr_advisory/models/qa.py:53,55` MUST be kept (read-path for old QA records). Add a comment marking them historical-only. This is NOT in scope for deletion in T112 either.

## Red team round 1 revisions (H3, L5)

- [ ] **H3 — Broaden the consumer grep** before declaring the Nexus delete safe:
  ```bash
  rg "advisory_query" apps/ tests/ scripts/ src/hr_advisory/mcp_servers/ src/hr_advisory/shadow/
  ```
  Any hit in `mcp_servers/` or `shadow/` blocks the delete and requires migration first. The original grep that excluded `src/` would have missed MCP-side wiring.
- [ ] **L5 — Update `_register_handlers` docstring** in `src/hr_advisory/api/platform.py:172-184`. After deletion, the docstring still describes "advisory" as a handler-exposed surface. Remove that mention in the same commit.
