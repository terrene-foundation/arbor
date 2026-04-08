# DISCOVERY — `workflows/guardrails.py` violates the LLM-first rule with 23 regex patterns

**Date:** 2026-04-08
**Initiative:** hr-ai-advisory / ollama-provider (Q7 follow-up)
**Type:** DISCOVERY
**Severity:** BLOCKING violation of `.claude/rules/agent-reasoning.md`

## What

While verifying that the Arbor Delegate is "fully autonomous" (Q7 of the Ollama provider analysis), an `analyst` agent discovered that `src/hr_advisory/workflows/guardrails.py` contains **23 hardcoded regex patterns across three constants** that pre-filter user input before it reaches the LLM:

- `_CIRCUMVENTION_PATTERNS` (10 patterns) — block queries about avoiding CPF, evading taxes, etc.
- `_INJECTION_PATTERNS` (9 patterns) — block prompt-injection attempts
- `_ESCALATION_PATTERNS` (4 patterns) — route "high-stakes" queries to canned responses

Plus two dead-code constants (`_HR_SCOPE_KEYWORDS`, `_OFF_TOPIC_PATTERNS`) that no current code references but tempt future re-introduction.

These patterns are called from `api/routers/advisory.py` Steps 2b/2c/3 (both query and stream paths) BEFORE the request reaches the Delegate. If any regex hits, the advisory pipeline returns a canned string and never invokes the LLM.

## Why it's a violation

`agent-reasoning.md` MUST NOT Rule 2 (No Keyword/Regex Matching on Agent Inputs) and Rule 4 (No Pre-Filter Input Before LLM Sees It) explicitly forbid this pattern. The "permitted exceptions" section's test is: _"Is the conditional deciding what the agent should think or do based on input content?"_ In every case here, the answer is yes — the regex decides the agent should not respond at all.

The Delegate engine itself (`delegate/arbor_loop.py`, `delegate/tools.py`, `delegate/system_prompt.py`) is **fully compliant** — tools are dumb endpoints, system prompt has no hardcoded if-then rules. The violations sit in the pre-Delegate guardrail chain, which is invisible to anyone reading just the Delegate code.

## Why it matters operationally

Beyond rule compliance, the regex layer has three real-world failure modes:

1. **Paraphrase blind spots.** "Save money on monthly statutory payroll deductions" is a circumvention query about CPF, but no `_CIRCUMVENTION_PATTERNS` regex matches it. The Delegate runs and gives normal advice. Yet "how do I avoid paying CPF" gets blocked. The user-visible behavior is inconsistent and depends on lexical accident.

2. **Multilingual / Singlish.** Singapore HR queries frequently use Singlish or mixed Mandarin/Malay/Tamil terms. None of the regex patterns match non-English. Customers writing in their native language get the canned-block treatment for benign queries OR sail past the block for circumvention queries.

3. **Security theater.** Real prompt-injection defense lives in two places that already exist:
   - `delegate/system_prompt.py` `SYSTEM_PROMPT_SECURITY_FOOTER` — instructs the LLM to refuse role-overriding instructions
   - `workflows/guardrails.py:screen_response` — output guard that catches leaked system prompt fragments
   - The input-side regex is redundant. Deleting it does not weaken security; it removes a layer that produces false confidence.

## How it slipped in

The regex screens predate the Delegate migration. They were appropriate when Arbor used a Kaizen multi-agent pipeline that didn't have its own native refusal capability. After the migration to Delegate, the screens were never revisited because they "worked" — i.e. they didn't break anything, and the test suite didn't have any "paraphrase regression" tests to expose the blind spots.

## Resolution

See Phase 7.5 in `02-plans/06-ollama-provider-plan.md`. The fix is:

1. Delete `_CIRCUMVENTION_PATTERNS`, `_INJECTION_PATTERNS`, `_ESCALATION_PATTERNS`, and the dead `_HR_SCOPE_KEYWORDS` / `_OFF_TOPIC_PATTERNS` constants.
2. Delete the `screen_query` and `screen_injection` functions.
3. Remove the corresponding call sites in `api/routers/advisory.py` (Steps 2b, 2c, 3) for both query and stream.
4. Strengthen the Delegate system prompt with an explicit "Refusal Policy" section that handles the four protections via reasoning instead of regex: off-topic, injection, escalation, circumvention. Each gets a concrete refusal pattern in the prompt for the LLM to mirror.
5. KEEP `screen_response` (output guard, permitted) and `check_confidence_escalation` (operates on LLM output, permitted).
6. Add 5 regression tests covering the paraphrased circumvention case + each removed regex category.

After the fix, every user query reaches the Delegate. The LLM reasons about scope, injection, escalation, and circumvention via the system prompt and refuses appropriately. Arbor becomes fully compliant with `agent-reasoning.md`.

## Cross-references

- `01-analysis/17-ollama-provider/06-autonomy-audit.md` — full audit report with severity ratings
- `02-plans/06-ollama-provider-plan.md` Phase 7.5 — implementation steps
- `.claude/rules/agent-reasoning.md` — the rule being enforced
- `src/hr_advisory/workflows/guardrails.py` lines 71-371 — the violation site
- `src/hr_advisory/api/routers/advisory.py` lines 227-288, 616-672 — the call sites
- `src/hr_advisory/delegate/system_prompt.py` — where the protections move to

## Lesson learned

Code-as-router and prompt-as-router can coexist invisibly to anyone who only audits one of them. The Delegate looked autonomous when audited in isolation; the violations were in a sibling module called by the same endpoint. Future audits of "is X autonomous?" must trace the full request path from the FastAPI route handler down to the LLM call, not just the agent class.
