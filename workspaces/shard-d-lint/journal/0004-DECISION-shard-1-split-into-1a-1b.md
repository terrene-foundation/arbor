---
type: DECISION
date: 2026-05-08
created_at: 2026-05-08T00:00:00Z
author: co-authored
session_id: shard-d-todos
session_turn: 5
project: shard-d-lint
topic: Split S1 into S1a (load-bearing) + S1b (boilerplate fan-out)
phase: todos
tags: [shard-d, todos, capacity-budget, autonomous-execution]
---

# Split Shard 1 into S1a (load-bearing) + S1b (boilerplate fan-out)

## What

The original S1 todo (`S1-mechanical-and-action-driven.md`) was split into two todos at `/todos` time:

- **S1a** — `S1a-investigations-and-action-driven.md`: F19 preflight + F1/F5/F6 behavior investigations + F7/F8 consumer enumeration + per-file load-bearing edits (employees/[id], useObservation, PaceCard, AppShell, AdvisoryPanelContext, AdvisoryPanel, advisory/history+alerts useMemo wraps, analytics line 122 immutability).
- **S1b** — `S1b-mechanical-fan-out.md`: 29 Type A dead imports + 2 Type B catch + 4 Type C underscore + ArborResult module rename + TopBar+SearchResults a11y plumb + (conditional) eslint config tweak.

Plan v2 originally framed Shard 1 as a single session. The split is a /todos-time refinement, not a plan revision.

## Why

Per `rules/autonomous-execution.md` § "Per-Session Capacity Budget", a single shard MUST stay within ALL of:

- ≤500 LOC of load-bearing logic
- ≤5–10 simultaneous invariants
- ≤3–4 call-graph hops of cross-file reasoning
- describable in 3 sentences

The /todos red-team (FT1, HIGH severity) flagged that the original S1 carried 8+ simultaneous invariants tracked across 35+ files:

1. Refetch-key choice (F1) — semantic decision for `key=<field>` resolution
2. Lazy-init/setEnabled coupling (F5) — useObservation insights memo + `setInsights([])` cascade
3. isDangerous stability (F6) — PaceCard remount semantics
4. setIsOpen route guard (F7) — AdvisoryPanelContext useCallback action-driven fix
5. showHistory close paths (F8) — multi-handler attachment in AdvisoryPanel
6. Immutability invariant — analytics line 122 `accumulated += pct` → `reduce` rewrite
7. a11y aria id↔aria-controls plumb — TopBar + SearchResults
8. Monotonic lint count (F14) — process discipline

Plus 35+ files of mechanical fan-out. Even though boilerplate per autonomous-execution Rule 2 ("differentiated sizing") MAY use up to 5× the base budget, mixing 8+ invariants of load-bearing reasoning with 35+ files of stamping in one session erodes attention on both ends — load-bearing edits get rushed; mechanical batches get pattern-mismatched.

The split keeps S1a's invariant load tractable AND lets S1b run in a parallel worktree alongside S2/S3/S4 once S1a merges. Net wall-clock impact: same or slightly less (S1b parallelizes), with substantially lower risk of mid-session attention overflow.

## Alternatives considered

- **Keep S1 unified per plan v2**. Rejected: the redteam found capacity overflow at the invariant ceiling; a conservative split is cheaper than discovering the overflow mid-`/implement` and losing partial work to a budget-exhausted session.
- **Split into 4+ sub-shards** (per-finding granularity). Rejected: over-fragments the boilerplate fan-out and forces unnecessary PR churn. Two shards is the minimum split that separates load-bearing from boilerplate.

## Consequences

- S1a remains the sequential prerequisite — S1b/S2/S3/S4 cannot launch until S1a merges.
- S1b becomes a parallel-worktree shard alongside S2/S3/S4 — total parallel wave is 4 shards instead of 3 after S1a.
- Plan v2 § Shard 1 sub-sections 1.1–1.3 + part of 1.4 map to S1a; sub-section 1.5 maps to S1b (the existing structural seam in plan v2).
- Capacity budget for /implement preserved on both shards.

## For Discussion

1. Plan v2 § "Effort estimate" rated Shard 1 as "1 session" with the F14 per-batch discipline as the within-session safeguard. The redteam invariant count (8+) edges the rule's 5–10 ceiling. Was the plan v2 estimate over-optimistic about how much load-bearing reasoning fits next to mechanical fan-out, or is the rule's ceiling itself conservative for boilerplate-heavy work?
2. Counterfactual: if the redteam had not flagged capacity overflow at /todos time, would the overflow have surfaced during `/implement` as (a) silent attention drift on load-bearing edits, or (b) a stalled session that loses partial work? Past evidence (e.g., kailash-ml W33b shipping orphaned code) suggests (a) is the higher-cost failure.
3. The split assumes S1b's 35-file mechanical pattern is uniform enough to qualify for the 5× boilerplate multiplier. Is there a sub-cluster within S1b (e.g., the a11y plumb spans 2 files with `id` prop threading) that is NOT pure stamping and might warrant pulling into S1a?

## Origin

`/todos` red-team Round 1 finding FT1 (HIGH), produced by `analyst` agent on 2026-05-08 against `S1-mechanical-and-action-driven.md`. Cross-references `rules/autonomous-execution.md` § "Per-Session Capacity Budget" and plan v2's Shard 1 structural sub-sections 1.5 (mechanical sweep) which provided the natural seam.
