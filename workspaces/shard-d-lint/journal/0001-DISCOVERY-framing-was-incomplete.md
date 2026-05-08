---
type: DISCOVERY
date: 2026-05-08
tags: [shard-d, lint, scope-correction]
---

# Brief framing "31 react-hooks → TanStack Query" was wrong

## What happened

Prior session-notes (and the brief I drafted from them) framed Shard D as "31 react-hooks violations → TanStack Query migration". On running `npx eslint . --format json`, the actual breakdown is:

- **31 errors**: 16 `react-hooks/set-state-in-effect`, 10 `@typescript-eslint/no-explicit-any`, 3 `react-hooks/exhaustive-deps`, 2 `react/no-unescaped-entities`, 1 `react-hooks/immutability`, 1 `react-hooks/purity`, 1 `@next/next/no-assign-module-variable`, 1 `jsx-a11y/role-has-required-aria-props`
- **52 warnings**: 48 `@typescript-eslint/no-unused-vars`, plus low-frequency others

Only ~half (16/31) of the errors are `react-hooks/set-state-in-effect`, and even those split into 6 distinct antipattern subcategories (fetch-on-mount, localStorage hydration, route-driven sync, derived state, cooldown timer, cascading setState in updater) — only ONE of the 6 (fetch-on-mount, 6 sites) is the canonical TanStack Query target.

## Why this matters

The framing shaped the workspace plan: a single-shard "migrate to TanStack Query" approach would address ~6 of 80 violations and leave 74 untouched. The corrected plan is 4 parallel shards spanning lint cleanup, type reconciliation, wiring triage, and migration — each with its own scope discipline.

## How to apply

When a brief frames a workstream by a single technique ("migrate to X", "refactor to Y"), enumerate the actual violation/issue surface BEFORE accepting the framing. If the brief's framing covers <50% of the surface, write a corrected brief addendum and re-derive the plan.

This is a /analyze pattern: the brief's prose model of the work is a first hypothesis, not a contract. Run the mechanical sweep first, then revise framing.

## Origin

Shard D /analyze, 2026-05-08. Brief at `briefs/01-shard-d-brief.md` corrected after running `npx eslint . --format json`. Full violation breakdown at `01-analysis/01-violation-inventory.md`.
