# 0015 — DISCOVERY: C1 regression hidden in shadow.py router

**Date:** 2026-04-09
**Status:** resolved
**Phase:** /implement (T129 security review)
**Severity:** CRITICAL

## What we found

The T129 security review caught a CRITICAL regression that the original red team round 1 missed: `src/hr_advisory/api/routers/shadow.py:657-667` constructed `DelegateConfig(...)` with no `adapter=` and no `require_server_default=True`. Because `require_server_default` defaults `False`, `create_delegate` fell through to `_resolve_llm_settings_from_env()` which reads `OPENAI_API_KEY` / `OPENAI_BASE_URL` from `os.environ` — exactly the C1 multi-tenant leak pattern that T113 was supposed to eliminate.

## Why we missed it during planning

The original red team round 1 (4 specialists in parallel) focused exclusively on:

- T110-T112 legacy cleanup
- T113-T114 adapter seam in `arbor_loop.py` and `advisory.py`
- T115-T117 save/validate/init invariants

The shadow router was out of scope for the original specialists. The kaizen-specialist red team focused on `delegate/arbor_loop.py` and `advisory.py` only — it didn't enumerate every consumer of `DelegateConfig` in the codebase.

## Impact (had it shipped)

The shadow agent runs 100+ HRIS tool calls (all tenant-scoped write operations) per request. A BYOK Ollama company would have:

1. Its shadow-agent traffic billed to the server `OPENAI_API_KEY` (cost integrity broken)
2. Its requests routed through the server's OpenAI adapter, not its own Ollama endpoint (BYOK silently broken)
3. Its API key potentially leaked to other tenants via `os.environ.setdefault` mutation (the original C1 vector)

**BYOK + shadow agent would have been silently broken in production.**

## Fix applied

`src/hr_advisory/api/routers/shadow.py`:

1. Added `from hr_advisory.services.llm_config import build_adapter_from_context, build_llm_context`
2. Added explicit `company_id` check — refuses with HTTP 403 if no company-scoped session
3. Resolves `llm_context` via `build_llm_context(company_id, user_id)`
4. Builds adapter via `build_adapter_from_context(llm_context)`
5. Passes `adapter=adapter, require_server_default=True` into `DelegateConfig`

## Lesson

Red team rounds should enumerate **all consumers of the abstraction being changed**, not just the primary call site. For T113 (adapter seam), the right grep was:

```bash
rg "DelegateConfig\(" src/hr_advisory/
```

This would have caught `shadow.py:658` immediately. The original red team only inspected `advisory.py` because that's what the plan named explicitly. Lesson: red team should derive call-site lists from grep, not from the plan.

## How to apply this learning

For future plans involving abstraction changes:

- Add a "consumer enumeration" step to the red team prompt
- Grep for **constructor calls** of any modified class, not just the named call sites
- Verify EACH consumer respects the new contract (adapter required + require_server_default flag)

## Cross-reference

- Security review report: `04-validate/round-15-t129-security-review.md`
- Original red team round 1: `04-validate/round-14-ollama-todos-redteam.md`
- C1 fix journal: `journal/0010-RISK-multi-tenant-env-poisoning.md`
