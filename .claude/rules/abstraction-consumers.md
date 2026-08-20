---
priority: 10
scope: path-scoped
paths:
  - "**/*.py"
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.rs"
---

# Abstraction Consumer Enumeration

When modifying a shared abstraction (class, factory, config dataclass, protocol), you MUST enumerate ALL of its consumers before declaring the change complete. Red team analysis MUST start from grep-derived call-site lists, not from the plan's named files.

## The Failure Mode

1. Plan names 2-3 call sites for a refactor (e.g., "update advisory.py `/query` and `/stream`")
2. Agent updates the named sites, runs the named tests, reports done
3. Red team reviews the named sites, approves
4. A FOURTH consumer (e.g., `shadow.py::execute`) still constructs the old shape — silently broken in production
5. The bug is caught weeks later in security review OR (worse) in production

**This happened in Arbor round 15:** advisory.py got the C1 adapter-injection fix, but `shadow.py::execute` kept constructing `DelegateConfig(...)` without `adapter` or `require_server_default=True`, falling through to the env-fallback path and re-introducing the exact leak the fix was supposed to eliminate. See `journal/0015-DISCOVERY-c1-regression-in-shadow-router.md`.

## MUST Rules

### 1. Grep first, plan second

Before declaring a refactor of an abstraction complete, run:

```bash
# For class/dataclass changes:
rg "{ClassName}\(" <source root>

# For protocol/trait changes:
rg "impl {ProtocolName}" <source root>   # Rust
rg ": {ProtocolName}" <source root>      # Python type hints

# For function signature changes:
rg "{function_name}\(" <source root>
```

The plan's named files are a STARTING POINT, not the full list. Every additional hit from the grep is a consumer that MUST be audited.

**Why:** The plan author knows the call sites they were thinking about; they don't know the ones added by other teams or in other modules since the plan was written. Only grep knows.

### 2. Red team receives the grep output, not the plan's file list

When launching a red team agent to audit an abstraction change, include the full grep output in the prompt. DO NOT tell the red team "audit advisory.py and arbor_loop.py" when the grep returns 5 hits across advisory.py, shadow.py, arbor_loop.py, and two test fixtures. Pass all 5.

**Why:** Red team agents spawn without the session context. They need the grep output in their prompt; otherwise they audit only the plan-named files and reproduce the blind spot that caused the original bug.

### 3. Audit checklist per consumer

For EACH consumer the grep returns, verify:

- The new contract is applied (new param, new method signature, new flag)
- Any old pattern is deleted (not just edited — grep the old pattern to confirm zero matches)
- The test covering this specific consumer still passes
- Any regression test pins this specific consumer's behavior (not just the one the plan named)

```bash
# Example verification after a DelegateConfig refactor:
rg "DelegateConfig\(" src/hr_advisory/api/routers/ | wc -l
# Every hit must include adapter= and require_server_default=True
rg "DelegateConfig\(" src/hr_advisory/api/routers/ | rg -v "adapter=" | wc -l
# Must be 0
```

### 4. Historical regression tests at the abstraction layer

When an abstraction change fixes a bug, the regression test MUST pin the invariant at the ABSTRACTION, not at a specific consumer. Example:

```python
# BAD — pins only advisory.py
def test_C1_advisory_uses_adapter():
    resp = client.post("/advisory/query", ...)
    assert_no_env_mutation()

# GOOD — pins the abstraction invariant regardless of consumer
def test_C1_create_delegate_rejects_empty_adapter_in_request_context():
    cfg = DelegateConfig(adapter=None, require_server_default=True)
    with pytest.raises(RuntimeError, match="adapter is required in request context"):
        create_delegate(cfg)
```

The abstraction-layer test fails immediately if ANY new consumer forgets the pattern, regardless of which router they added.

## MUST NOT

- **Trust the plan's file list as exhaustive.** Plans are written before call sites are enumerated; they miss consumers added between plan and implementation.

**Why:** Every "we forgot to update X" bug in this repo's history started with an agent treating the plan as a complete call-site list. The plan is an intent document, not a discovery mechanism.

- **Declare a refactor complete without a grep-backed verification step in the PR description.**

**Why:** Without a visible grep result, reviewers have no way to check that all consumers were updated. The PR description must include the literal `rg` command and its output showing every consumer is on the new contract.

- **Allow a red team agent to audit an abstraction change without passing them the grep output.**

**Why:** Red team agents without context will audit the files they are told about. The grep output IS the context.

## Exception: Private implementation details

If the thing being changed is a private module-level helper (`_foo`, `__bar`) used only within one file, the grep enumeration reduces to "this one file" and the rule is trivial. The rule applies when the abstraction crosses module/file boundaries — class constructors, public functions, protocols, and dataclass fields.
