---
priority: 10
scope: path-scoped
paths:
  - "**/*.py"
  - "**/*.ts"
  - "**/*.rs"
---

# Runtime Patches for Upstream Bugs

The default per `rules/zero-tolerance.md` Rule 4 is: **do not work around SDK bugs in source code, file upstream and wait.** This rule documents the narrow exception — when shipping a release-blocking fix cannot wait for upstream, a runtime patch is acceptable, but ONLY under every condition below.

## When a Runtime Patch Is Acceptable

All four conditions MUST be true:

1. **Upstream issue is filed BEFORE the patch lands.** The patch commit references the issue URL inline. No "we'll file it later" — the issue existed first, the patch links to it.

2. **The patch is isolated to a single module.** It lives in a clearly-named file like `_kaizen_patches.py` or `_sdk_workarounds.py`. It does NOT touch the original SDK import path, SDK subclasses, or any file that could plausibly be mistaken for normal application code.

3. **A regression test pins both the bug and the patch.** The test fails on the unpatched SDK and passes on the patched one. It survives the patch's eventual removal (it tests the invariant, not the patch mechanism).

4. **The patch is reversible via a single-file deletion.** Removing the patch file + one import line must restore pre-patch behavior. No scattered `if _sdk_is_buggy:` branches across the codebase.

If ANY condition fails, the work MUST be split: file the upstream issue, pin to a workable SDK version, and wait. Do not ship a runtime patch without all four gates.

## Why Not Just Fix Upstream?

Upstream-only fixes are preferred but fail on:

- **Release-blocking bugs.** A CRITICAL upstream bug discovered during red team of a ship-pending PR cannot wait for the next upstream release (which may be weeks away).
- **Consumer is the only affected party.** Some upstream bugs only fire in specific consumer patterns (e.g., Arbor's multi-turn Ollama tool use hit kaizen-agents `_convert_messages_for_ollama` stringification — a bug that upstream test matrices didn't cover).
- **Known-good upstream doesn't exist yet.** If there's no stable upstream release to pin, the consumer has to patch or stall.

The runtime patch is a temporary bridge, not a permanent fork.

## The Patch Lifecycle

```
1. Red team discovers bug in upstream SDK
   ↓
2. File upstream issue WITH minimal repro (API-level if possible, language-agnostic)
   ↓
3. Write regression test that pins the invariant (NOT the patch mechanism)
   ↓
4. Write the runtime patch in a clearly-named module
   ↓
5. Import the patch at the top of the file that first constructs the affected SDK object
   ↓
6. Commit: "fix(area): runtime patch for <SDK> <bug> (<repo>#<issue>)"
   ↓
7. Ship the PR
   ↓
──── TIME PASSES ────
   ↓
8. Upstream ships the fix in a new SDK version
   ↓
9. Bump the SDK pin in pyproject.toml/Cargo.toml
   ↓
10. Verify the regression test still passes (patch is now a no-op over fixed upstream)
   ↓
11. Delete the patch module + remove the import line
   ↓
12. Commit: "chore: remove <SDK> patch (upstream <version> shipped fix)"
```

## DO / DO NOT

### DO

```python
# src/myproject/delegate/_kaizen_patches.py
"""Runtime patches for kaizen-agents bugs that block our use case.

Upstream issue: https://github.com/terrene-foundation/kailash-py/issues/361
Removal plan: delete this file + import in arbor_loop.py once kaizen-agents
ships the fix and we bump the pin.
"""

def _patch_ollama_tool_args() -> None:
    """Wrap _convert_messages_for_ollama to unwrap stringified args."""
    import kaizen_agents.delegate.adapters.ollama_adapter as m
    if getattr(m, "_arbor_m4_patched", False):
        return
    original = m._convert_messages_for_ollama
    def _patched(messages):
        ... # unwrap stringified tool_call args
    m._convert_messages_for_ollama = _patched
    m._arbor_m4_patched = True

_patch_ollama_tool_args()
```

Plus:

- Upstream issue filed at https://github.com/terrene-foundation/kailash-py/issues/361 ✓
- Regression test `test_regression_M4_kaizen_ollama_tool_args.py` ✓
- Single-module isolation ✓
- Removal plan documented in the patch docstring ✓

### DO NOT

```python
# src/myproject/delegate/arbor_loop.py

def create_delegate(config):
    # Work around kaizen-agents bug by duplicating part of their logic inline
    if config.adapter and isinstance(config.adapter, OllamaStreamAdapter):
        # Rebuild messages ourselves with correctly-typed args
        messages = _our_own_message_converter(config.messages)  # BLOCKED
        ...
```

Why this fails the rules:

- Not isolated — patch logic is scattered in the main code path
- Not reversible — removing it requires surgery across multiple functions
- No upstream issue referenced in the code — intent and lifecycle are invisible to future maintainers

## Specialist Consultation

Before writing a runtime patch for a Kailash SDK bug (kaizen-agents, kailash-nexus, kailash-dataflow, kailash-kaizen), MUST consult the relevant framework specialist (kaizen-specialist, nexus-specialist, etc.). The specialist either confirms the bug is real and upstream-worthy, or points to an existing API that solves the problem without a patch.

## Relationship to Other Rules

- `rules/zero-tolerance.md` Rule 4 — default is no workarounds. This rule documents the narrow exception.
- `rules/cross-sdk-inspection.md` — every upstream issue filed for one SDK triggers an audit for the equivalent bug in the sibling SDK. The runtime patch applies to only one side; the sibling may need its own patch + its own upstream issue.
- `rules/testing.md` — every runtime patch MUST have a regression test in `tests/regression/` marked `@pytest.mark.regression`.

## Audit / Discovery

To inventory active runtime patches in a repo:

```bash
rg -l "_patched\|monkey.?patch\|runtime patch" src/
```

Every hit should map to:

- An `_*_patches.py` or `_workarounds.py` module (not a live-code file)
- A filed upstream issue (URL visible in the patch docstring)
- A regression test in `tests/regression/`
- An entry in this repo's patch inventory (in session notes or a dedicated `PATCHES.md`)

Stale patches (upstream issue closed, new SDK version shipped) MUST be removed within one session of the upstream fix landing.
