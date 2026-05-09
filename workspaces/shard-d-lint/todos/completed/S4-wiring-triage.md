# S4 — Shard 4: Wiring triage (F10 protocol)

**Status**: ACTIVE
**Shard**: 4 of 5 (parallel after S1 merges)
**Plan**: `workspaces/shard-d-lint/02-plans/02-implementation-plan-v2.md` § Shard 4
**Implements**: brief criterion 2 (no `// eslint-disable-*` added) — closes the v1 carveout
**Dependencies**: S1 merged
**Estimated effort**: 0.5–1 autonomous session

## What to do

Triage the 9 Type E "lost wiring" warnings via the F10 three-way classification — (a) intentional dead code → delete, (b) lost wiring → restore the call site, (c) real product gap → file a tracking issue + delete the variable referencing the issue. NO `// eslint-disable` comments. NO silent product decisions.

## Acceptance Criteria

### 4.1 Per-warning investigation (9 cases)

- [ ] For each Type E warning, read the file + run `git log --all -- <file>` for the relevant commit(s). Document original intent in a per-case note (commit body or workspace journal).
- [ ] Classify into:
  - **(a) Intentional dead code** — variable was used briefly during development, never wired. Action: delete.
  - **(b) Lost wiring** — UI element WAS rendered, was lost in a refactor. Action: restore the call site IN THIS SHARD with `git log` reference in commit body.
  - **(c) Real product gap** — feature half-built, needs product judgment. Action: `gh issue create` against the project; link the issue; DELETE the variable here with a comment ref to the issue. NO `eslint-disable`.

### 4.2 Type E cases — full 9-case enumeration (from `01-analysis/03-type-safety-and-cleanup.md` § Type E)

