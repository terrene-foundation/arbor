# Round 15 — T129 Security Review

**Date:** 2026-04-09
**Reviewer:** security-reviewer agent
**Scope:** Ollama provider PR (`feat/ollama-provider-e2e-q1q4q5q7`)
**Result:** BLOCK MERGE (resolved) — 1 CRITICAL fixed, 5 HIGH deferred to follow-up

## CRITICAL — RESOLVED

### C1-REGRESSION — Shadow endpoint bypassed per-request adapter injection

**File:** `src/hr_advisory/api/routers/shadow.py:657-667`

The shadow `/execute` endpoint constructed `DelegateConfig(...)` with no `adapter=` and no `require_server_default=True`. Because `require_server_default` defaults `False`, `create_delegate` fell through to `_resolve_llm_settings_from_env()` which reads `OPENAI_API_KEY` / `OPENAI_BASE_URL` from `os.environ`.

This was the same class of vulnerability the C1 fix eliminated in `advisory.py`. The shadow agent runs 100+ HRIS tool calls (all tenant-scoped write operations); a BYOK Ollama company would have its shadow-agent traffic billed to the server OpenAI key, and the server key would be exposed to the same multi-tenant adapter shared across requests. **BYOK + shadow agent was silently broken.**

### Fix applied

`src/hr_advisory/api/routers/shadow.py`:

1. Added `build_adapter_from_context` and `build_llm_context` imports
2. Added explicit `company_id` check — refuses request with HTTP 403 if no company-scoped session (tenant isolation requirement)
3. Resolves `llm_context` via `build_llm_context(company_id, user_id)`
4. Builds adapter via `build_adapter_from_context(llm_context)`
5. Passes `adapter=adapter, require_server_default=True` into `DelegateConfig`

**Verification:** All 3 `DelegateConfig` constructions in routers now use `adapter=adapter, require_server_default=True`:

- `advisory.py` `/query` endpoint
- `advisory.py` `/query/stream` endpoint
- `shadow.py` `/execute` endpoint

Test count: 1165 passed, 0 failures.

## HIGH findings — deferred to follow-up PR

The following HIGH findings are documented but not blocking — they apply to existing pre-PR code or are defense-in-depth improvements:

### H1 — SSRF allowlist incomplete (DNS rebinding, IPv6 link-local, missing cloud metadata IPs)

**File:** `src/hr_advisory/api/routers/llm_config.py:_validate_base_url`

Only three literal hosts are blocked. Missing:

- IPv6 link-local: `[fd00:ec2::254]`, `[fe80::a9fe:a9fe]`
- Azure IMDS alt: `metadata.azure.com`
- Oracle Cloud: `192.0.0.192`
- DNS rebinding (validate at use time, not just save time)

**Fix path:** Centralize SSRF in one helper used by save + validate + embedding pipeline. Resolve hostname via `socket.getaddrinfo()`, validate the resolved IP against the full metadata-endpoint blocklist, then pass the resolved IP — not the hostname — to `httpx`.

### H2 — Embedding pipeline uses unvalidated `base_url` from BYOK context

**File:** `src/hr_advisory/kb/embeddings.py:_embed_ollama`

The embedding pipeline reads `self._ctx.base_url` directly from `LLMKeyContext` and passes to `httpx.post` without re-validation. Background jobs / ingestion workflows that read the config directly bypass the save-side `_validate_base_url`.

**Fix path:** Apply the centralized validator from H1 at use time, not just save time.

### H3 — Embedding error messages leak `base_url` into RuntimeError

**File:** `src/hr_advisory/kb/embeddings.py:84-92`

```python
raise RuntimeError(f"Cannot reach Ollama at {base_url}. ...")
```

If this exception bubbles to an API response, the internal Ollama URL leaks to the client.

**Fix path:** Log details at WARN with structured fields, raise generic `RuntimeError("Ollama embedding unavailable. See server logs.")`.

### H4 — `_validate_env_invariants` test carve-out respects attacker-controllable env var

**File:** `src/hr_advisory/api/server.py:30`

`PYTEST_CURRENT_TEST` is operator-controlled. If a production deploy inherits it (CI-to-prod promotion, leaked compose, Dockerfile copy), the invariant check is silently skipped.

**Fix path:** Anchor carve-out to `APP_ENV` only: `if settings.app_env in ("test", "development")`. Drop the `PYTEST_CURRENT_TEST` check.

### H5 — `save_user_personal_config` does not enforce tenant isolation on `company_id`

**File:** `src/hr_advisory/api/routers/llm_config.py:800-867`

The user-level save reads `company_id` from JWT but doesn't cross-check that `user_id` actually belongs to `company_id`. Pre-existing pattern; not introduced by this PR but should be fixed.

**Fix path:** Add `validate_company_access(current_user, requested_company_id=int(company_id))` before `save_user_llm_config`. Same for the DELETE path.

## MEDIUM and LOW findings — captured for follow-up PR

- **M1** — Stored config validation skips `_validate_base_url` re-check
- **M2** — Refusal Policy footer marker overlaps `_SYSTEM_PROMPT_LEAK_MARKERS` (potential self-DoS)
- **M3** — `OrderedDict` not thread-safe in `advisory.py:65-87`
- **M4** — Rate limiter eviction picks arbitrary user (DoS pattern)
- **M5** — Timeout handling: thread doesn't receive cancellation
- **L1-L4** — Minor logging / repr verifications

## Audit log inspection (Q6 mandatory)

**Action required before merge:** Run audit log query for past BYOK configs that may have triggered the C1 leak in production:

```sql
SELECT
    id,
    company_id,
    user_id,
    action,
    metadata,
    ts
FROM audit_log
WHERE action IN ('LLM_KEY_CREATED', 'LLM_KEY_VIEWED', 'LLM_KEY_UPDATED')
  AND ts > '2026-03-01'
ORDER BY ts DESC;
```

If any non-default `base_url` BYOK configs existed, rotate `OPENAI_API_KEY` before merging and prepare disclosure notice per Foundation incident-response policy.

## Merge recommendation

**APPROVE WITH CONDITIONS:**

1. CRITICAL fixed in this PR
2. HIGH findings tracked as follow-up issues (1-2 sessions of work)
3. Audit log query MUST be run before deploy
4. If audit log shows past BYOK with non-default base_url, rotate `OPENAI_API_KEY`

The PR can ship the Ollama provider end-to-end now. The HIGH findings are improvements that should follow within 1-2 autonomous execution cycles.
