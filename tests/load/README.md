# Arbor Load Testing Suite

Load tests for the Arbor HRIS advisory platform using [Locust](https://locust.io).

## Setup

```bash
# Install dependencies (from project root)
uv pip install -e ".[dev]"

# Start the mock LLM server (replaces real Ollama to isolate infra from GPU)
uv run python tests/load/mock_llm_server.py
# Runs on port 11434 (same as Ollama default)

# Start Arbor backend (picks up mock via OLLAMA_BASE_URL in .env)
uv run python -m hr_advisory.api.server
```

## Running Tests

```bash
# Web UI (recommended for first run)
uv run locust -f tests/load/locustfile.py --host http://localhost:8000

# Headless (CI-friendly)
uv run locust -f tests/load/locustfile.py \
  --host http://localhost:8000 \
  --headless \
  --users 50 \
  --spawn-rate 5 \
  --run-time 5m \
  --csv results/load
```

## Test Scenarios

| Scenario        | Class          | Weight | Description                                           |
| --------------- | -------------- | ------ | ----------------------------------------------------- |
| Advisory Query  | `AdvisoryUser` | 3      | POST /advisory/query with SG employment law questions |
| Advisory Stream | `AdvisoryUser` | 1      | POST /advisory/stream SSE                             |
| Shadow Context  | `ShadowUser`   | 2      | GET /shadow/context for various pages                 |
| Shadow Execute  | `ShadowUser`   | 1      | POST /shadow/execute commands                         |
| CRUD Mix        | `CrudUser`     | 4      | Employee list, leave, claims, payroll reads           |
| Auth Flow       | `AuthUser`     | 1      | Login + /me + refresh cycle                           |

## Scenarios

- **Scenario A (Baseline)**: 10 users, 5 min — validates system works under light load
- **Scenario B (Saturation)**: Ramp 10->100 over 10 min — finds the thread pool ceiling
- **Scenario C (Mixed Realistic)**: 50 users, 70% CRUD / 20% advisory / 10% shadow — closest to production
- **Scenario D (Rate Limit)**: 5 users sending 5 req/s each — validates 429 enforcement

## Mock LLM Server

`mock_llm_server.py` is a minimal FastAPI app that mimics both Ollama native
(`/api/chat`, `/api/tags`, `/api/embeddings`) and OpenAI-compatible (`/v1/chat/completions`)
endpoints with configurable latency (default 2-5s random). This isolates load testing
from real GPU inference costs and contention.

Environment variables:

| Variable               | Default        | Description                      |
| ---------------------- | -------------- | -------------------------------- |
| `MOCK_LLM_PORT`        | `11434`        | Port (matches Ollama default)    |
| `MOCK_LLM_LATENCY_MIN` | `2.0`          | Minimum response delay (seconds) |
| `MOCK_LLM_LATENCY_MAX` | `5.0`          | Maximum response delay (seconds) |
| `MOCK_LLM_MODEL`       | `qwen3:latest` | Model name returned in responses |

## Metrics to Watch

- p50/p95/p99 response time per endpoint
- Error rate (non-429 errors)
- 429 rate (rate limit enforcement)
- Requests/second achieved before degradation
