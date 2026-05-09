---
type: DECISION
date: 2026-05-09
created_at: 2026-05-09T00:00:00Z
author: agent
session_id: shard-d-implement-s1b
session_turn: 14
project: shard-d-lint
topic: S1b — eslint config override + mechanical fan-out across 25 files
phase: implement
tags: [shard-d, implement, mechanical, eslint-config, no-unused-vars]
---

# S1b — eslint config tweak as the highest-leverage fix

## What

S1b shipped 25 files of mechanical cleanup in one commit (`159c88a`) on branch `feat/shard-d-s1b-mechanical`. Cumulative S1a+S1b lint delta: 31→18 errors (-13), 52→22 warnings (-30).

## The single biggest lever

Adding the explicit `@typescript-eslint/no-unused-vars` override in `eslint.config.mjs` was disproportionately impactful — the inherited `next/typescript` config did NOT honor `argsIgnorePattern: "^_"`, which is why `_data: AdvisoryStreamStartEvent` at `prism-advisory-adapter:85` kept warning despite the prefix.

The override:

```js
{
  rules: {
    "@typescript-eslint/no-unused-vars": [
      "warn",
      {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
        destructuredArrayIgnorePattern: "^_",
      },
    ],
  },
}
```

This single change retroactively silenced multiple warnings across the codebase that S1b's other Type C underscore-prefix renames assumed would be silenced. Without the config tweak, the renames would have been ineffective.

## Decisions made

### 1. Drop dead code aggressively when imports become orphaned

Approvals page's `StatusBadge` function was the only consumer of `STATUS_STYLES`. Deleting `StatusBadge` left `STATUS_STYLES` as a new dead variable. Cleaned up both in one pass instead of leaving the second dead-var for /redteam to catch.

### 2. Skip Type D/E even when easily deletable

Several Type D dead vars (e.g., `ExpiringDocumentsWidget.ninetyDaysMs`, `shifts.formatCurrency`) and Type E wiring cases (e.g., `URGENCY_TIMEFRAMES`, `messageId`) are mechanically trivial to delete — but per the matrix S3 owns Type D and S4 owns Type E. Resisting the temptation to absorb them preserves the shard ownership contract. S4's classification protocol (a/b/c outcomes) is the authoritative path for Type E.

### 3. ArborResult `module` → `targetModule` rename: scope-limited

The variable was renamed in 4 places within `ArborResult.tsx`. No external consumers; the `module` symbol was a local — the rule `@next/next/no-assign-module-variable` flagged the local because Next.js's runtime already exposes a global `module` and assignment to it confuses the framework's bundler in some scenarios.

## Why mechanical fan-out is fast

Per `rules/autonomous-execution.md` Rule 2 ("differentiated sizing"), boilerplate stamping fits 5× the base session budget. S1b touched 25 files in ~30 minutes of agent time because each edit was the same pattern (delete unused import / add underscore prefix / drop catch param) repeated. No invariant-tracking, no cross-file reasoning.

## Consequences

- 18 errors remain — all S2/S3-owned per matrix:
  - 10 `@typescript-eslint/no-explicit-any` (S3 type reconciliation)
  - 6 `react-hooks/set-state-in-effect` (S2 Cat A fetch-on-mount migrations)
  - 2 `react/no-unescaped-entities` (S3 CompanySetupModal)
- 22 warnings remain — all Type D/E owned by S3/S4.
- S1b PR ready for admin-merge to main.
- S2/S3/S4 can run in parallel worktrees once S1b merges (S1a already merged).

## For Discussion

1. The eslint-config override silenced ~26 warnings retroactively. Was the inherited `next/typescript` config a Next.js team oversight, an intentional stricter default, or a version-specific quirk? Worth a tracking issue against `eslint-config-next` if the convention is industry-standard.
2. Counterfactual: if S1b had been done WITHOUT the `argsIgnorePattern` config tweak, the underscore-prefix Type C renames would have been ineffective, and the Type C count would still show as warnings. How many "fix" PRs in repos using `next/typescript` are silently no-ops because the inherited config doesn't honor the underscore convention?
3. The matrix's strict Type D/E boundary (skipping easily-deletable items in S1b for S3/S4 ownership) cost ~5 trivial deletes that could have shipped in this batch. Is that overhead justified by the shard-isolation contract, or should the matrix permit "cleanup of easy adjacent items" in mechanical shards?

## Origin

S1b /implement session 2026-05-09. Branch `feat/shard-d-s1b-mechanical`. Commit `159c88a`.
