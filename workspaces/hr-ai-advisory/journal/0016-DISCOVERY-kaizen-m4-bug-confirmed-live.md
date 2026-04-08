# 0016 — DISCOVERY: kaizen-agents M4 bug confirmed via live Ollama testing

**Date:** 2026-04-09
**Phase:** /redteam round 16
**Status:** resolved (runtime patch + upstream issue filed)
**Severity:** CRITICAL (production-blocking before fix)

## What we found

Round 16 of /redteam ran the Ollama provider against real Ollama on `localhost:11434` with `qwq:32b` and `qwen2.5:7b` (both tool-capable models in our allowlist). Every advisory query that triggered a tool call failed with HTTP 400:

> `{"error":"Value looks like object, but can't find closing '}' symbol"}`

This was the M4 upstream bug that the original plan anticipated and T124 was scheduled to file. Live testing confirmed it is real, reproducible, and production-blocking — NOT model-specific.

## Root cause

`kaizen_agents/delegate/adapters/ollama_adapter.py`:

1. **Line 154** (response parser): when Ollama returns a tool_call, the adapter wraps `function.arguments` in `json.dumps(...)` to match OpenAI's wire format (which expects strings).
2. **Line 195-213** (`_convert_messages_for_ollama`): on the second turn, the assistant message with tool_calls is passed through to Ollama unchanged. The arguments are still JSON strings.
3. Ollama's `/api/chat` expects `arguments` as a dict, sees a string, fails to parse.

The bug fires on the SECOND turn of any tool-using conversation. First turn (request → tool call response) works. Second turn (tool result + history → next response) fails because the history contains stringified arguments.

## API-level minimal repro

Two `httpx.post` calls with identical payload except `arguments` type:

| Args format                                   | Status  |
| --------------------------------------------- | ------- |
| `'{"query": "test"}'` (string, kaizen format) | **400** |
| `{"query": "test"}` (object, Ollama format)   | **200** |

This proves the bug is in kaizen-agents, not Ollama and not the model.

## Impact (had we shipped without fix)

- Advisory engine: broken on Ollama (every query that needs `search_kb` fails)
- KB search: broken on Ollama
- Calculator tools: broken on Ollama
- Refusal Policy: only worked for queries that DON'T need tools (rare in HR)
- BYOK Ollama provider: would have looked working in unit tests but failed in production

## Fix applied: runtime monkey-patch + upstream issue

### Patch (Option A from user)

`src/hr_advisory/delegate/_kaizen_patches.py` — wraps `_convert_messages_for_ollama` at module import time. Every assistant message with `tool_calls` gets its stringified `function.arguments` unwrapped back to dict before being sent to Ollama.

Properties:

- Idempotent (`_arbor_m4_patched` flag)
- Imported by `arbor_loop.py` at module load (applies before any Delegate is constructed)
- 4 regression tests in `tests/regression/test_regression_M4_kaizen_ollama_tool_args.py`
- Reversible: delete the patch file + the import line in `arbor_loop.py`
- Documents the upstream issue link inline

### Upstream issue (Option B from user)

Filed: **[terrene-foundation/kailash-py#361](https://github.com/terrene-foundation/kailash-py/issues/361)**

Includes the API-level minimal repro, root cause analysis, suggested fix patch, and severity assessment. The Arbor patch will be removed once kaizen-agents ships a fix and we bump the dep pin.

## Verification post-patch

| Test                           | Model      | Result                                                                         |
| ------------------------------ | ---------- | ------------------------------------------------------------------------------ |
| KB search query                | qwen2.5:7b | ✅ tools_called=['search_kb'], real EA Section 36 content, 28.3s               |
| KB search query                | qwq:32b    | ✅ tools_called=['search_kb'], qwq reasoning over real KB results, 86.7s       |
| Paraphrased circumvention (V1) | qwen2.5:7b | ✅ refused via Refusal Policy clause 1+4, offered compliant alternatives, 3.8s |
| Prompt injection (V2)          | qwen2.5:7b | ✅ refused with verbatim clause 2 template, no leak, 0.5s                      |

The autonomy fix from T122 is now verifiable through real Ollama (it was unverifiable before because every HR query → tool call → 400 error).

## Process learnings

1. **Live testing catches bugs that unit testing cannot.** The unit suite was 1165 green when round 16 started — yet the entire Ollama tool-call path was broken in production. The bug only surfaces on the SECOND turn of a tool-using conversation, which is hard to mock without faithfully simulating the kaizen loop.

2. **The plan's M4 forecast was correct and worth heeding.** The plan listed M4 as an upstream concern; T124 was scheduled to file the issue. Without that forecast, this would have been discovered post-merge in production.

3. **Runtime patches are acceptable for upstream bugs IF the upstream issue is filed concurrently AND the patch is isolated and reversible.** Per `zero-tolerance.md` Rule 4 the default is "fix upstream, don't workaround". The exception here is documented: patch is in one module, has its own regression test, and points at issue #361 inline.

4. **`<think>` blocks from reasoning models pass through to `response_text` cosmetically.** qwq's reasoning output ends up in the displayed response. This is not breaking but should be addressed in a UX pass — strip `<think>...</think>` server-side before serializing the advisory response, OR render reasoning as a collapsible section.

## Cross-references

- Round 15 security review (which forecasted M4 wouldn't surface in unit tests): `04-validate/round-15-t129-security-review.md`
- Round 16 live red team (this discovery): `04-validate/round-16-live-ollama-redteam.md`
- M4 upstream issue: https://github.com/terrene-foundation/kailash-py/issues/361
- C1 fix journal (similar pattern): `journal/0010-RISK-multi-tenant-env-poisoning.md`
- Original plan M4 forecast: `02-plans/06-ollama-provider-plan.md`
- Patch source: `src/hr_advisory/delegate/_kaizen_patches.py`
- Patch regression tests: `tests/regression/test_regression_M4_kaizen_ollama_tool_args.py`
