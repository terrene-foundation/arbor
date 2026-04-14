# TRADE-OFF: Advisory rate limit — per-endpoint vs global tightening

**Date:** 2026-04-14
**Phase:** /todos
**Impact:** T202

## Chosen approach

Extend `check_rate_limit()` with an optional `max_requests` parameter. Advisory/shadow LLM endpoints pass `max_requests=5`. All other endpoints keep the default 30. This is backward-compatible — no existing callers change behavior.

## Rejected approach

Tighten the global rate limit from 30 to 10 for all endpoints. Simpler (no API change), but CRUD endpoints (employees, leave, payroll) would hit limits during normal admin workflows — a single payroll run touches 30+ endpoints. False-positive rate limiting on CRUD would break the core product to protect the advisory feature.

## Why this matters

With 15-30s advisory response times, a user physically can't exceed 2-4 queries/minute. The 5/60s limit blocks only programmatic abuse or runaway client retries. CRUD at 30/60s is generous for human-driven admin work.
