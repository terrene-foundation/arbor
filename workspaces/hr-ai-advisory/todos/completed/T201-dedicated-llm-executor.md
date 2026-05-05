# T201: Dedicated LLM ThreadPoolExecutor

**Implements:** `specs/production-hardening.md` §2
**Files:** `src/hr_advisory/api/routers/advisory.py`
**Risk:** Low (isolated change, no API surface change)
**Invariants:** 2 (executor created with bounded workers, advisory uses it instead of default)

## Problem

`/advisory/query` uses `loop.run_in_executor(None, ...)` which shares the default executor with ALL async ops (DB, briefing, nudges). Under load, LLM calls (10-40s each) monopolize the default executor, blocking fast operations.

## Implementation

1. Create module-level executor in `advisory.py`:
   ```python
   _LLM_EXECUTOR = concurrent.futures.ThreadPoolExecutor(
       max_workers=4,
       thread_name_prefix="arbor-llm",
   )
   ```
2. Replace `loop.run_in_executor(None, ...)` with `loop.run_in_executor(_LLM_EXECUTOR, ...)` in the `/advisory/query` handler (~line 318)
3. Do NOT change `/advisory/stream` or `/shadow/execute` — they use native async, not the thread pool

## R4 revision: configurable worker count

Make `max_workers` configurable via `LLM_EXECUTOR_WORKERS` env var (default 4). If deployment has more GPU slots (OLLAMA_NUM_PARALLEL > 4), operators can increase without code changes.

```python
_LLM_WORKERS = int(os.environ.get("LLM_EXECUTOR_WORKERS", "4"))
_LLM_EXECUTOR = concurrent.futures.ThreadPoolExecutor(
    max_workers=_LLM_WORKERS,
    thread_name_prefix="arbor-llm",
)
```

## Verification

- `grep "run_in_executor(None" src/hr_advisory/api/routers/advisory.py` returns zero matches (for LLM calls)
- `grep "_LLM_EXECUTOR" src/hr_advisory/api/routers/advisory.py` returns matches