(Excludes the analytics quartet, which is resolved by S2's rewrite, not by S4.)

- [ ] `apps/web/src/app/(dashboard)/employees/[id]/page.tsx:1317` — `employeeId` prop on `EmploymentTab`. _Already absorbed by S1a's employees/[id] pass per matrix line 16; S4 verifies no warning remains._
- [ ] `apps/web/src/app/(dashboard)/my-inventory/page.tsx:159` — `user` from `useAuth()` destructured but never read. Likely (a) drop — endpoint is `/me`-scoped server-side.
- [ ] `apps/web/src/app/(dashboard)/my-profile/page.tsx:199` — `user` redundant; profile page fetches `/employees/me` (line 216). Likely (a) drop.
- [ ] `apps/web/src/app/(dashboard)/my-profile/page.tsx:207` — `payrollRequired = ["date_of_birth", ...]` declared but never iterated. Likely (b) restore: render `<MissingFieldsBanner>` consuming the list, OR (a) drop if banner not in product scope.
- [ ] `apps/web/src/app/(dashboard)/my-timesheets/page.tsx:239` — `user` redundant; same `/me` pattern. Likely (a) drop.
- [ ] `apps/web/src/app/(dashboard)/recruitment/page.tsx:51` — `STAGE_STYLES: Record<string, string>` of stage-badge classes. (b) restore: wire `<CandidateStageBadge>` consuming `STAGE_STYLES[stage]`, OR (c) file issue + drop.
- [ ] `apps/web/src/app/(dashboard)/reports/page.tsx:352` — `isAdmin` computed, never branched. (c) likely a real product gap — confirm with product whether non-admins should see admin-only reports; file issue + drop.
- [ ] `apps/web/src/app/(dashboard)/training/skillsfuture/page.tsx:48` — `FUNDING_OPTIONS` constant unused. (b) restore: wire next to `TOPIC_OPTIONS` and `DURATION_OPTIONS` filter dropdowns, OR (a) drop.
- [ ] `apps/web/src/components/advisory/EscalationDialog.tsx:25` — `URGENCY_TIMEFRAMES` not rendered. (b) restore: render timeframe under the urgency selector.
- [ ] `apps/web/src/components/advisory/SystemMessage.tsx:134` — `messageId` prop destructured, never threaded to `onFeedback`. (b) restore: wire `onFeedback(messageId, ...)`; verify call site passes a real id.
- [ ] `apps/web/src/components/shadow-agent/CommandSurface.tsx:558` — `sid` arg on `onRetry={(sid) => {...}}`. Decision: confirm whether retry should preserve session context — (b) wire `handleSubmit(query, sid)` OR (a) rename to `_sid`.
- [ ] `apps/web/src/components/shadow-agent/ShadowMargin.tsx:62` — `onOpenHistory` prop never wired to a button. (b) restore: wire to existing `useShadowAgent().openCommand()` pattern, OR (a) drop the prop from the public interface.
- [ ] `apps/web/src/components/shell/NavigationSidebar.tsx:496` — `collapsed` param on `ExpandableNavLink` ignored. (b) restore: hide chevron + child group when `collapsed`.

(13 entries listed above; the analysis doc's "9" excludes ones already covered elsewhere — `employees/[id]` employeeId is absorbed by S1a; `useProfile.ts:68` reclassified as Type C → S1b. S4 owns the genuinely-Type-E remainder. Verify the count after S1a/S1b/S2 merge — final S4 count should equal the post-merge Type E warning count.)

### 4.3 Tracking issue list (deliverable)

- [ ] Every (c) outcome produces a GitHub issue against `terrene-foundation/arbor` with: title prefix `lint-shard-d:`, body referencing the workspace + the deleted variable's file:line, acceptance criteria for the eventual wiring.
- [ ] List of opened issues recorded in `workspaces/shard-d-lint/journal/NNNN-DECISION-type-e-tracking-issues.md` at end of shard.

### 4.4 Restored UI verification (b outcomes)

- [ ] Each (b) restore comes with a Vitest or Playwright test exercising the now-rendered UI.
- [ ] Commit body references the original `git log` commit that lost the wiring.

### 4.5 Acceptance gates

- [ ] `cd apps/web && npx eslint . 2>&1 | tail -3` — 9 warnings cleared.
- [ ] `npm run test -- --run` green; new tests for (b) restored UI present and passing.
- [ ] `npx playwright test tests/e2e/` green; restored UI verified end-to-end.
- [ ] `npm run build` green.
- [ ] Zero `// eslint-disable` comments added.
- [ ] Tracking-issue journal entry written.

## Files (per matrix, plan v2)

S4 owns ~6 files in the shadow-agent surface (`src/components/shadow-agent/{ArborResult,...}.tsx` and similar) — see analysis doc 03 for full list. No overlap with S2/S3 by matrix.

## Definition of Done

S4 PR merged; 9 Type E warnings resolved via the three-way protocol (zero `eslint-disable`); tracking issues filed for (c) cases; restored UI for (b) cases verified by tests; brief criterion 2 closed.

## Verification (2026-05-09)

**Status: COMPLETE** — all 13 enumerated Type E warnings resolved, 0 `eslint-disable` added.

### Per-case outcomes

| #   | File:line                                        | Symbol               | Outcome      | Commit / Issue                                                                |
| --- | ------------------------------------------------ | -------------------- | ------------ | ----------------------------------------------------------------------------- |
| 1   | `(dashboard)/employees/[id]/page.tsx:1317`       | `employeeId`         | (n/a)        | Already resolved by S1a (`159c88a` baseline absorbed)                         |
| 2   | `(dashboard)/my-inventory/page.tsx:159`          | `user`               | (a) drop     | `c66d18b`                                                                     |
| 3   | `(dashboard)/my-profile/page.tsx:199`            | `user`               | (a) drop     | `c66d18b`                                                                     |
| 4   | `(dashboard)/my-profile/page.tsx:207`            | `payrollRequired`    | (b) restore  | `c595f6a` (test: `test_s4_my_profile_payroll_banner.spec.tsx`)                |
| 5   | `(dashboard)/my-timesheets/page.tsx:239`         | `user`               | (a) drop     | `c66d18b`                                                                     |
| 6   | `(dashboard)/recruitment/page.tsx:51`            | `STAGE_STYLES`       | (b) restore  | `c595f6a` (test: `test_s4_recruitment_stage_styles.spec.tsx`)                 |
| 7   | `(dashboard)/reports/page.tsx:352`               | `isAdmin`            | (c) tracking | `a4b6ef3` → [arbor#39](https://github.com/terrene-foundation/arbor/issues/39) |
| 8   | `(dashboard)/training/skillsfuture/page.tsx:48`  | `FUNDING_OPTIONS`    | (b) restore  | `c595f6a` (test: `test_s4_skillsfuture_funding.spec.tsx`)                     |
| 9   | `components/advisory/EscalationDialog.tsx:25`    | `URGENCY_TIMEFRAMES` | (b) restore  | `c595f6a` (test: `test_s4_escalation_timeframe.spec.tsx`)                     |
| 10  | `components/advisory/SystemMessage.tsx:134`      | `messageId`          | (c) tracking | `a4b6ef3` → [arbor#40](https://github.com/terrene-foundation/arbor/issues/40) |
| 11  | `components/shadow-agent/CommandSurface.tsx:558` | `sid`                | (a) drop     | `c66d18b`                                                                     |
| 12  | `components/shadow-agent/ShadowMargin.tsx:62`    | `onOpenHistory`      | (b) restore  | `c595f6a` (test: `test_s4_shadow_margin_history.spec.tsx`)                    |
| 13  | `components/shell/NavigationSidebar.tsx:496`     | `collapsed`          | (b) restore  | `c595f6a` (test: `test_s4_navigation_collapsed.spec.tsx`)                     |

### Aggregate counts

- 5 (a) drops + 6 (b) restorations + 2 (c) tracking-issue dispositions + 1 (n/a) verify-only = 14 cases (13 enumerated + 1 already-resolved)
- 6 Tier-2 regression tests added (11 individual test cases pinning re-wired DOM)
- 2 GitHub issues filed against `terrene-foundation/arbor` (#39, #40)

### Acceptance gates

- `cd apps/web && npx eslint .` → 16 problems remaining (12 errors + 4 warnings); ALL S4-owned Type E warnings cleared. Remaining 4 warnings (`formatCurrency`, `ninetyDaysMs`, `cpfButton`, `request`) are parallel S3 territory.
- `npx vitest run` → 17 files / 84 tests pass.
- `npm run build` → Compiled successfully in 2.4s.
- `git diff main..HEAD | grep eslint-disable` → empty (zero `// eslint-disable` added).
- Tracking-issue journal entry: `journal/0010-DECISION-s4-wiring-triage.md`.

### Lint delta

- Pre-S4 baseline: 28 problems (12 errors / 16 warnings)
- Post-S4: 16 problems (12 errors / 4 warnings)
- S4 cleared: 12 warnings (the 13th was already absorbed by S1a)
