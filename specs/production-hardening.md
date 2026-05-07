# Production Hardening Specification

> **Translation note (2026-05-07).** This spec was authored against the now-removed `docker-compose.prod.yml` / Caddy / GCE deploy path that never actually existed. The **app-level items** (§ 2 dedicated LLM executor, § 3 advisory rate limit, § 6 DataFlow pool timeout, § 7 health DB probe, § 8 shadow execute timeout) translate directly to the K8s deploy and remain authoritative. The **infrastructure items** (§ 1 Ollama env vars, § 4 Caddy SSE path, § 5 docker-compose gaps, § 11 Ollama in compose) need to be re-expressed as K8s `Deployment` env vars / `ConfigMap` / ingress annotations against the live cluster. The priority order table at the bottom references `deploy/Caddyfile` and `deploy/docker-compose.prod.yml` which no longer exist; map each row to the corresponding K8s manifest before action.

## Objective

Fix infrastructure gaps discovered during load testing analysis to achieve stable operation under realistic concurrent load (8-12 users, 3-4 in active advisory).

## 1. Ollama Configuration

### Current: Not configured (defaults to serial inference)

### Target: Parallel inference matching thread pool

```bash
OLLAMA_NUM_PARALLEL=4          # Match LLM executor thread count
OLLAMA_MAX_LOADED_MODELS=1     # Only advisory model, prevent swap thrashing
OLLAMA_KEEP_ALIVE=30m          # Prevent cold starts during business hours
OLLAMA_MAX_QUEUE=8             # Reject rather than queue infinitely
```

Add Ollama to `docker-compose.prod.yml` with GPU reservation.

## 2. Dedicated LLM ThreadPoolExecutor

### Current: `loop.run_in_executor(None, ...)` — shares default executor with all async ops

### Target: Dedicated bounded executor for LLM calls

In `advisory.py` (module level):

```python
_LLM_EXECUTOR = concurrent.futures.ThreadPoolExecutor(
    max_workers=4,  # Match OLLAMA_NUM_PARALLEL
    thread_name_prefix="arbor-llm",
)
```

Replace `run_in_executor(None, ...)` with `run_in_executor(_LLM_EXECUTOR, ...)`.
This frees the default executor for non-LLM async operations (DB, briefing, nudges).

## 3. Advisory-Specific Rate Limit

### Current: 30 req/60s for ALL endpoints equally

### Target: Separate tighter limit for LLM-consuming endpoints

```python
_ADVISORY_MAX_PER_WINDOW = 5   # 5 advisory queries per 60s per user
```

With 15-30s response times, users physically can't exceed 2-4/min in normal use.
Prevents a single user from monopolizing GPU capacity with burst requests.

## 4. Caddy SSE Path Fix

### Current: `handle /advisory/stream*` — never matches (actual path is `/api/advisory/stream*`)

### Target: Correct path matching

```
handle /api/advisory/stream* {
    uri strip_prefix /api
    reverse_proxy backend:8000 {
        flush_interval -1
        transport http {
            read_timeout 300s
        }
    }
}
```

Also add upstream health checks:

```
reverse_proxy backend:8000 {
    health_uri /health
    health_interval 10s
    health_timeout 5s
}
```

## 5. Docker Compose Production Gaps

### DATAFLOW_MAX_CONNECTIONS

Add to backend environment: `DATAFLOW_MAX_CONNECTIONS=30`

### Resource Limits

```yaml
backend:
  deploy:
    resources:
      limits: { cpus: "2", memory: "2G" }
      reservations: { cpus: "0.5", memory: "512M" }
```

### Redis Tuning

```yaml
redis:
  command: >
    redis-server --requirepass ${REDIS_PASSWORD}
    --maxmemory 256mb --maxmemory-policy allkeys-lru --appendonly yes
```

### Ollama Container

Add ollama service with GPU reservation, model volume, and env vars.

## 6. DataFlow Pool Timeout

### Current: No pool_timeout — waits indefinitely for a connection

### Target: Fail fast after 10 seconds

```python
config=DataFlowConfig(
    database_url=_url,
    connect_timeout_secs=5,
    max_lifetime_secs=3600,
    pool_timeout_secs=10,  # fail fast
)
```

## 7. Health Endpoint Database Probe

### Current: Reports healthy without checking DB (fake health)

### Target: Probe DB connection in health check

The health endpoint must `SELECT 1` against PostgreSQL. If the DB is down, health must return 503, not 200. This prevents the Caddy SSE path mismatch scenario where the proxy routes to a backend that can't serve any DB-dependent request.

## 8. Shadow Execute Timeout

### Current: No timeout — only max_turns=30 cap

### Target: 60s timeout matching advisory query

Wrap `shadow/execute` delegate loop in `asyncio.wait_for(timeout=60.0)`.

## Priority Order

| #   | Change                       | Files                                             | Risk                              |
| --- | ---------------------------- | ------------------------------------------------- | --------------------------------- |
| 1   | SSE path fix on ingress      | K8s ingress (`/api/advisory/stream*` annotations) | Low (config only)                 |
| 2   | Dedicated LLM executor       | `advisory.py`                                     | Low (isolated change)             |
| 3   | Advisory rate limit          | `guardrails.py`, `advisory.py`, `shadow.py`       | Low                               |
| 4   | Mock LLM concurrency limiter | `tests/load/mock_llm_server.py`                   | Low (test only)                   |
| 5   | DATAFLOW_MAX_CONNECTIONS     | K8s backend Deployment env / ConfigMap            | Low (config only)                 |
| 6   | Redis tuning                 | K8s redis Deployment / ConfigMap                  | Low (config only)                 |
| 7   | Health DB probe              | `platform.py` or health handler                   | Medium                            |
| 8   | Shadow execute timeout       | `shadow.py`                                       | Medium                            |
| 9   | DataFlow pool timeout        | `database.py`                                     | Medium (needs DataFlow API check) |
| 10  | Resource limits              | K8s backend Deployment `resources:` block         | Low (config only)                 |
| 11  | Ollama configuration         | K8s ollama Deployment env + GPU reservation       | Medium (GPU config)               |
