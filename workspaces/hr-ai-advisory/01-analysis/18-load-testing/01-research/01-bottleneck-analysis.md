# Bottleneck Analysis — Arbor Advisory Under Load

## Bottleneck Interaction Map

Five bottleneck layers interact and cascade:

```
User Request → Caddy (100 req/s) → Rate Limiter (30/min/user)
    → ThreadPoolExecutor (8 threads) → Ollama GPU (1-4 parallel slots)
    → DataFlow Pool (10-30 connections) → PostgreSQL
```

## B1: Ollama GPU (Primary Bottleneck)

- Default: `OLLAMA_NUM_PARALLEL=1` (serial inference)
- qwen3:latest ~4GB VRAM + KV cache per slot
- Each advisory query = 2-6 LLM round-trips (tool calling)
- One query occupies a GPU slot for 10-40 seconds
- Cold start: 2-5s model load after 5min idle

| GPU VRAM | Parallel Slots | Concurrent Advisory Users |
| -------- | -------------- | ------------------------- |
| 8 GB     | 1-2            | 1                         |
| 16 GB    | 2-4            | 2-3                       |
| 24 GB    | 3-6            | 3-4                       |

## B2: ThreadPoolExecutor (Secondary Bottleneck)

- `/advisory/query` uses `loop.run_in_executor(None, ...)` — default executor
- Default: `min(32, os.cpu_count() + 4)` = 8 threads on 4-core
- `/shadow/execute` uses native async (does NOT consume thread pool)
- `/shadow/context` is deterministic (no LLM)

## B3: DB Pool (Tertiary)

- Default: 10 connections (env `DATAFLOW_MAX_CONNECTIONS`)
- Each advisory query: 2-3 DB reads before LLM + 1-2 writes after
- CRUD ops: fast (<50ms) but high volume

## B4: Rate Limiter (Per-Process)

- 30 req/60s per user — treats all endpoints equally
- A single user can fire 30 advisory queries in 60s, exhausting all threads
- In-memory, lost on restart, not shared across workers

## Failure Cascade

1. **GPU saturates** (3-5 advisory users) → latency 5-15s → 30-50s
2. **Thread pool exhausts** (6-8 advisory users) → new queries block
3. **Timeouts fire** (8+ users) → 60s timeout, error persist blocks DB pool
4. **Health check fails** → Caddy marks backend unhealthy
5. **Total outage** → all advisory + shadow + briefing fail

## Realistic Capacity (4-core + 1 T4 GPU)

| Endpoint           | Concurrent Users | Bottleneck                         |
| ------------------ | ---------------- | ---------------------------------- |
| `/advisory/query`  | 3-4              | Ollama GPU                         |
| `/advisory/stream` | 4-6              | Ollama GPU (async, no thread pool) |
| `/shadow/execute`  | 4-6              | Ollama GPU (async)                 |
| `/shadow/context`  | 50+              | Deterministic                      |
| CRUD endpoints     | 100+             | DB pool                            |
| Auth endpoints     | 100+             | bcrypt CPU                         |

**Blended**: 8-12 concurrent active users, 3-4 in active advisory.

## Live Bug: Caddy SSE Path Mismatch

The Caddyfile has `handle /advisory/stream*` but the actual request path is `/api/advisory/stream`. The SSE-specific 300s timeout never matches. Streams go through the generic handler with default ~30s timeout.
