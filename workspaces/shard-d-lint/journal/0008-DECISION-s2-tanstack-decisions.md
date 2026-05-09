---
type: DECISION
date: 2026-05-09
created_at: 2026-05-09T10:00:00Z
author: agent
session_id: shard-d-implement-s2
session_turn: 30
project: shard-d-lint
topic: S2 — TanStack Query migrations + per-hook staleTime + regression suite
phase: implement
tags: [shard-d, implement, tanstack-query, regression-tests, stale-time, f21]
---

# S2 — TanStack Query migrations land with regression suite

## What

S2 migrated 6 fetch-on-mount Cat A pages to TanStack Query and shipped a
6-spec Tier-2 regression suite that pins the migration's behavioral parity.
Cumulative S1a+S1b+S2 lint delta:

| Stage             | Errors        | Warnings      |
| ----------------- | ------------- | ------------- |
| Before S1a        | 31            | 52            |
| After S1a + S1b   | 18            | 22            |
| **After S2**      | **12 (-6)**   | **16 (-6)**   |

The 6 errors removed are exactly the `react-hooks/set-state-in-effect`
violations on the 6 migrated pages (Cat A). The 6 warnings removed are the
analytics quartet (4 dangling state hooks absorbed by F12 cascade) plus the
unused `AlertBanner` import in `dashboard/page.tsx` and the unused `Download`
import in `documents/[id]/preview/page.tsx`.

## Per-hook staleTime decisions (F11)

| Hook                                | staleTime    | refetchOnWindowFocus | retry  | Rationale                                                             |
| ----------------------------------- | ------------ | -------------------- | ------ | --------------------------------------------------------------------- |
| `useDocumentTemplates`              | **0**        | `true`               | dflt   | External admin can delete; reflect server truth on every nav          |
| `useDocumentTemplate(id)`           | **0**        | `true`               | dflt   | Same — could be deleted between list and preview                      |
| `useDashboardCompliance`            | **30_000**   | `true`               | dflt   | Aggregate; staleness window acceptable for dashboard                  |
| `useDashboardMetrics`               | **30_000**   | `true`               | dflt   | Same                                                                   |
| `useEmployeeForPicker`              | **60_000**   | `true`               | dflt   | Profile data; rarely changes within session                           |
| `useAnalyticsWorkforce/Compliance/...` (6 queries) | **5*60_000** | `false`              | dflt   | Computed server-side, expensive; refresh-on-focus would be costly     |
| `useInviteValidation(token)`        | **0**        | **`false`**          | **`false`** | F13: token rotation is real; `Infinity` is unsafe; don't retry on 4xx |

Each rationale is documented inline as a 1-line comment in the hook file
(per acceptance criterion 2.3).

## F21 — Backend tracking issue

The `useInviteValidation` hook preserves the `error.message` keyword sniff
(`"expired"` / `"already been used"`) as a temporary bridge in
`signup/page.tsx`'s useMemo→InviteState mapping. The proper fix is for the
backend to return structured `error.code` (`INVITE_EXPIRED`, `INVITE_USED`,
`INVITE_INVALID`).

Tracked at: **terrene-foundation/arbor#36**.

The hook docstring + signup-page comment both reference #36. Once the
backend ships structured codes, the keyword sniff and the docstring caveat
can be removed in a single follow-up PR.

## Test-tier choices

All 6 migrations got Tier-2 component tests (no Tier-3 Playwright spec was
needed). Rationale per page:

- **documents/page.tsx**: pure client component; no router/auth. Tier 2.
- **documents/[id]/preview/page.tsx**: depends on `useParams`, mocked
  trivially. Tier 2.
- **signup/page.tsx**: depends on `useSearchParams` + `useRouter` +
  `useTranslation`, all mocked at the import boundary. Tier 2.
- **dashboard/page.tsx**: depends on `useAuth`, `useShadowContext`,
  `HRISModuleGrid`, all mocked. The test pins the no-company / loading /
  data / error / empty branches — exactly the behavioral parity F9 demanded.
  Tier 2.
- **analytics/page.tsx**: 6 parallel queries; mocked at service level. The
  test confirms all 6 cards render on success and the no-workforce empty
  state doesn't fire the workforce query. Tier 2.
