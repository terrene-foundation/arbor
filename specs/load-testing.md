# Load Testing Specification

## Objective

Validate Arbor advisory platform under realistic load to find the concurrency ceiling, identify failure cascades, and verify graceful degradation.

## Architecture Constraints (from analysis)

| Bottleneck          | Default                 | Ceiling                        | Failure Mode                               |
| ------------------- | ----------------------- | ------------------------------ | ------------------------------------------ |
| Ollama GPU slots    | `OLLAMA_NUM_PARALLEL=1` | 1-4 (VRAM-dependent)           | Requests queue at Ollama; latency explodes |
| ThreadPoolExecutor  | 8 threads (4-core)      | 8 concurrent `/advisory/query` | 9th request blocks; timeout cascades       |
| DataFlow pool       | 10 connections          | 10 concurrent DB ops           | 5s connect timeout, then failure           |
| Rate limiter        | 30 req/60s/user         | Treats all endpoints equally   | Single user can monopolize GPU             |
| Conversation memory | 10K per instance        | ~20MB RAM                      | LRU eviction on overflow                   |
| Nexus global rate   | 100 req/s               | All endpoints share            | Shared cap across CRUD + advisory          |

### Realistic Concurrent Capacity (4-core + 1 T4 16GB GPU)

| Endpoint                | Concurrent Users | Bottleneck                           |
| ----------------------- | ---------------- | ------------------------------------ |
| `/advisory/query`       | 3-4              | Ollama GPU (multi-turn tool calling) |
| `/advisory/stream`      | 4-6              | Ollama GPU (async, no thread pool)   |
| `/shadow/execute`       | 4-6              | Ollama GPU (async)                   |
| `/shadow/context`       | 50+              | Deterministic, no LLM                |
| CRUD (employees, leave) | 100+             | DB pool                              |
| Auth (login, refresh)   | 100+             | bcrypt CPU                           |
| **Blended**             | **8-12**         | GPU is the hard ceiling              |

### Endpoint Concurrency Asymmetry

- `/advisory/query` — sync via `run_in_executor(None, ...)`, consumes thread pool slot, 60s timeout
- `/advisory/stream` — native async, does NOT consume thread pool slot, no hard timeout
- `/shadow/execute` — native async, no timeout (only max_turns=30 cap)
- `/shadow/context` — deterministic, no LLM call at all

## Mock LLM Server

### Endpoints

| Endpoint                    | Protocol      | Purpose                                                |
| --------------------------- | ------------- | ------------------------------------------------------ |
| `POST /api/chat`            | Ollama NDJSON | Primary — kaizen-agents OllamaStreamAdapter calls this |
| `GET /api/tags`             | Ollama JSON   | Model discovery — ollama_health.py checks this         |
| `POST /api/embeddings`      | Ollama JSON   | Embedding requests — returns deterministic vectors     |
| `POST /v1/chat/completions` | OpenAI SSE    | Fallback — for BYOK/vLLM users                         |

### Required Improvements

1. **Concurrency limiter** — `asyncio.Semaphore(MOCK_LLM_MAX_CONCURRENT)` to simulate GPU slot contention. Default: 4.
2. **Tool-call simulation** — First response returns a tool_call (search_kb), second returns text. Exercises the full Delegate multi-turn loop.
3. **Cold start simulation** — Configurable delay on first request after N seconds idle.

## Test Scenarios

### Scenario A: Baseline (validates system works)

- 10 concurrent users, 1 advisory query every 10s
- Duration: 5 minutes
- Success: p95 < 30s, zero 500s, zero non-429 errors

### Scenario B: GPU Saturation

- Ramp 5 → 20 advisory-only users over 5 minutes
- Mock LLM concurrency: 4
- Success: identify exact point where p95 > 45s; CRUD stays < 500ms p95

### Scenario C: Thread Pool Exhaustion

- 10 concurrent `/advisory/query` users (exceeds 8-thread pool)
- Simultaneously 10 CRUD users
- Success: advisory returns 429 or timeout (NOT 500); CRUD p95 < 500ms

### Scenario D: Mixed Realistic

- 50 users: 70% CRUD, 20% advisory, 10% shadow
- Duration: 15 minutes
- Success: steady-state with no memory growth, no 500s, health check always passes

### Scenario E: Rate Limit Enforcement

- 5 users sending 5 req/s each (exceeds 30/60s)
- Success: 429 responses after 30 requests per user per window

### Scenario F: Cold Start

- System idle for configurable period
- 1 advisory query
- Success: completes within 60s (including model load)

### Scenario G: Conversation Overflow

- Create 10,001 conversations rapidly
- Success: oldest evicted, no memory error, rehydration from DB works

## Success Criteria

- [ ] `/advisory/query` p95 < 45s with 4 concurrent advisory users (mock at 4 concurrency)
- [ ] `/advisory/query` returns 429 or timeout (not 500) when thread pool saturated
- [ ] CRUD endpoints maintain p95 < 500ms during peak advisory load
- [ ] `/health` returns 200 in < 5s during peak load
- [ ] No MemoryError after 10K conversations
- [ ] Single user cannot fire > 5 advisory queries per minute (advisory-specific rate limit)
- [ ] SSE stream completes without premature disconnect

## Locust User Classes

| Class          | Weight | Wait Time | Endpoints                                                              |
| -------------- | ------ | --------- | ---------------------------------------------------------------------- |
| `AdvisoryUser` | 3      | 5-15s     | `/advisory/query`, `/advisory/stream`, `/advisory/conversations`       |
| `ShadowUser`   | 2      | 3-10s     | `/shadow/context`, `/shadow/execute`, `/shadow/history`                |
| `CrudUser`     | 4      | 1-5s      | `/employees`, `/employees/me`, `/employees/me/leave`, `/health`, `/me` |
| `AuthUser`     | 1      | 2-8s      | `/login`, `/refresh`, `/logout`, `/register`                           |
