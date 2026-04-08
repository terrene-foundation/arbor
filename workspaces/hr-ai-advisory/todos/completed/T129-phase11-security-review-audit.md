# T129 — Phase 11: Security review + audit log inspection (Q6 mandatory)

**Status**: ACTIVE
**Phase**: 11 (Security review + audit)
**Plan ref**: `02-plans/06-ollama-provider-plan.md` lines 533-540
**Depends on**: T125, T126, T127, T128 (all tests must be green before security review)
**Specialist**: security-reviewer agent (mandatory per `rules/agents.md` Rule 2 + Q6)

## Why this is a hard gate

The C1 bug (`os.environ.setdefault` in `delegate/arbor_loop.py:95-98`) is **a live multi-tenant data leak** in production today. Per Q6 in `04-open-questions.md`, the user mandated:

1. Security-reviewer pass before merge
2. Audit log inspection for any production company that ever saved a BYOK config
3. If any non-admin BYOK configs exist in production, rotate the server-default `OPENAI_API_KEY` before merging
4. Depending on findings, may require disclosure to affected customers per the Foundation's incident-response policy

This todo cannot be checked off until all four steps are complete or formally waived by the user.

## Steps

### 1. Delegate to `security-reviewer` agent for the full diff

```
Task(security-reviewer): "Audit the Ollama provider PR (branch
feat/ollama-provider-e2e-q1q4q5q7) end-to-end. Critical focus areas:
1. Verify the C1 fix actually eliminates os.environ mutation across all
   call paths (not just arbor_loop.py)
2. Verify the per-request adapter injection cannot be bypassed
3. Verify the init-time invariant cannot be skipped at boot
4. Verify the new Ollama validation flows do not create new SSRF or
   leak base_url to logs
5. Verify the embedding migration script is safe to run against prod
6. Verify the new system prompt does not introduce prompt-injection
   regressions when the regex screens are gone
Report: severity, file:line, fix recommendation."
```

The agent's report must be addressed before merge. CRITICAL findings block merge; HIGH findings require either a fix or an explicit user waiver with documentation.

### 2. Audit log query

Run the following against the production audit log (likely via `psql` or the audit dashboard):

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

Adjust the date floor to whenever BYOK was first deployed (check the migration history).

For each row:

- Note the company and timestamp
- Note whether the saved provider was Ollama or custom (only those would have triggered the C1 path; pure OpenAI BYOK does not poison env)
- Cross-reference with whether other companies on the same shard made advisory queries during the same window

### 3. Decide rotation

- **If zero BYOK configs were ever saved with non-default `base_url`**: no rotation needed; document the audit result
- **If any BYOK configs were saved with non-default `base_url`**: rotate `OPENAI_API_KEY` BEFORE merging the PR. This ensures any leaked credentials are invalidated.
- Document the rotation in `journal/0016-INCIDENT-c1-rotation-decision.md`

### 4. Decide disclosure

- **If rotation was needed AND we cannot prove no leak occurred**: prepare a disclosure notice for affected customers per the Foundation's incident-response policy
- Coordinate with the Foundation's compliance lead before sending
- Document the decision in the same journal entry

## Acceptance criteria

- [ ] `security-reviewer` agent has reviewed the full PR diff
- [ ] All CRITICAL findings addressed (or waived with user signoff)
- [ ] All HIGH findings either fixed or documented with rationale + tracking issue
- [ ] Audit log query executed; results captured
- [ ] Rotation decision made and documented in `journal/0016-INCIDENT-c1-rotation-decision.md`
- [ ] If rotation was needed: `OPENAI_API_KEY` rotated; new key deployed; old key invalidated
- [ ] Disclosure decision made and documented (yes/no with reasoning)
- [ ] Gold-standards-validator agent has approved naming/licensing of the diff (per `rules/agents.md` quality gates)
- [ ] PR is approved by reviewer + security-reviewer + gold-standards-validator
- [ ] PR description includes the audit query result and rotation decision in the "Test plan" section

## Traps

- **Don't run the audit query against production read-replica without permission** — coordinate timing with on-call to avoid noise during a deploy window.
- **Don't rotate `OPENAI_API_KEY` casually** — rotation invalidates the key immediately, so any in-flight production requests using it will fail. Plan a brief maintenance window.
- **Don't skip disclosure for "small impact"** — the Foundation's incident-response policy may mandate disclosure regardless of severity. Defer to compliance, not your own judgment of "harmless".
- **Don't merge with unaddressed CRITICAL findings** — even if it's "almost ready". This is the security gate; treat it as binding.
- **Don't conflate** security review (T129 step 1) with the regular code reviewer (a separate quality gate). Both are required per `rules/agents.md`.
