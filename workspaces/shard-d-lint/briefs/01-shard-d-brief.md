# Shard D Lint Debt — Brief

Carry-over from the v0.4.0–v0.4.9 release work. Prior session-notes:

> Shard D lint /analyze cycle still deferred (31 react-hooks violations → TanStack Query migration).
> Branch `feat/prism-advisory` is retained for this purpose.

## Goal

Drive `apps/web` ESLint output from **31 errors + 52 warnings** to **0 errors + 0 warnings**, addressing root causes (not suppressing rules), and codify the canonical patterns so the regression cannot return.

## Constraints

- Production at `arbor.aitelab.net` is on v0.4.9 and stable; this work is not user-facing or release-blocking, but Shard D cleanup unblocks frontend dev velocity (lint failures gate PR-merge).
- Per `rules/zero-tolerance.md` Rule 1, every error and warning is the SAME class — both must be resolved.
- Per `rules/agent-reasoning.md` and `rules/communication.md`, the canonical pattern for data fetching in this codebase is **TanStack Query**, not raw `useEffect + fetch + setState`. Anywhere that pattern appears should be migrated, not workaround-suppressed.
- The 16 `react-hooks/set-state-in-effect` errors are the largest single rule cluster; the prior session-notes phrased this as "TanStack Query migration", but the actual rule cluster is broader — some hits are localStorage hydration, some are route-driven panel state, some are genuine fetch antipatterns. The migration is not blanket — it's per-pattern.

## Constituent rule clusters (live count from `npx eslint . --format json`)

**31 errors:**

- 16 `react-hooks/set-state-in-effect`
- 10 `@typescript-eslint/no-explicit-any`
- 3 `react-hooks/exhaustive-deps`
- 1 `react-hooks/immutability`
- 1 `react-hooks/purity`
- 2 `react/no-unescaped-entities`
- 1 `@next/next/no-assign-module-variable`
- 1 `jsx-a11y/role-has-required-aria-props`

**52 warnings:**

- 48 `@typescript-eslint/no-unused-vars`
- 4 (other low-frequency)

## Out of scope

- Backend lint (Python) — separate workstream
- Mobile/Flutter lint — separate workstream
- New features, refactors beyond the lint surface
- TanStack Query upgrade (we already have it; this is migrating remaining hand-rolled `useEffect+fetch+setState` to it)

## Success criteria

1. `cd apps/web && npx eslint .` exits 0 with 0 errors AND 0 warnings.
2. No `// eslint-disable-*` comments added except where the rule itself is structurally inapplicable AND a follow-up issue is filed (per `rules/zero-tolerance.md` Rule 3).
3. A spec file at `specs/frontend-data-fetching.md` (or workspace equivalent) documents the canonical fetch-state-render pattern so the failure mode is visible to future agents.
4. No regression in production behavior — every changed page/component verified to render and behave identically.
