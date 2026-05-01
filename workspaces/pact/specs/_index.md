# PACT Workspace Specs Index

Created 2026-05-01 to close [MED] Sweep 1 from `SWEEP-2026-04-28.md` and to satisfy `rules/specs-authority.md` MUST 1 ahead of M60 `/analyze`.

This is a **skeleton index** — file rows are placeholders for spec files that will be created when each milestone enters `/analyze`. The detailed spec authority lives in:

- `briefs/01-pact-restructuring-brief.md` — restructuring brief
- `briefs/02-agent-workforce-vision.md` — agent workforce vision
- `02-plans/` — pre-existing implementation plans
- `.claude/rules/pact-governance.md` — 8 PACT MUST rules (frozen GovernanceContext, monotonic tightening, fail-closed, default-deny tools, etc.)

| File                        | Domain                | Status      | Description                                                                                                                                             |
| --------------------------- | --------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pact-models.md`            | M60 foundation        | placeholder | DataFlow model definitions for PACT primitives — Address, Envelope, GovernanceContext, OrgNode, Department, Role                                        |
| `org-compilation.md`        | M60 foundation        | placeholder | Org tree compilation rules — `MAX_COMPILATION_DEPTH=50`, `MAX_CHILDREN_PER_NODE=500`, `MAX_TOTAL_NODES=100_000` (per `rules/pact-governance.md` Rule 7) |
| `held-action-pipeline.md`   | M61–M62 notifications | placeholder | Held-action queue, notification delivery, action confirmation, monotonic tightening on child envelopes                                                  |
| `agent-workforce.md`        | M63–M65 workforce     | placeholder | 3 user-facing agents (HR, Payroll, Compliance) — agent registration, capability binding, trust posture                                                  |
| `progressive-deployment.md` | M66–M68 deployment    | placeholder | Phased agent enablement, rollback procedure, feature-flag scoping                                                                                       |
| `agent-dashboard.md`        | M69–M70 dashboard     | placeholder | Operator-facing surface — held-action queue, agent posture, envelope visualization                                                                      |
| `domain-config.md`          | M71–M72 config        | placeholder | Arbor-specific domain config — HRIS roles, regulatory clearances, knowledge bridges                                                                     |
| `acceptance-tests.md`       | M73 tests             | placeholder | E2E acceptance criteria — held-action lifecycle, governance enforcement, multi-tenant isolation                                                         |
| `pricing-onboarding.md`     | M74 pricing           | placeholder | Free / $49 / $149 tiers — onboarding flow, feature gates, upgrade path                                                                                  |

## Cross-domain invariants (must hold in every spec from M60 onward)

These come from `.claude/rules/pact-governance.md`. Every spec file above MUST reference and enforce them:

1. **Frozen GovernanceContext** — agents receive `GovernanceContext(frozen=True)`, never `GovernanceEngine`
2. **Monotonic tightening** — `intersect_envelopes(parent, requested)`; child cannot widen parent
3. **D/T/R grammar** — every Department or Team followed by exactly one Role
4. **Fail-closed decisions** — all `verify_action()`/`check_access()` error paths return `BLOCKED`/`DENY`
5. **Default-deny tool registration** — explicit `register_tool()` only
6. **NaN/Inf guard** — all numeric constraint fields validated with `math.isfinite()`
7. **Compilation limits** — depth 50, children 500, total 100k
8. **Thread safety** — `GovernanceEngine` and store methods acquire `self._lock`

## Pre-flight before `/analyze` M60

Per `workspaces/pact/.session-notes` resumption checklist (2026-05-01 refresh):

1. Verify the 2026-03-21 "stale blockers" against current Arbor state
2. Confirm `kailash-pact` package version (currently 0.8.2 in `memory/MEMORY.md`); if 1.0+ shipped, M60 may import it directly
3. Re-read both briefs for any scope drift
4. Then `/analyze` M60 with the spec-authority pattern (read this index, select relevant placeholders, populate as you go per `rules/specs-authority.md` MUST 5)
