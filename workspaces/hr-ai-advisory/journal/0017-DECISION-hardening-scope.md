# DECISION: Production hardening scope — infrastructure only, no new features

**Date:** 2026-04-14
**Phase:** /todos
**Impact:** M60-M62 (T200-T209)

## Decision

Scope the production hardening initiative to strictly infrastructure fixes — no new features, no new endpoints, no API surface changes. All 10 todos harden existing paths that were identified as gaps during load testing analysis.

## Alternatives considered

1. **Bundle with feature work** (e.g., gemma4 model switch, new advisory modes) — rejected because feature changes would obscure whether hardening actually improved stability
2. **Phased rollout** (ship Caddy fix first, then executor, then rate limit) — rejected because the changes are independent, small, and testable in isolation. No benefit to sequential gating.
3. **Skip load test suite improvements** (just ship the config/code fixes) — rejected because the mock LLM lacks concurrency simulation, so we can't validate the hardening actually works

## Rationale

The analysis found 5 interacting bottleneck layers (Ollama GPU → ThreadPool → DB Pool → Rate Limiter → Caddy). Fixing one without the others may shift the bottleneck rather than eliminate it. Shipping all fixes together with a validation run (T209) is the only way to confirm the cascade is broken.
