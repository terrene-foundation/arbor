# T205: Docker Compose production hardening

**Implements:** `specs/production-hardening.md` §1, §5
**Files:** `deploy/docker-compose.prod.yml`
**Risk:** Low (config only, no code changes)
**Invariants:** 0 load-bearing logic (pure config)

## Problem

The production Docker Compose is missing: Ollama config, DB pool env, Redis tuning, resource limits. These are all config gaps that cause silent degradation under load.

## Implementation

### Backend environment additions

```yaml
- DATAFLOW_MAX_CONNECTIONS=30
- OLLAMA_HOST=${OLLAMA_HOST:-http://ollama:11434}
```

### Backend resource limits

```yaml
deploy:
  resources:
    limits: { cpus: "2", memory: "2G" }
    reservations: { cpus: "0.5", memory: "512M" }
```

### Redis tuning

```yaml
command: >
  redis-server --requirepass ${REDIS_PASSWORD}
  --maxmemory 256mb --maxmemory-policy allkeys-lru --appendonly yes
```

### Ollama service (no GPU on GCE — use Docker profile)

GCE prod does NOT have GPU passthrough. Ollama is placed under a `gpu` Docker profile so it only starts when explicitly requested (`docker compose --profile gpu up`). Production advisory uses BYOK provider set in company settings (OpenAI/Anthropic/Gemini). Ollama runs on DGX staging or local dev with GPU.

```yaml
ollama:
  image: ollama/ollama:latest
  container_name: arbor-ollama
  profiles: ["gpu"]
  environment:
    - OLLAMA_NUM_PARALLEL=4
    - OLLAMA_MAX_LOADED_MODELS=1
    - OLLAMA_KEEP_ALIVE=30m
    - OLLAMA_MAX_QUEUE=8
  volumes:
    - arbor_ollama:/root/.ollama
  deploy:
    resources:
      reservations:
        devices:
          - driver: nvidia
            count: 1
            capabilities: [gpu]
  restart: unless-stopped
```

Backend `OLLAMA_HOST` defaults to empty (not http://ollama:11434) so advisory gracefully falls back to BYOK when Ollama is not running:

```yaml
- OLLAMA_HOST=${OLLAMA_HOST:-}
```

Add `arbor_ollama` to volumes section.

### Graceful shutdown (GAP-3 resolved)

Add `stop_grace_period: 30s` to backend service. Uvicorn handles SIGTERM gracefully by default — it finishes in-flight requests before shutting down. The 30s grace period covers the 15-45s advisory response window.

```yaml
backend:
  stop_grace_period: 30s
```

### Redis pool sizing (GAP-5 resolved)

The Redis image default connection limit is fine, but add `maxclients` for defense:

```yaml
command: >
  redis-server --requirepass ${REDIS_PASSWORD}
  --maxmemory 256mb --maxmemory-policy allkeys-lru --appendonly yes
  --maxclients 100
```

### Uvicorn workers (GAP-1 revision)

Add `UVICORN_WORKERS` env var to backend. Default 2 on GCE (4-core). A single worker means one blocked executor call stalls the event loop for all endpoints.

```yaml
- UVICORN_WORKERS=${UVICORN_WORKERS:-2}
```

The backend entrypoint must respect this var (check `main.py` / Dockerfile CMD).

### Ollama healthcheck (GAP-7 revision)

```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:11434/api/tags"]
  interval: 30s
  timeout: 10s
  retries: 3
```

### OpenAI defaults — keep as fallback (R5 revision)

Keep `OPENAI_PROD_MODEL` and `DEFAULT_LLM_MODEL` env vars but change defaults to empty string (not hardcoded model). If Ollama GPU passthrough fails, operators can set these to restore OpenAI fallback without rebuilding.

```yaml
- OPENAI_PROD_MODEL=${OPENAI_PROD_MODEL:-}
- DEFAULT_LLM_MODEL=${DEFAULT_LLM_MODEL:-}
```

## Verification

- `grep "DATAFLOW_MAX_CONNECTIONS" deploy/docker-compose.prod.yml` returns a match
- `grep "ollama:" deploy/docker-compose.prod.yml` returns a match
- `grep "maxmemory" deploy/docker-compose.prod.yml` returns a match
- `grep "UVICORN_WORKERS" deploy/docker-compose.prod.yml` returns a match
- `grep "gpt-5-mini" deploy/docker-compose.prod.yml` returns zero matches (no hardcoded model default)
