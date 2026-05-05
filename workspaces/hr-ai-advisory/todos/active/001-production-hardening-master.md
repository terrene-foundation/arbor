# Production Hardening — Master Index

**Workspace:** `hr-ai-advisory`
**Specs:** `specs/production-hardening.md`, `specs/load-testing.md`
**Analysis:** `01-analysis/18-load-testing/`
**Estimated:** 1 autonomous session (all changes are bounded, low-risk infrastructure)

## Goal

Fix infrastructure gaps discovered during load testing analysis to achieve stable operation under realistic concurrent load (8-12 users, 3-4 in active advisory). No new features — strictly hardening existing paths.

## Topology (dependency order)

```
T200 (Caddy fix) ──────────┐
T201 (LLM executor) ───────┤
T202 (advisory rate limit) ─┼──> T208 (unit tests) ──> T209 (load test validation)
T203 (health DB probe) ─────┤
T204 (timeouts) ────────────┤
T205 (docker compose) ──────┘
T206 (mock LLM improvements) ──> T209 (load test validation)
T207 (load test scenarios) ─────> T209 (load test validation)
```

T200-T205 are independent of each other (parallel). T206-T207 are independent of T200-T205. T208 depends on T200-T205. T209 depends on all.

## Todos

| ID   | Milestone | Title                                           | Spec Reference                    |
| ---- | --------- | ----------------------------------------------- | --------------------------------- |
| T200 | M60       | Fix Caddy SSE path + add upstream health checks | production-hardening.md §4        |
| T201 | M60       | Dedicated LLM ThreadPoolExecutor                | production-hardening.md §2        |
| T202 | M60       | Advisory-specific rate limit (5/60s for LLM)    | production-hardening.md §3        |
| T203 | M60       | Health endpoint DB probe (replace fake health)  | production-hardening.md §7        |
| T204 | M60       | Shadow timeout + DataFlow pool timeout          | production-hardening.md §6, §8    |
| T205 | M60       | Docker Compose production hardening             | production-hardening.md §1, §5    |
| T206 | M61       | Mock LLM concurrency limiter + tool-call sim    | load-testing.md §Mock LLM         |
| T207 | M61       | Additional load test scenarios                  | load-testing.md §Test Scenarios   |
| T208 | M62       | Unit tests for all hardening changes            | —                                 |
| T209 | M62       | Load test validation run (scenarios A-E)        | load-testing.md §Success Criteria |

## Cross-cutting rules

- **No new features** — every change hardens an existing path
- **Config changes commit separately** from logic changes for clean revert
- **Zero-tolerance Rule 1** — any pre-existing failures found during implementation are fixed
- **Spec update** — if implementation deviates from spec, update `specs/production-hardening.md` immediately

## External dependencies (NOT code todos)

- **Model decision**: gemma4 vs qwen3 (thinking disabled) — ops decision, not a code change
- **San blockers**: PVC StorageClass, kubectl in jumper, Cloudflare timeout — infrastructure owned by partner
- **Deploy**: after all todos complete, build + deploy new Docker image

## Red team round 1 (2026-04-14)

Two analyst agents reviewed the plan in parallel: one for gaps, one for risks. Findings: **1 CRITICAL gap, 2 HIGH gaps, 1 CRITICAL risk, 2 HIGH risks, 3 MEDIUM, 2 LOW**.

### Applied revisions

| Finding                               | Severity | Applied to | Change                           |
| ------------------------------------- | -------- | ---------- | -------------------------------- |
| GAP-1: Single uvicorn worker          | CRITICAL | T205       | Added UVICORN_WORKERS env var    |
| GAP-6: Mock LLM latency unrealistic   | LOW      | T206       | Added configurable latency range |
| GAP-7: No Ollama health probe         | LOW      | T205       | Added Ollama healthcheck         |
| R3: Custom /health override mechanism | HIGH     | T203       | Added override verification note |
| R4: Executor workers undersized       | MEDIUM   | T201       | Made configurable via env var    |
| R5: Removing OpenAI defaults risky    | MEDIUM   | T205       | Keep as empty-default fallback   |
| R6: Caddy reload drops connections    | LOW      | T200       | Added graceful reload note       |

### All findings resolved (zero accepted risks)

| Finding | Severity | Resolved in | Resolution                                                      |
| ------- | -------- | ----------- | --------------------------------------------------------------- |
| GAP-2   | HIGH     | T205        | False positive — already sets OLLAMA_NUM_PARALLEL=4             |
| GAP-3   | HIGH     | T205        | Added `stop_grace_period: 30s` (uvicorn handles SIGTERM)        |
| GAP-4   | MEDIUM   | T207        | Added SSE reconnection test scenario                            |
| GAP-5   | MEDIUM   | T205        | Added Redis `--maxclients 100`                                  |
| R1      | CRITICAL | T208        | Added backward-compat regression test                           |
| R2      | HIGH     | T204        | Verified `pool_timeout` exists in DataFlow 2.0.7 DatabaseConfig |

### Architecture decision: No GPU on GCE

GCE prod does NOT have GPU passthrough. Ollama service is under Docker `profiles: ["gpu"]` — only starts with `docker compose --profile gpu up`. Production advisory uses BYOK provider from company settings. Ollama for local dev and DGX staging only.

## Approval gate — APPROVED (user directive: implement all, no deferments)