- **EmployeePicker.tsx**: pure component; renderWithQueryClient wraps it
  directly. Tier 2.

The regression suite runs in <1 second wall-clock combined — the feedback
loop is fast enough to justify Tier 2 over Tier 3 even where Playwright
would have been technically valid.

## Surprises / blockers encountered

### 1. F2 invalid-id branch needed explicit rendering

In the original `documents/[id]/preview/page.tsx`, an invalid `templateId`
went through `setError("Invalid template ID")` inside the useEffect — a
synchronous code path. With `useQuery({ enabled: !invalidId })`,
`query.error` is `undefined` for the disabled case (it never ran), so
`query.error || data === null` is insufficient — the page MUST short-circuit
on `isInvalidId` BEFORE reading `query.error`. The regression test pins this
explicitly via the "invalid template ID" branch test, which both asserts
the rendered text AND that `getTemplate` was NOT called (proving
`enabled:false` did its job).

### 2. F17 useMemo wrap was needed in documents/page.tsx

After the migration, `data?.templates ?? []` produced a NEW lint warning at
`react-hooks/exhaustive-deps`: the `??` fallback allocates fresh `[]` per
render when `data` is undefined, destabilising the downstream `filtered`
useMemo's dep. Wrapping `templates` in its own `useMemo` resolved the
warning without behavior change. This is exactly the F17 antipattern the
workspace spec called out — confirmed in practice on the first migration.

### 3. EmployeePicker effect-based reconciliation was a set-state-in-effect

My first attempt at EmployeePicker added a `useEffect` to clear
`manualSelected` when the consumer changed `value`. That immediately
re-introduced the same `react-hooks/set-state-in-effect` error S2 was meant
to remove. The fix: move the reconciliation into the `selected` useMemo
itself by checking `manualSelected.id === value`. Pure derivation, no
effect, no cascading state.

### 4. Analytics test "100" ambiguity

DonutChart renders the workforce total in the donut's center, so a fixture
value of 100 collided with `metrics.kb_provisions = 100` AND with two
DonutChart inner-circle totals. Resolved by:
  - Choosing FIXTURE_WORKFORCE.total = 88 (donut subtotal) so it's distinct
    from KB provisions = 137
  - Using `getAllByText` for the 88 case (since donuts ALSO render 88) and
    asserting the four card LABELS (`"Total Employees"`, `"Compliance Score"`,
    `"Advisory Queries"`, `"KB Provisions"`) which are unique.

The lesson — and it's worth flagging in a future spec antipattern — is that
SummaryCard tests should pin LABELS rather than VALUES when the same value
might also appear in derived charts.

## For Discussion

1. The 30 regression tests across 6 files run in <1 second combined.
   What's the minimum baseline coverage we'd want for a future migration
   shard — this 4-state pattern (loading / data / error / empty), or
   should we expand to also cover refetch-on-window-focus + manual retry
   behaviors? Counterfactual: if a future migration only ships the
   data-success case test and skips loading/error/empty, what regression
   class do we re-open?

2. The `useInviteValidation` keyword-sniff bridge (issue #36) is the
   ONLY structural-bridge issue S2 ships. Is the right model "ship with
   tracking issue + docstring reference, remove on backend follow-up" —
   or should the brief have demanded the backend change land FIRST, with
   S2 blocked until then? Tradeoff: blocking S2 on a backend PR delays
   the lint baseline by 1+ session; shipping the bridge keeps the lint
   delta on schedule but inherits a "remove me" note.

3. The per-hook staleTime decisions assume external mutators (admin tabs,
   webhooks) are real. We don't currently have webhooks in production
   for any of these endpoints. If we never add them, are the
   `staleTime: 0` choices for documents over-cautious? Could we move to
   30s once we audit who actually mutates document templates outside
   the user's tab?

## Origin

S2 /implement session 2026-05-09. Branch `feat/shard-d-s2-tanstack`.
Commits `9084304` (hooks), `f320eed` (page migrations), `ea6b6e0`
(regression tests).

Backend tracking issue filed during this session:
https://github.com/terrene-foundation/arbor/issues/36
