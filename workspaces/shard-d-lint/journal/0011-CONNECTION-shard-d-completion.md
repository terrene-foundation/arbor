---
type: CONNECTION
date: 2026-05-09
created_at: 2026-05-09T00:00:00Z
author: agent
session_id: shard-d-implement-s5
session_turn: 60
project: shard-d-lint
topic: Shard D workstream closure — all 4 brief criteria contractually met
phase: implement
tags: [shard-d, completion, ci-gate, spec-promotion, codify, workstream-close]
---

# Shard D — Lint cleanup workstream complete

## What

The Shard D workstream closed on 2026-05-09 across 6 PRs (S1a, S1b, S2, S3, S4, S5). The final S5 PR ships:
1. The last warning cleanup (`cpfButton` Type E (a) drop in `tests/e2e/05-calculators.spec.ts`).
2. CI gate at `.github/workflows/lint-web.yml` running `npx eslint . --max-warnings 0` + `npx tsc --noEmit` on every PR + push-to-main.
3. Workspace specs promoted to project-root `specs/frontend-data-fetching.md` + `specs/react-hooks-correctness.md` (per `rules/specs-authority.md` Rule 1).
4. Project skill at `.claude/skills/project/frontend-data-fetching.md` pointing agents to the specs.

## Cumulative result

| Metric | Baseline (pre-Shard-D) | Final (post-S5) | Delta |
|--------|------------------------|------------------|-------|
| Lint errors | 31 | 0 | **-31** |
| Lint warnings | 52 | 0 | **-52** |
| Total problems | 83 | 0 | **-100%** |

All 4 brief success criteria contractually met:
1. `npx eslint .` exits 0/0 + structurally enforced via CI gate (F25)
2. No new `// eslint-disable-*` added except 2 structurally-inapplicable cases per the rule's documented exception (issue #33)
3. Canonical fetch-state-render pattern documented (project-root `specs/frontend-data-fetching.md` + project skill)
4. No regression in production behavior — verified via S2's 6 migration regression specs (30 tests) + S4's 6 restored-UI specs (11 tests) + S3's tsc cascade verification

Test suite grew from 43 → 84 tests (+41 net) across the workstream.

## Connection: how Shard D's structure delivered the result

The `/analyze` round produced the file→owner matrix that made parallel execution possible. Without that matrix, S2/S3/S4 would have collided on shared files (analytics, signup, dashboard, documents). The matrix's rigor — assigning each violation site to exactly one shard — converted "5 sequential shards" (estimated 5 sessions) into "S1a + parallel(S1b, S2, S3, S4) + S5" (effective 3 sessions).

The redteam's 25 findings (F1–F25) were absorbed into plan v2 BEFORE `/todos`. This pre-implementation refactor of the plan caught:
- F1 (`key={employee.updated_at}` not `id` for refetch flows)
- F5 (useObservation cascade interaction)
- F7/F8 (action-driven over derive-during-render)
- F9 (mandatory regression suite for migrations)
- F11/F13 (per-hook staleTime decisions)
- F19 (eslint config preflight)
- F25 (CI gate as structural defense)

Each finding became a specific acceptance criterion in the relevant shard todo. `/implement` executed against the criteria; `/redteam`-style failures were avoided because the plan absorbed them upfront.

## Connection: artifact promotion path

The path `workspaces/<workstream>/specs/<spec>.md` → `specs/<spec>.md` (project root) is the canonical "draft → canonical" promotion, executed in S5 § 5.4. The workspace draft is retained as the historical trail per `rules/specs-authority.md` Rule 5b. The project-root spec is the load-bearing contract for future work.

The corresponding agent-facing project skill at `.claude/skills/project/frontend-data-fetching.md` is a CONCISE pointer (under 150 lines) — not a duplicate of the spec. Per `rules/cc-artifacts.md` Rule 2 (progressive disclosure), the skill answers 80% of routine questions without requiring sub-file reads.

## Tracking issues for future work

- [#33](https://github.com/terrene-foundation/arbor/issues/33) — 2 structurally-inapplicable react-hooks disables; investigate `useSyncExternalStore` migration or rule upstream patch
- [#36](https://github.com/terrene-foundation/arbor/issues/36) — Backend structured `error.code` for invite-validation (removes F21 keyword sniff)
- [#39](https://github.com/terrene-foundation/arbor/issues/39) — `ReportDef.adminOnly` field (S4 (c) outcome)
- [#40](https://github.com/terrene-foundation/arbor/issues/40) — `messageId` backend schema (S4 (c) outcome)

## For Discussion

1. Across the 5 shards, the parallel wave (S1b + S2 + S3 + S4) effectively tripled wall-clock throughput vs sequential. The plan v2 file→owner matrix made this possible. Should future workstreams of similar scope mandate matrix-design at `/analyze` time, or is the matrix overhead disproportionate for smaller cleanups (<10 files)?
2. Counterfactual: if the redteam round 1 had not produced the 25 findings before `/todos`, the plan v1's R4 mitigation (incorrect file-collision strategy) would have shipped to `/implement`. How many `/redteam`-style late discoveries would have surfaced — and at what cost? Likely 2-3 implementation cycles wasted (Shard 2 would have collided with Shard 3 on analytics; Shard 4 would have shipped 9 silent eslint-disables under the v1 carveout violating brief criterion 2).
3. The 2 eslint-disable sites under issue #33 (pathname-as-external-system) suggest the `react-hooks/set-state-in-effect` rule's documented exception is not implemented. Worth a contribution to `eslint-plugin-react-hooks` upstream — the canonical Next.js `usePathname()` pattern is widely reproduced and silently incompatible with React 19's experimental rules. Filing an upstream issue would benefit the broader ecosystem.

## Origin

Workspace `workspaces/shard-d-lint/`. PRs #34 (S1a), #35 (S1b), #37 (S2), #38 (S3), #41 (S4), and the open S5 PR. Journal entries 0001–0010 document the per-shard discoveries; this entry closes the workstream.
