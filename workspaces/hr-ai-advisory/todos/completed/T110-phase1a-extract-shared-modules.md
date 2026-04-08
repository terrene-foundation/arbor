# T110 — Phase 1A: Extract shared modules before legacy delete

**Status**: ACTIVE
**Phase**: 1A (Legacy cleanup — extract)
**Plan ref**: `02-plans/06-ollama-provider-plan.md` lines 64-68
**Blocks**: T111, T112
**Specialist**: kaizen-specialist

## Why this is first

The legacy `AdvisoryEngine` and its specialist subsystem are about to be deleted (~900 lines + 6 supporting files). Three pieces of code that the new `Delegate` path still depends on are physically located inside the legacy modules. They MUST be extracted into new locations BEFORE the delete in T112, otherwise the build breaks mid-cleanup.

## What to build

### Extraction 1 — KB search helpers

- Create `src/hr_advisory/delegate/kb_search.py`
- Move `_search_python_kb` and `_search_kb_with_fallback` from `src/hr_advisory/agents/advisory_engine.py` into the new file
- Preserve docstrings and any private constants used by these functions
- Update `src/hr_advisory/delegate/tools.py:175` to import from `hr_advisory.delegate.kb_search` instead of `hr_advisory.agents.advisory_engine`
- Run `pytest tests/unit/test_delegate_tools.py -x` to confirm import wiring

### Extraction 2 — Kaizen compatibility mixin

- Create `src/hr_advisory/agents/_kaizen_compat.py`
- Move `_KaizenCompatMixin` from `src/hr_advisory/agents/specialists/_base.py` into the new file
- Update `src/hr_advisory/agents/actions/document_gen.py:20` to import from `hr_advisory.agents._kaizen_compat`
- Run `pytest tests/unit/agents/test_document_gen.py -x` to confirm

### Extraction 3 — Inline DocumentGenerationSignature

- Open `src/hr_advisory/agents/specialists/signatures.py`, locate `DocumentGenerationSignature` class
- Move it inline into `src/hr_advisory/agents/actions/document_gen.py:21` (place it just above the consumer class so the relationship is obvious)
- Remove the import line that previously pulled it from `specialists/signatures.py`

## Acceptance criteria

- [ ] `src/hr_advisory/delegate/kb_search.py` exists with `_search_python_kb` + `_search_kb_with_fallback`
- [ ] `src/hr_advisory/agents/_kaizen_compat.py` exists with `_KaizenCompatMixin`
- [ ] `DocumentGenerationSignature` lives inside `agents/actions/document_gen.py`
- [ ] `delegate/tools.py:175` imports from new `kb_search` module
- [ ] `agents/actions/document_gen.py:20` imports from new `_kaizen_compat` module
- [ ] No imports of `_search_python_kb`, `_search_kb_with_fallback`, `_KaizenCompatMixin`, or `DocumentGenerationSignature` reference the legacy modules anywhere
- [ ] `pytest tests/unit/` passes (no new failures)
- [ ] `rg "from hr_advisory.agents.advisory_engine import (_search_python_kb|_search_kb_with_fallback)"` → 0 matches
- [ ] `rg "from hr_advisory.agents.specialists._base import _KaizenCompatMixin"` → 0 matches
- [ ] `rg "from hr_advisory.agents.specialists.signatures import DocumentGenerationSignature"` → 0 matches

## Out of scope

- Deleting any legacy file (that's T112)
- Touching `Delegate` itself or `DelegateConfig` (T113)
- Running any non-unit test tier

## Red team round 1 revisions (M24, L1)

- [ ] **Before T112**: run `rg "_KaizenCompatMixin" src/hr_advisory/` to enumerate ALL downstream consumers of the mixin (not just the known `document_gen.py:20`). Update each in this todo.
- [ ] **Inlining `DocumentGenerationSignature`**: place it at line 21 of `agents/actions/document_gen.py` (immediately above the `DocumentGenerationAction` class). If the file has multiple classes, place it directly above whichever class consumes the signature.
