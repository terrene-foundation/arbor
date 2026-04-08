# T124 — Phase 9: File 3-4 upstream `kailash-py` issues

**Status**: ACTIVE
**Phase**: 9 (Cross-SDK upstream)
**Plan ref**: `02-plans/06-ollama-provider-plan.md` lines 386-394
**Specialist**: gh-manager

## Goal

File issues against `terrene-foundation/kailash-py` (and `esperie/kailash-rs` if equivalent) for upstream gaps that we worked around in this PR. Per `rules/cross-sdk-inspection.md`, working around an upstream bug without filing the issue is technical debt that compounds.

## Issues to file

### Issue 1 — `OllamaStreamAdapter` tool-call streaming bug

- **Repo:** `terrene-foundation/kailash-py`
- **Title:** `OllamaStreamAdapter` tool-call streaming accumulates duplicate call IDs across NDJSON lines
- **Body:** Provide a minimal repro showing how a multi-line NDJSON stream from Ollama produces duplicate tool-call IDs in the adapter's internal accumulator. Cite `kaizen_agents/delegate/adapters/ollama_adapter.py:146-157` (verify line numbers in the latest version).
- **Labels:** `bug`, `streaming`, `ollama`
- **Priority note:** Workaround is to pin tests to a known-good model (`llama3.1:8b`); document this in the issue so maintainers know we're not blocked, just patient.

### Issue 2 — Cross-SDK check on `kailash-rs`

- Check `esperie/kailash-rs` (or wherever the Rust SDK lives) for an equivalent `OllamaStreamAdapter`. If present, file the same bug as Issue 1 against that repo.
- If absent or the Rust adapter has different streaming semantics, document in the issue that the bug is Python-specific.

### Issue 3 — `_MODEL_PREFIX_MAP` should support Ollama prefixes

- **Repo:** `terrene-foundation/kailash-py`
- **Title:** `_MODEL_PREFIX_MAP` doesn't recognise Ollama model name prefixes (`llama-`, `qwen-`, `mistral-`, etc.) — alternative: document that Ollama requires explicit `provider="ollama"`
- **Body:** Show that `Delegate(...)` with no explicit provider on a model name like `"llama3.1:8b"` falls through to OpenAI as the default, which is silently wrong. Either the prefix map should learn Ollama prefixes, or the docs should warn users to always pass `provider="ollama"` explicitly.
- **Labels:** `bug` or `enhancement`, `ollama`, `dx`

### Issue 4 — Provider-aware cost tracking inside Delegate

- **Repo:** `terrene-foundation/kailash-py`
- **Title:** `Delegate` internal cost tracking should be provider-aware (Ollama should not bill)
- **Body:** Note that we had to wrap the cost check at the consumer level (Arbor's `llm_budget._estimate_cost`) because the Delegate itself does not know whether the underlying adapter is local or cloud. Suggest that `Delegate` expose a `cost_for_call(...)` method that returns 0 for local adapters and a real estimate for cloud ones.
- **Labels:** `enhancement`, `billing`, `ollama`

## Acceptance criteria

- [ ] Issue 1 filed against `terrene-foundation/kailash-py` with a minimal repro and clear file:line reference
- [ ] Issue 2 filed against the Rust SDK if applicable, OR a note added to Issue 1 documenting Python-only scope
- [ ] Issue 3 filed against `terrene-foundation/kailash-py`
- [ ] Issue 4 filed against `terrene-foundation/kailash-py`
- [ ] Each filed issue's URL is captured and added to a follow-up note in `journal/0015-DECISION-upstream-issues-filed.md`

## Out of scope

- Patching the upstream bugs locally — that's exactly what we're avoiding (per `zero-tolerance.md` Rule 4: no workarounds for SDK issues, fix upstream)
- Waiting for upstream fixes before merging the Arbor PR — Arbor's workarounds are documented and pinned

## Traps

- **Filing without a minimal repro** is a non-issue. Each filed issue MUST include a runnable snippet (5-15 lines) that demonstrates the bug.
- **Cross-SDK inspection is mandatory** per `rules/cross-sdk-inspection.md`. Do not assume the Rust SDK has the same bug; verify by reading the equivalent file or asking in the repo.
- **Don't file feature requests as bugs** — Issue 3 and 4 are arguably enhancement requests; label them as such.
- **Use the `gh` CLI** — `gh issue create --repo terrene-foundation/kailash-py --title "..." --body "$(cat <<EOF ... EOF)"`. Don't paste body text via shell concatenation (newline issues).
