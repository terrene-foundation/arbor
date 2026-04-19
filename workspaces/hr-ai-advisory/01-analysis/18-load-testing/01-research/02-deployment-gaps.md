# Deployment Gap Analysis — Production Readiness

## Priority Summary

| #   | Gap                                     | Severity | Impact                        |
| --- | --------------------------------------- | -------- | ----------------------------- |
| 1   | Single uvicorn worker                   | CRITICAL | Blocks all concurrency        |
| 2   | No Docker resource limits               | CRITICAL | OOM crashes entire stack      |
| 3   | Caddy SSE path mismatch                 | HIGH     | Streaming broken in prod      |
| 4   | Redis no maxmemory                      | HIGH     | Unbounded memory growth       |
| 5   | DATAFLOW_MAX_CONNECTIONS not in compose | HIGH     | Falls back to 10              |
| 6   | No Caddy upstream health checks         | HIGH     | Routes to crashed backend     |
| 7   | Ollama not in compose stack             | HIGH     | No GPU container management   |
| 8   | No advisory-specific rate limit         | HIGH     | Single user monopolizes GPU   |
| 9   | No K8s HPA                              | MEDIUM   | Cannot scale beyond 1 pod     |
| 10  | No K8s startupProbe                     | MEDIUM   | Cold start kills pod          |
| 11  | PostgreSQL not tuned                    | MEDIUM   | Default shared_buffers        |
| 12  | No pool_timeout on DataFlow             | MEDIUM   | Infinite wait on pool exhaust |

## Load Test Suite Gaps

| Gap                                | Impact                                              |
| ---------------------------------- | --------------------------------------------------- |
| Mock doesn't limit concurrency     | Can't test GPU saturation                           |
| No tool-calling simulation         | Mock returns plain text; real queries do 3-4 turns  |
| No thread pool exhaustion scenario | Can't validate CRUD stays responsive                |
| No cold start test                 | Can't measure first-request-after-idle latency      |
| No SSE durability test             | Can't validate stream stays alive for full response |
| No conversation overflow test      | Can't validate 10K LRU eviction                     |
| Auth weight too low                | Can't test bcrypt CPU contention                    |
