# T121 — Phase 7.5A: Delete regex guardrails in `workflows/guardrails.py`

**Status**: ACTIVE
**Phase**: 7.5A (Autonomy fix — delete regex screens)
**Plan ref**: `02-plans/06-ollama-provider-plan.md` lines 332-343
**Audit ref**: `01-analysis/17-ollama-provider/06-autonomy-audit.md`
**Depends on**: T112 (legacy delete completes first to avoid conflicts in routers)
**Blocks**: T122
**Specialist**: kaizen-specialist (Delegate autonomy)

## Why this matters

`workflows/guardrails.py` contains ~25 regex patterns that pre-filter user input BEFORE the Delegate sees it. This violates the "fully autonomous Delegate" principle in two ways:

1. **Keyword blind spots** — paraphrased queries (e.g. "save money on monthly statutory deductions" instead of "avoid CPF") slip past the regex and never trigger the canned refusal, while legitimate queries get blocked
2. **Bypassed reasoning** — the LLM never gets to apply context, judgment, or escalation language to the query; the regex returns a canned string and the Delegate is skipped entirely

The fix is structural: delete the input-side regex screens entirely; the Delegate's system prompt (strengthened in T122) handles scope, injection, escalation, and circumvention via reasoning.

## What to delete — `src/hr_advisory/workflows/guardrails.py`

| Lines   | Symbol                    | Why delete                                                          |
| ------- | ------------------------- | ------------------------------------------------------------------- |
| 71-112  | `_CIRCUMVENTION_PATTERNS` | V1 — keyword routing for unlawful queries                           |
| 118-161 | `_INJECTION_PATTERNS`     | V2 — keyword routing for prompt injection                           |
| 350-371 | `_ESCALATION_PATTERNS`    | V3 — keyword routing for high-stakes language                       |
| 167-324 | `_HR_SCOPE_KEYWORDS`      | V4 — dead code (only used by `screen_scope`)                        |
| 327-347 | `_OFF_TOPIC_PATTERNS`     | V4 — dead code (only used by `screen_scope`)                        |
| 549-590 | `screen_injection`        | Input-side classifier — bypasses Delegate                           |
| 593-634 | `screen_query`            | Input-side classifier — bypasses Delegate                           |
| 468-546 | `screen_scope`            | Borderline — second-Delegate scope check, redundant. DROP per plan. |

## What to KEEP

These remain because they are output-side, infrastructural, or LLM-side prompt constraints:

- `screen_response` (lines 637-665) — **OUTPUT GUARD** — checks the Delegate's response for leaked system prompt fragments, etc. Keep.
- `check_rate_limit` — infrastructure (rate limit, not content classification). Keep.
- `check_confidence_escalation` — operates on LLM output, not input. Keep.
- `_log_flagged_query` — audit trail. Keep.
- `SYSTEM_PROMPT_SECURITY_FOOTER` — LLM-side constraint that gets injected into the prompt. Keep.

If `screen_scope` was the only consumer of `_HR_SCOPE_KEYWORDS` and `_OFF_TOPIC_PATTERNS`, those are now dead and the deletes are safe. Verify with a grep before removing.

## Acceptance criteria

- [ ] All 8 deletions above are complete
- [ ] `rg "_CIRCUMVENTION_PATTERNS|_INJECTION_PATTERNS|_ESCALATION_PATTERNS|_HR_SCOPE_KEYWORDS|_OFF_TOPIC_PATTERNS" src/hr_advisory/` → 0 matches
- [ ] `rg "def screen_query|def screen_injection|def screen_scope" src/hr_advisory/` → 0 matches
- [ ] `screen_response` still exists with its output-guard logic intact
- [ ] `check_rate_limit`, `check_confidence_escalation`, `_log_flagged_query`, `SYSTEM_PROMPT_SECURITY_FOOTER` all preserved
- [ ] `pytest tests/unit/workflows/test_guardrails.py -x` — any tests of the deleted symbols are removed (their existence becomes invalid); tests of the kept symbols still pass
- [ ] No new failures in the broader unit suite

## Out of scope

- Removing the call sites in `api/routers/advisory.py` (T122 — Step 7.5.B)
- Strengthening the system prompt to take over the deleted protections (T122 — Step 7.5.C)
- Regression tests for paraphrased queries (T128 — Phase 10D)

## Traps

- **`ScreeningResult` dataclass/type** — shared between deleted screens and `check_confidence_escalation`. Verify whether `check_confidence_escalation` still uses it. If yes, keep the type. If no, delete it.
- **Import cycles** — `workflows/guardrails.py` is imported by `api/routers/advisory.py`. If you delete a symbol that's still imported, T122's compile will fail. Order: delete the symbols here, then T122 immediately removes the imports.
- **Don't delete `screen_response`** — it's the output-side equivalent and is the second line of defense for prompt-injection leakage. The plan explicitly keeps it.
- **`screen_scope` is borderline** — the plan calls for DROP. Don't get cute and keep "just in case" — the redundant LLM call wastes a token round trip per query.

## Red team round 1 revisions (H6)

### H6 — T121/T122 ordering would break the build

T121 deletes `screen_query`, `screen_injection`, `screen_scope` symbols. The advisory router at `lines 43-46` imports those names; T122 removes the imports and call sites. As sequential commits (T121 → T122), the codebase between them does NOT import — `from hr_advisory.workflows.guardrails import screen_query` raises ImportError and the FastAPI app fails startup.

**Fix:** restructure T121 to delete the internal `_*_PATTERNS` constants AND turn the public functions into no-op stubs (NOT delete them):

```python
# In workflows/guardrails.py — T121 leaves these as no-op stubs:
def screen_query(query: str, **kwargs) -> ScreeningOutput:
    """No-op stub. The autonomous Delegate handles scope/safety reasoning
    via the strengthened system prompt (see T122). This stub exists only
    to preserve the import surface during the T121→T122 transition.
    Will be deleted by T122 along with its call sites."""
    return ScreeningOutput(result="PASS", reason="autonomous-delegate", flagged=False)

def screen_injection(query: str, **kwargs) -> ScreeningOutput:
    """No-op stub — see screen_query docstring."""
    return ScreeningOutput(result="PASS", reason="autonomous-delegate", flagged=False)

def screen_scope(query: str, **kwargs) -> ScreeningOutput:
    """No-op stub — see screen_query docstring."""
    return ScreeningOutput(result="PASS", reason="autonomous-delegate", flagged=False)
```

Then T122 deletes the stubs AND the imports AND the call sites in one atomic commit. This preserves a green build between T121 and T122.

### Updated acceptance criteria

- [ ] `_CIRCUMVENTION_PATTERNS`, `_INJECTION_PATTERNS`, `_ESCALATION_PATTERNS`, `_HR_SCOPE_KEYWORDS`, `_OFF_TOPIC_PATTERNS` all deleted
- [ ] `screen_query`, `screen_injection`, `screen_scope` REPLACED with no-op stubs (NOT deleted)
- [ ] Stubs return `ScreeningOutput(result="PASS", reason="autonomous-delegate", flagged=False)`
- [ ] `pytest tests/unit/api/routers/test_advisory.py -x` passes (router still imports cleanly)
- [ ] Docker image still builds (no ImportError on app startup)
- [ ] Stubs are explicitly marked as deleted-by-T122 in their docstrings
