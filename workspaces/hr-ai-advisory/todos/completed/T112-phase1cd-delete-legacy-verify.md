# T112 — Phase 1C+D: Delete legacy AdvisoryEngine + verify clean

**Status**: ACTIVE
**Phase**: 1C + 1D (Legacy cleanup — delete + verify)
**Plan ref**: `02-plans/06-ollama-provider-plan.md` lines 78-100
**Depends on**: T110, T111
**Blocks**: T113
**Specialist**: kaizen-specialist

## Why this is the gate before Phase 2

Once T110 (extracted) and T111 (rewired) are done, the legacy modules have zero live consumers. This todo deletes them, removes their re-exports, and runs the grep/test gate that proves the cleanup is total. Phase 2 (the new adapter seam) cannot start until this gate passes.

## What to delete — exact paths

1. `src/hr_advisory/agents/advisory_engine.py` (~900 LOC, the engine itself)
2. `tests/unit/test_advisory_engine_quality.py` (legacy unit tests)
3. `tests/redteam_advisory_engine.py` (legacy red team)
4. `src/hr_advisory/agents/memory/long_term.py` + remove its re-exports from:
   - `src/hr_advisory/agents/memory/__init__.py`
   - `src/hr_advisory/agents/__init__.py`
5. `src/hr_advisory/agents/memory/shared_pool.py` + remove its re-exports (same two `__init__.py` files)
6. `src/hr_advisory/agents/specialists/_base.py` (the `BaseDomainSpecialist` sections — `_KaizenCompatMixin` already extracted by T110)
7. `src/hr_advisory/agents/specialists/signatures.py` (`DocumentGenerationSignature` already moved by T110)
8. `src/hr_advisory/agents/specialists/__init__.py` AND remove the empty `specialists/` directory
9. `src/hr_advisory/agents/config.py` lines **246-262** — `SpecialistConfig` dataclass

## What to clean up — comment + docstring drift

10. `src/hr_advisory/api/routers/advisory.py` lines **571-578** — dead comment block referencing the legacy engine
11. `src/hr_advisory/delegate/__init__.py` line **8** — historical docstring sentence about "replacement for advisory_engine"

## KEEP — historical-data preservation

- `src/hr_advisory/models/qa.py:53,55` — `TargetAgent.QUERY_ANALYZER` and `TargetAgent.RESPONSE_SYNTHESIZER` enum values. Old QA records reference these strings; deletion would break read-path deserialization. Add a `# historical-only — old QA records reference this; do not remove` comment next to each.

## Verification (Phase 1D — must all pass before this todo is complete)

```bash
# 1. Engine removed
rg "AdvisoryEngine" src/hr_advisory/  # → 0 matches

# 2. Specialist subsystem removed
rg "QueryAnalyzerAgent|SpecialistAgent|ComplianceAgent|ResponseSynthesizerAgent|DispatchRouter" src/  # → 0 matches

# 3. No leftover imports of the deleted module
rg "from hr_advisory.agents.advisory_engine" .  # → 0 matches anywhere in repo

# 4. The only remaining `import openai` lives in kb/embeddings.py (Phase 7 will further refactor it)
rg "import openai" src/hr_advisory/  # → only kb/embeddings.py

# 5. Specialist memory subsystem gone
rg "long_term|shared_pool" src/hr_advisory/agents/memory/  # → 0 matches

# 6. Empty directory removed
test -d src/hr_advisory/agents/specialists  # → does not exist

# 7. Full unit test suite still passes
pytest tests/unit/ -x --no-header -q  # → all green

# 8. Docker image builds clean
docker build -f Dockerfile -t arbor-test .  # → success
```

## Acceptance criteria

- [ ] All 11 deletions/changes above completed
- [ ] All 8 grep checks return their expected counts
- [ ] `pytest tests/unit/` runs to completion with no new failures vs the pre-Phase-1 baseline
- [ ] Docker build completes without import errors
- [ ] `TargetAgent.QUERY_ANALYZER` / `RESPONSE_SYNTHESIZER` still exist with the historical-only comment
- [ ] `~1,700 LOC` net deletion is reflected in `git diff --stat` (rough order of magnitude — exact number not load-bearing)
- [ ] Commit message follows conventional commits: `chore(legacy): delete AdvisoryEngine + specialist subsystem`

## Traps

- **Re-export removal is not optional** — if you delete `long_term.py` but leave its name in `agents/__init__.py`, every `from hr_advisory.agents import LongTermMemory` user breaks at import time. Always pair file deletion with re-export cleanup.
- **`specialists/__init__.py`** — must be deleted explicitly; `git rm -r specialists/` works once the directory is empty. Verify the directory is gone, not just empty.
- **Test discovery** — pytest may still try to import legacy test files via cached `__pycache__`. Run `find . -name __pycache__ -type d -exec rm -rf {} +` if you see ImportError on phantom files.
- **CI matrix** — confirm CI does not have a job pinned to `tests/redteam_advisory_engine.py`. If so, remove the job in the same commit.

## Red team round 1 revisions (L2)

- [ ] **L2 — Pin the `import openai` grep** with a count assertion to catch future drift:
  ```bash
  test "$(rg -l 'import openai' src/hr_advisory/ | wc -l)" -eq 1
  ```
  The single allowed file is `kb/embeddings.py`. Any other hit (now or later) is a regression.
