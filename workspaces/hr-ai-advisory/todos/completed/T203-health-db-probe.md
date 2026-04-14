# T203: Health endpoint DB probe (replace fake health)

**Implements:** `specs/production-hardening.md` §7
**Files:** `src/hr_advisory/api/platform.py` (or new health handler)
**Risk:** Medium (changes health check behavior — must not break Docker healthcheck)
**Invariants:** 2 (health probes DB, returns 503 when DB is down)

## Problem

The `/health` endpoint from Nexus SAAS preset returns 200 without checking the database. This is a fake health endpoint per `zero-tolerance.md` Rule 2 examples. When PostgreSQL is down, the backend reports healthy and Caddy keeps routing to it — every DB-dependent request fails with a 500.

## Implementation

### R3 revision: Nexus override mechanism

Nexus SAAS preset registers its own `/health`. The custom route must be registered on the underlying FastAPI app AFTER Nexus mounts, so it overrides the default. Verify by checking the actual served response, not just the route registration. If Nexus blocks override, register as `/health` on a router with higher priority or replace Nexus health via a Nexus hook if available.

1. Add a custom `/health` route on the FastAPI app that overrides the Nexus default
2. The handler MUST:
   - Execute `SELECT 1` against PostgreSQL via the DataFlow connection
   - Return `{"status": "healthy", "db": "ok"}` with 200 on success
   - Return `{"status": "unhealthy", "db": "unreachable"}` with 503 on failure
   - Complete within 5 seconds (use `asyncio.wait_for` with timeout)
3. No authentication required (health checks are from infrastructure, not users)
4. Preserve compatibility with Docker healthcheck: `curl -f http://localhost:8000/health`

## Verification

- `curl http://localhost:8000/health` returns 200 with `"db": "ok"` when DB is up
- Health endpoint returns 503 when DB connection fails
- Docker healthcheck in `docker-compose.prod.yml` still works unchanged
