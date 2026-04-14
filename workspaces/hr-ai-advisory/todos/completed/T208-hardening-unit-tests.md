# T208: Unit tests for all hardening changes

**Files:** `tests/unit/test_production_hardening.py`
**Risk:** Low
**Depends on:** T201, T202, T203, T204

## Tests to write

### LLM executor (T201)

```python
def test_advisory_uses_dedicated_executor():
    """Verify _LLM_EXECUTOR is used, not default executor."""
    from hr_advisory.api.routers.advisory import _LLM_EXECUTOR
    assert _LLM_EXECUTOR is not None
    assert _LLM_EXECUTOR._max_workers == 4
    assert _LLM_EXECUTOR._thread_name_prefix == "arbor-llm"
```

### Advisory rate limit (T202)

```python
def test_advisory_rate_limit_5_per_window():
    """Advisory-specific limit is 5 per window, not the default 30."""
    from hr_advisory.workflows.guardrails import check_rate_limit
    user = "test-rate-limit-advisory"
    for i in range(5):
        assert check_rate_limit(user, max_requests=5) is True
    assert check_rate_limit(user, max_requests=5) is False

def test_default_rate_limit_unchanged():
    """Default rate limit remains 30 for non-advisory endpoints."""
    from hr_advisory.workflows.guardrails import check_rate_limit
    user = "test-rate-limit-default"
    for i in range(30):
        assert check_rate_limit(user) is True
    assert check_rate_limit(user) is False
```

### Health DB probe (T203)

```python
@pytest.mark.asyncio
async def test_health_returns_503_on_db_failure():
    """Health endpoint returns 503 when DB is unreachable."""
    # Mock the DB connection to raise, verify 503 response

@pytest.mark.asyncio
async def test_health_returns_200_on_db_success():
    """Health endpoint returns 200 with db=ok when DB is healthy."""
```

### Shadow timeout (T204)

```python
@pytest.mark.asyncio
async def test_shadow_execute_timeout():
    """Shadow execute returns degraded response on timeout."""
```

### Backward compatibility regression (R1 resolved)

```python
@pytest.mark.regression
def test_check_rate_limit_backward_compat():
    """Regression: existing callers with no max_requests param still work at 30/window."""
    from hr_advisory.workflows.guardrails import check_rate_limit
    user = "test-backward-compat"
    # Old signature: check_rate_limit(user_id) — no max_requests
    assert check_rate_limit(user) is True  # must not raise TypeError
```

## Verification

- `pytest tests/unit/test_production_hardening.py -v` passes all tests
- Each hardening change has at least one test
