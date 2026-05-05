# T207: Additional load test scenarios

**Implements:** `specs/load-testing.md` §Test Scenarios
**Files:** `tests/load/locustfile.py`
**Risk:** Low (test infrastructure only)
**Invariants:** 2 (SSE scenario exists, cold start scenario exists)

## Problem

The current locustfile has 4 user classes but is missing key scenarios identified in analysis: SSE durability, cold start, and conversation overflow tests.

## Implementation

### SSE durability task

Add a task to `AdvisoryUser` that opens an SSE connection to `/advisory/stream` and verifies the stream completes without premature disconnect. Use locust's `self.client` with `stream=True` and assert the final chunk arrives.

### Cold start task

Add a standalone task (low weight) that waits for configurable idle period, then fires one advisory query and measures total latency including model load.

### Conversation overflow task

Add a task to `AdvisoryUser` that rapidly creates conversations (hitting the 10K LRU boundary) and verifies no memory errors.

### SSE reconnection after backend health failure (GAP-4 resolved)

Add a task that kills and restarts the mock backend mid-stream to verify the SSE client (locust) detects the disconnect and can reconnect. This validates that Caddy's upstream health check (T200) correctly removes/restores the backend and that clients don't hang on dead connections.

### Scenario configuration

Add environment variable support for scenario selection:

- `LOCUST_SCENARIO=baseline` (default — mixed traffic)
- `LOCUST_SCENARIO=gpu_saturation` (advisory-only, ramp 5-20)
- `LOCUST_SCENARIO=thread_exhaustion` (10 advisory + 10 CRUD)

## Verification

- `grep "stream" tests/load/locustfile.py` returns SSE-related matches
- `grep "LOCUST_SCENARIO" tests/load/locustfile.py` returns scenario config matches
