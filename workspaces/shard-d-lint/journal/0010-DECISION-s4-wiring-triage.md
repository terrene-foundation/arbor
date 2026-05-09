---
type: DECISION
date: 2026-05-09
created_at: 2026-05-09T02:20:00Z
author: agent
session_id: shard-d-s4
session_turn: 1
project: arbor
topic: Shard D S4 — Type E wiring triage outcomes (a)/(b)/(c) per F10 protocol
phase: implement
tags: [shard-d, lint, s4, wiring, triage, f10, type-e]
---

# DECISION — Shard D S4 wiring triage: 5 (a) drops, 6 (b) restorations, 2 (c) tracking issues

## Decision

Resolved all 13 enumerated Type E `@typescript-eslint/no-unused-vars`
warnings owned by Shard D S4 via the F10 triage protocol — three
outcomes only: (a) intentional dead code → delete; (b) lost wiring →
restore the call site with regression test; (c) real product gap →
file GitHub tracking issue + delete variable. Brief criterion 2
(ZERO `// eslint-disable` comments added) is preserved.

## Per-case classification

| #   | File:line                                        | Symbol               | Outcome | Action                                                                                                                              |
| --- | ------------------------------------------------ | -------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `(dashboard)/employees/[id]/page.tsx:1317`       | `employeeId`         | (n/a)   | Already absorbed by S1a (PR previously merged); not in S4 baseline                                                                  |
| 2   | `(dashboard)/my-inventory/page.tsx:159`          | `user`               | **(a)** | Drop destructure + `useAuth` import; `/me` endpoints JWT-scoped server-side                                                         |
| 3   | `(dashboard)/my-profile/page.tsx:199`            | `user`               | **(a)** | Drop destructure + `useAuth` import; `/employees/me` carries canonical payload                                                      |
| 4   | `(dashboard)/my-profile/page.tsx:207`            | `payrollRequired`    | **(b)** | Render "Payroll cannot be processed yet" banner listing missing payroll-critical fields                                             |
| 5   | `(dashboard)/my-timesheets/page.tsx:239`         | `user`               | **(a)** | Drop destructure + `useAuth` import; same `/me` pattern                                                                             |
| 6   | `(dashboard)/recruitment/page.tsx:51`            | `STAGE_STYLES`       | **(b)** | Wire to candidate Kanban column header — colour badge per stage                                                                     |
| 7   | `(dashboard)/reports/page.tsx:352`               | `isAdmin`            | **(c)** | Filed [#39](https://github.com/terrene-foundation/arbor/issues/39); `ReportDef` needs `adminOnly` field — product judgment required |
| 8   | `(dashboard)/training/skillsfuture/page.tsx:48`  | `FUNDING_OPTIONS`    | **(b)** | Replace hardcoded `<option>` block with `FUNDING_OPTIONS.map()`                                                                     |
| 9   | `components/advisory/EscalationDialog.tsx:25`    | `URGENCY_TIMEFRAMES` | **(b)** | Render expected SLA copy as helperText under urgency selector                                                                       |
| 10  | `components/advisory/SystemMessage.tsx:134`      | `messageId`          | **(c)** | Filed [#40](https://github.com/terrene-foundation/arbor/issues/40); requires backend schema + S3-owned service edit                 |
| 11  | `components/shadow-agent/CommandSurface.tsx:558` | `sid`                | **(a)** | Drop arg from arrow fn; retry mints fresh session_id                                                                                |
| 12  | `components/shadow-agent/ShadowMargin.tsx:62`    | `onOpenHistory`      | **(b)** | Add History icon button next to "Ask Arbor..." command bar                                                                          |
| 13  | `components/shell/NavigationSidebar.tsx:496`     | `collapsed`          | **(b)** | Wire collapsed render to icon-only Link with tooltip; remove parent's `&& !collapsed` short-circuit                                 |

**Aggregate**: 5 (a), 6 (b), 2 (c), 1 verify-only. Zero `eslint-disable`.

## Tracking issues filed

- [arbor#39](https://github.com/terrene-foundation/arbor/issues/39) —
  `lint-shard-d: wire admin-only report gating in reports/page.tsx`.
  Three financial reports (Payroll Summary, Claims Summary, Project
  Costs) likely should be hidden from non-admin employees but
  `ReportDef` has no `adminOnly` field. Backend access enforcement
  exists; this is about hiding the entry-point card.
- [arbor#40](https://github.com/terrene-foundation/arbor/issues/40) —
  `lint-shard-d: thread message_id through advisory feedback callback`.
  Per-message feedback requires (a) backend `FeedbackSubmission`
  schema field, (b) `services/api/learning.ts` interface field
  (S3 territory), (c) ChatContainer ID-assignment, and (d)
  SystemMessage prop re-introduction. Out of scope for the lint
  workstream.

## Restored UI tests added (b outcomes)

Six Tier-2 regression tests under
`apps/web/tests/regression/test_s4_*.spec.tsx`, each pinning the
re-wired DOM:

- `test_s4_escalation_timeframe.spec.tsx` (3 tests) — URGENCY_TIMEFRAMES
- `test_s4_my_profile_payroll_banner.spec.tsx` (2 tests) — payrollRequired
- `test_s4_navigation_collapsed.spec.tsx` (2 tests) — collapsed expandable nav
- `test_s4_recruitment_stage_styles.spec.tsx` (1 test) — STAGE_STYLES
- `test_s4_shadow_margin_history.spec.tsx` (2 tests) — onOpenHistory
- `test_s4_skillsfuture_funding.spec.tsx` (1 test) — FUNDING_OPTIONS

All pass: 17/17 test files, 84/84 tests green.

## Acceptance gates

| Gate                            | Result                                                                                                                                                                                                                                                                                           |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cd apps/web && npx eslint .`   | 16 problems remaining (12 errors + 4 warnings); all 12 S4-owned Type E warnings cleared. The 4 remaining warnings are parallel S3 territory: `formatCurrency` (shifts/page.tsx), `ninetyDaysMs` (ExpiringDocumentsWidget.tsx), `cpfButton` (05-calculators.spec.ts), `request` (auth.helper.ts). |
| `npx vitest run`                | 17 files pass / 84 tests pass                                                                                                                                                                                                                                                                    |
| `npm run build`                 | Compiled successfully in 2.4s                                                                                                                                                                                                                                                                    |
| `// eslint-disable` count added | **0** (verified via `git diff main..HEAD \| grep eslint-disable`)                                                                                                                                                                                                                                |
| Tracking-issue journal entry    | This file                                                                                                                                                                                                                                                                                        |

## Alternatives considered

1. **Single big-bang commit** — rejected. Three F10 outcome classes
   are conceptually distinct (drops vs restorations vs tracking
   issues); progressive commits make `git log --grep` and revert
   targeting practical.
2. **Use `_messageId` rename for case 10 (Type C-style)** — rejected.
   The prop's intent (per-message feedback) requires a backend schema
   change that S4 cannot make; renaming would silence the warning
   while pretending the wiring is intentional. (c) + tracking issue
   is the honest disposition.
3. **Restore `isAdmin` filter as `REPORTS.filter((r) => !r.adminOnly || isAdmin)`
   without adding the `adminOnly` field** — rejected. With no
   `adminOnly` field, the filter is a no-op; restoring the variable
   without the field would re-create the same warning shape on the
   field property instead. Tracking issue is the correct path.
4. **Keep the parent's `item.children && !collapsed` guard and rename
   `collapsed` to `_collapsed` in ExpandableNavLink** — rejected.
   The brief explicitly biased toward (b) restoration ("hide chevron
   - child group when collapsed"). Restoring is more robust because
     the prop becomes consistent with NavLink's collapsed behaviour;
     the alternative leaves a weird inconsistency where the function
     accepts a prop it never uses.

## Consequences

- Lint count cumulative: 28 problems pre-S4 → 16 post-S4 (12 cleared).
- Two product gaps (#39, #40) are now visible in the issue tracker
  rather than buried as "unused variable" warnings.
- Six pieces of UI that previously existed as constants but never
  rendered are now visible to users (payroll banner, stage colour
  badges, funding select, urgency SLA, history button, collapsed
  expandable nav).
- The `messageId` prop dropped from `SystemMessageProps` is a
  backwards-incompatible change for any external consumer, but the
  type was never threaded into the call site (`ChatContainer`
  doesn't pass `messageId`), so no consumer was relying on it.

## Follow-up actions

- [ ] Issue [#39](https://github.com/terrene-foundation/arbor/issues/39):
      add `adminOnly` to `ReportDef`, wire filter, add regression test
- [ ] Issue [#40](https://github.com/terrene-foundation/arbor/issues/40):
      thread `message_id` through feedback (backend schema + service +
      frontend prop)
- [ ] After all Shard D shards merge, /codify the lint workstream
      patterns into `apps/web/.claude/skills/`

## For Discussion

1. **Counterfactual**: if Shard D had shipped `// eslint-disable` for
   all 13 Type E warnings (the v1 plan's option (c)), how many of the
   real product gaps surfaced here would have been silently buried?
   At minimum #39 and #40 — the two (c) outcomes — but arguably also
   the 6 (b) restorations, since each was a feature ALREADY built but
   inaccessible. The F10 protocol's "no eslint-disable" rule was the
   forcing function that made the gaps visible.
2. **Specific data**: of the 6 (b) restorations, the `STAGE_STYLES`
   case (recruitment Kanban) was the most visually impactful — seven
   stage columns went from indistinguishable plain text to colour-
   coded badges. Did the original feature ship without that styling
   intentionally (developer ran out of time and shipped the
   constant), or was it ripped out in a refactor? `git log --all
--follow` shows the constant was added in commit 6b95704 ("Arbor
   v1.0") in the same commit as the JOB_STATUS_STYLES sibling that
   IS rendered. So it was paired with its sibling but lost its
   render path before the v1.0 commit landed.
3. **Could messageId be wired without the backend change**? Yes,
   technically — frontend could assign UUIDs to assistant messages
   and pass them, but the backend would discard them; the feedback
   row would still be session-scoped, not message-scoped. That
   would be a "the wire is connected but the line is dead" outcome,
   indistinguishable from the current state. The (c) outcome with
   tracking issue is the honest path; the wiring needs the full
   stack to mean anything.
