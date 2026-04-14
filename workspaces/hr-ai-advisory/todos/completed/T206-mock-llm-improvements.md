# T206: Mock LLM concurrency limiter + tool-call simulation

**Implements:** `specs/load-testing.md` §Mock LLM Required Improvements
**Files:** `tests/load/mock_llm_server.py`
**Risk:** Low (test infrastructure only)
**Invariants:** 3 (concurrency limiter, tool-call sim, cold start sim)

## Problem

The mock LLM server returns instant responses with no concurrency limiting. This means load tests can't simulate GPU saturation (the primary bottleneck) or multi-turn tool calling (the real advisory flow).

## Implementation

### 1. Concurrency limiter

Add `asyncio.Semaphore(MOCK_LLM_MAX_CONCURRENT)` (default 4) to simulate GPU slot contention. Requests beyond the limit queue, matching real Ollama behavior.

### 2. Tool-call simulation

First response to any conversation returns a tool_call (`search_kb`), second response returns text. This exercises the full Delegate multi-turn loop:

```python
# First response: tool call
{"message": {"role": "assistant", "tool_calls": [{"function": {"name": "search_kb", "arguments": {"query": "..."}}}]}}

# Second response (after tool result): text
{"message": {"role": "assistant", "content": "Based on the Employment Act..."}}
```

Track conversation state via a simple counter keyed on the messages list length.

### 3. Configurable latency (GAP-6 revision)

Add configurable latency range: `MOCK_LLM_LATENCY_MIN_S` (default 2.0) and `MOCK_LLM_LATENCY_MAX_S` (default 8.0). Each response waits a random duration in this range to simulate real Ollama inference time (15-45s in production, but scaled down for mock testing).

### 4. Cold start simulation

Configurable delay (`MOCK_COLD_START_DELAY_S`, default 3.0) on first request after `MOCK_IDLE_THRESHOLD_S` seconds idle. Simulates Ollama model loading.

## Verification

- `grep "Semaphore" tests/load/mock_llm_server.py` returns a match
- `grep "tool_calls" tests/load/mock_llm_server.py` returns a match
- Mock server handles concurrent requests with visible queuing behavior
