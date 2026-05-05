# T204: Shadow execute timeout + DataFlow pool timeout

**Implements:** `specs/production-hardening.md` §6, §8
**Files:** `src/hr_advisory/api/routers/shadow.py`, `src/hr_advisory/models/database.py`
**Risk:** Medium (timeout behavior change — must not break normal operation)
**Invariants:** 2 (shadow execute has 60s timeout, DataFlow pool has 10s timeout)

## Problem

1. `/shadow/execute` has no timeout — only `max_turns=30`. A stuck LLM call holds the connection indefinitely.
2. DataFlow has no `pool_timeout` — when all connections are in use, new requests wait indefinitely instead of failing fast.

## Implementation

### Shadow timeout

Wrap the delegate loop in `shadow.py` `/execute` handler with `asyncio.wait_for(timeout=60.0)`. On timeout, return a degraded response (not a 500):

```python
try:
    result = await asyncio.wait_for(
        _run_shadow_delegate(delegate_config, prompt, ...),
        timeout=60.0,
    )
except asyncio.TimeoutError:
    result = {"response_text": "I took too long to respond. Please try a simpler question.", "degraded": True}
```

### DataFlow pool timeout (R2 resolved)

API verified: `DataFlowConfig.database` has `pool_timeout` attribute (via `DatabaseConfig`). In `database.py`, pass `pool_timeout=10` in the DataFlowConfig constructor's database params. Exact syntax:

```python
DataFlow(
    _url,
    auto_migrate=True,
    config=DataFlowConfig(
        database_url=_url,
        connect_timeout_secs=5,
        max_lifetime_secs=3600,
        database={"pool_timeout": 10},
    ),
)
```

If `database=` dict merge doesn't work, use `DatabaseConfig` directly. The param EXISTS — confirmed via runtime introspection of DataFlow 2.0.7.

## Consumer enumeration

Shadow execute handler: `shadow.py` around line 604-650 (the `/execute` endpoint body).

## Verification

- `grep "wait_for" src/hr_advisory/api/routers/shadow.py` returns a match near the execute handler
- `grep "pool_timeout\|pool_timeout_secs" src/hr_advisory/models/database.py` returns a match (or documented skip)
