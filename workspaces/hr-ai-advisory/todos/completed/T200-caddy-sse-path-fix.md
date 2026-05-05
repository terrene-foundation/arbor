# T200: Fix Caddy SSE path + add upstream health checks

**Implements:** `specs/production-hardening.md` §4
**Files:** `deploy/Caddyfile`
**Risk:** Low (config only, no code changes)
**Invariants:** 1 (SSE path matches actual request path)

## Problem

The Caddyfile has `handle /advisory/stream*` but the actual request path is `/api/advisory/stream*`. The SSE-specific 300s timeout never matches — streams go through the generic `/api/*` handler with default timeouts, causing premature disconnects on long advisory responses.

Additionally, there are no upstream health checks — Caddy will route to a crashed backend until the next request fails.

## Implementation

1. Fix SSE path: `handle /api/advisory/stream*` — this block MUST come before the generic `/api/*` handler (Caddy matches first matching handler)
2. Strip `/api` prefix in the SSE handler before proxying
3. Add `flush_interval -1` for SSE streaming
4. Add upstream health checks to the generic backend proxy:
   ```
   health_uri /health
   health_interval 10s
   health_timeout 5s
   ```

## R6 note: deployment

Use `caddy reload` (graceful) when deploying this change, not container restart. Restart drops active SSE connections.

## Verification

- `grep "/api/advisory/stream" deploy/Caddyfile` returns a match
- `grep "health_uri" deploy/Caddyfile` returns a match
- The old incorrect path `/advisory/stream*` (without `/api` prefix) no longer exists
