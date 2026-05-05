# T202: Advisory-specific rate limit (5/60s for LLM endpoints)

**Implements:** `specs/production-hardening.md` §3
**Files:** `src/hr_advisory/workflows/guardrails.py`, `src/hr_advisory/api/routers/advisory.py`, `src/hr_advisory/api/routers/shadow.py`
**Risk:** Low
**Invariants:** 3 (rate limit function accepts max_requests param, advisory uses 5/60s, shadow uses 5/60s)

## Problem

The current rate limiter treats all endpoints equally at 30 req/60s. A single user can fire 30 advisory queries in 60 seconds, exhausting all GPU capacity. With 15-30s response times, users physically can't exceed 2-4/min in normal use — 5/60s prevents burst abuse.

## Implementation

1. Extend `check_rate_limit()` in `guardrails.py` to accept optional `max_requests` parameter (default stays 30 for backward compat):
   ```python
   def check_rate_limit(user_id: str, max_requests: int = _MAX_REQUESTS_PER_WINDOW) -> bool:
   ```
2. In `advisory.py` `/query` and `/stream` handlers, call with `max_requests=5`
3. In `shadow.py` `/execute` handler, call with `max_requests=5`
4. Other shadow endpoints (`/context`, `/observe`, etc.) keep the default 30 — they don't hit the GPU

## Consumer enumeration

```bash
rg "check_rate_limit" src/hr_advisory/api/routers/advisory.py src/hr_advisory/api/routers/shadow.py
```

- `advisory.py:217` — `/query` handler -> change to max_requests=5
- `advisory.py:539` — `/stream` handler -> change to max_requests=5
- `shadow.py:604` — `/execute` handler -> change to max_requests=5
- `shadow.py:996` — `/context` handler -> keep default (no LLM)
- `shadow.py:1409` — `/observe` handler -> keep default (no LLM)
- `shadow.py:1707` — `/briefing` handler -> keep default (no LLM)

## Verification

- `grep "max_requests=5" src/hr_advisory/api/routers/advisory.py` returns 2 matches
- `grep "max_requests=5" src/hr_advisory/api/routers/shadow.py` returns 1 match
