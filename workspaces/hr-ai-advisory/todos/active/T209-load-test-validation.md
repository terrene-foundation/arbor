# T209: Load test validation run (scenarios A-E)

**Implements:** `specs/load-testing.md` §Success Criteria
**Depends on:** T200-T208 (all hardening + mock improvements + tests)
**Risk:** Low (validation only, no code changes)

## Procedure

1. Start mock LLM server: `python tests/load/mock_llm_server.py`
2. Start backend: `uv run python -m hr_advisory.api.main` (with SQLite for local validation)
3. Run locust headless: `locust -f tests/load/locustfile.py --headless -u 10 -r 2 -t 2m`
4. Verify success criteria from spec

## Success criteria checklist

- [ ] `/advisory/query` p95 < 45s with 4 concurrent advisory users (mock at 4 concurrency)
- [ ] `/advisory/query` returns 429 or timeout (not 500) when rate limited
- [ ] CRUD endpoints maintain p95 < 500ms during peak advisory load
- [ ] `/health` returns 200 in < 5s during load
- [ ] Single user cannot fire > 5 advisory queries per minute (advisory-specific rate limit)
- [ ] SSE stream completes without premature disconnect (mock test)
- [ ] No Python tracebacks in backend stdout during load test

## If validation fails

- Document the failure in `04-validate/` with the locust report
- Create follow-up todos for specific failures
- Do NOT ship hardening changes that make things worse

## Output

- Locust HTML report saved to `tests/load/reports/`
- Success criteria checklist with pass/fail per item
