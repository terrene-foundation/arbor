# 0014 — DECISION: Red team round 1 applied to Ollama todos

**Date:** 2026-04-08
**Status:** decided
**Phase:** /todos
**Plan:** `02-plans/06-ollama-provider-plan.md`
**Red team report:** `04-validate/round-14-ollama-todos-redteam.md`

## Decision

Apply all 4 CRITICAL and 15 HIGH findings from red team round 1 directly to the 20 todos in `todos/active/T1XX-*.md` as inline `## Red team round 1 revisions` sections. MEDIUMs and LOWs also applied where they tighten acceptance criteria. The structural shape of the plan (20 todos, dependency order T110→T129) is unchanged.

## Why apply inline rather than rewrite

- Each finding is concrete enough to be a delta against the original todo, not a re-decomposition
- Inline `## Red team round 1 revisions` sections preserve the original prose for context and traceability
- /implement reads the entire todo file, so additional acceptance criteria appended to the bottom are picked up naturally
- No second red-team round is needed before human approval — the findings are concrete and actionable

## Critical findings and how they were addressed

### C-1 (kaizen) — env-mutation backdoor in T113

**Finding:** T113 deletes `os.environ.setdefault` but the `adapter is None` fallback branch still constructs `OpenAIStreamAdapter(api_key=None)` which reads from `os.environ` at construction. Same for `stream_delegate`.

**Fix applied to T113:** added `require_server_default: bool = False` field to `DelegateConfig`. Request-context callers (T114) pass `require_server_default=True`. The `adapter is None and require_server_default` branch raises `RuntimeError` instead of falling through to env. Legacy/script callers retain the env path with the flag defaulting `False`.

### C-2 (kaizen) — T113 regression test didn't pin the actual bug

**Finding:** Snapshot-equality on `os.environ` before/after one call passes even with the backdoor. C1 only manifests across two requests.

**Fix applied to T113 + T128:** rewrote `test_C1_no_byok_leak_to_subsequent_request` to call `create_delegate` twice (request A explicit Ollama adapter, request B `adapter=None` with `require_server_default=True`) and assert (a) request B raises `RuntimeError`, (b) `os.environ` is unchanged after request A. This test FAILS on the pre-fix codebase AND on a half-fix.

### C-3 (dataflow) — T120 side-by-side test architecturally impossible

**Finding:** A single `provisions` table can't hold both `vector(1024)` and `vector(1536)` simultaneously. The side-by-side test as originally specified can't run.

**Fix applied to T120:** shadow-table approach. On a copy of production DB, create `provisions_new_emb (provision_id, embedding vector(1024))` joined at query time. Run the new pipeline against the shadow table; the old pipeline still queries the original `provisions.embedding` column. Three result sets reported (baseline / Ollama mxbai / OpenAI text-3-large@1024).

Also captured: confirm the production baseline embedding model (`text-embedding-3-small` per plan vs `text-embedding-3-large@1024` per T119) before running the comparison.

### C-4 (dataflow) — T118 idempotency check used wrong catalog

**Finding:** `information_schema.columns.udt_name` returns `'vector'` without dimension; cannot distinguish 1024 from 1536. The script's "already migrated, exit cleanly" check would fire incorrectly.

**Fix applied to T118:** use `pg_attribute.format_type(atttypid, atttypmod)` which yields `'vector(1024)'` or `'vector(1536)'` explicitly.

## High findings — applied summary

| Finding | Applied to | Change                                                                                     |
| ------- | ---------- | ------------------------------------------------------------------------------------------ |
| H1      | T117       | Retarget init-invariant to `api/server.py:main()` (not nonexistent `main.py`)              |
| H2      | T117       | Test-mode carve-out: skip on `app_env == "test"` or `PYTEST_CURRENT_TEST`                  |
| H3      | T111       | Broaden grep to `src/hr_advisory/mcp_servers/` and `shadow/` before deleting Nexus handler |
| H4      | T114       | Explicitly delete post-construction `delegate_config.api_key = ...` lines (754-759)        |
| H5      | T114       | `build_adapter_from_context` raises if openai context has no api_key (no env fallback)     |
| H6      | T121, T122 | T121 leaves no-op stubs; T122 deletes them atomically with the call sites                  |
| H7      | T122       | Add 5th refusal clause: indirect injection via tool output                                 |
| H8      | T126       | Declare `ollama_only_env` fixture in `tests/conftest.py` for cross-tier reuse              |
| H9      | T128       | C1 regression rewritten as two-request reproduction                                        |
| H10     | T125       | Add behavioral tests for `screen_response` output guard                                    |
| H11     | T128       | M1 regression reads back from `llm_usage` DB table                                         |
| H12     | T126       | Save reject tests follow POST with GET to confirm no partial write                         |
| H13     | T118       | Migration loop uses raw psycopg, NOT DataFlow ListNode (default-limit trap)                |
| H14     | T118       | Capture `pg_indexes.indexdef` before DROP, replay verbatim after re-embed                  |
| H15     | T118       | Backup read-back: sample 20 rows + SHA-256 checksum file before any DROP                   |

## Mediums and lows

24 MEDIUM and 13 LOW findings also applied in the same `## Red team round 1 revisions` sections. They tighten acceptance criteria, add observability, and pin invariants.

## Process notes

- 4 specialists ran in parallel (kaizen, nexus, dataflow, testing). Total wall-clock for the red team round: ~6 minutes (longest single agent: kaizen at 5:50).
- Each specialist read the actual source code (verified imports, line numbers, function signatures), not just the todos. Several findings (H1 `main.py` doesn't exist, H4 post-construction assignments at 754-759, H5 OpenAI adapter env fallback at line 54) would not have surfaced from todo-only review.
- No specialist reported "nothing wrong" — every domain found at least one HIGH finding. This is healthy for a complex multi-phase plan.

## Next phase

- Master index updated with red-team summary + suggested approval questions
- Awaiting human approval at the structural gate
- After approval: `/implement` may begin with T110 (Phase 1A extract)
