# S2 — Shard 2: TanStack Query migrations + regression suite

**Status**: ACTIVE
**Shard**: 2 of 5 (parallel after S1 merges)
**Plan**: `workspaces/shard-d-lint/02-plans/02-implementation-plan-v2.md` § Shard 2
**Implements**: `specs/frontend-data-fetching.md` (canonical pattern + per-hook staleTime decisions)
**Dependencies**: S1 merged
**Estimated effort**: 1 autonomous session (largest single shard; regression tests dominate LOC)

## What to do

Migrate 6 fetch-on-mount Cat A pages to TanStack Query, build the missing hooks, ship per-page Tier-2/Tier-3 regression tests against MSW or stubbed backend. Worktree-isolated branch (per `rules/worktree-isolation.md`); no file overlap with S3/S4 per matrix.

The cache layer is a behavioral change (not syntactic), so brief criterion 4 ("no regression in production behavior") is satisfied ONLY by the regression suite — manual playwright is BLOCKED per F9.

## Acceptance Criteria

### 2.1 Pre-migration callsite enumeration (F2)

- [ ] For each of the 6 migrated pages, run `grep -n "fetchTemplates\|setError\|setLoading" <file>` and write the consumer map (which callsites become `query.refetch`, which become `() => { void query.refetch(); }` shape adapters, which become explicitly-rendered branches).
- [ ] `documents/page.tsx:176` — `<ErrorState onRetry={fetchTemplates}/>` callsite explicitly handled (shape adapter if `onRetry` is `() => void`).
- [ ] `documents/[id]/preview/page.tsx:24-34` — invalid-id path renders explicit "Invalid template ID" branch (since `query.error === undefined` when `enabled: false`).

### 2.2 Hook discovery (F23)

- [ ] `find apps/web/src -name "useDashboard*" -o -name "useAnalytics*" -o -name "useTemplates*" -o -name "useEmployees*" -o -name "useAuth*"` — record results.
- [ ] For each hook NOT found, plan `apps/web/src/hooks/api/<name>.ts` creation. For each found, plan extension.

### 2.3 Build hooks (per F11 staleTime table)

- [ ] `useTemplates` — `staleTime: 0`, `refetchOnWindowFocus: true`. Reason: external admin can delete; user-clickable items must reflect server truth.
- [ ] `useTemplate(id)` — `staleTime: 0`, `refetchOnWindowFocus: true`. Same reason.
- [ ] `useDashboardSummary` — `staleTime: 30_000`, `refetchOnWindowFocus: true`.
- [ ] `useEmployeeForPicker` — `staleTime: 60_000`, `refetchOnWindowFocus: true`.
- [ ] `useAnalyticsReports` (×6 queries) — `staleTime: 5 * 60_000`, `refetchOnWindowFocus: false` (computed server-side, expensive).
- [ ] `useInviteValidation(token)` — `staleTime: 0`, `refetchOnWindowFocus: false`, `retry: false` (per F13: token rotation is real; `Infinity` is unsafe; never retry against a 4xx).
- [ ] Each hook's staleTime rationale documented inline as a 1-line comment in the hook file.
- [ ] **F21**: in `useInviteValidation`, document the `error.message` keyword sniff (`expired` / `already been used`) as a temporary bridge in the hook docstring. File a tracking issue against the BACKEND for structured `error.code` (e.g., `INVITE_EXPIRED`, `INVITE_USED`) so the keyword sniff can be removed in a follow-up. Brittle pattern, not a stub — but root cause lives in the backend per brief constraint "address root causes, not suppress rules".

### 2.4 Page migrations (apply 2.1 callsite map)

- [ ] `signup/page.tsx` — `useInviteValidation` (F13 config); also absorbs S1's Type B catch on this file (matrix line 13).
- [ ] `dashboard/page.tsx` — `useDashboardSummary`; also absorbs S1's Type A AlertBanner import (matrix line 15) — explicitly delete the unused AlertBanner import as part of this migration.
- [ ] `documents/page.tsx` — `useTemplates` + onRetry adapter (F2); also absorbs any Type A imports on this file per matrix line 18 — explicitly grep `apps/web/src/app/(dashboard)/documents/page.tsx` for Type A unused imports listed in `01-analysis/03-type-safety-and-cleanup.md` and delete them.
- [ ] `documents/[id]/preview/page.tsx` — `useTemplate(id)` + invalid-id branch (F2); also absorbs S1's Type A Download import (matrix line 17) — explicitly delete the unused Download import.
- [ ] `analytics/page.tsx` — 6 × `useQuery` rewrite. Side effect: deletes the dangling `reportLoading`/`metricsError`/`feedbackError`/`reportError` state hooks AND their `setReportLoading(...)`/`setMetricsError(...)` callsites (F12). S3's Type D quartet on this file is now redundant.
- [ ] `EmployeePicker.tsx` (`src/components/design-system/`) — `useEmployeeForPicker`.

### 2.5 Regression suite (F9, F18)

- [ ] Per migrated page, add Tier-2 test at `apps/web/tests/regression/test_migration_<page>.spec.ts` (Vitest + MSW + React Testing Library) covering:
  - canned fixture data → expected user-visible text
  - loading state (Promise that doesn't resolve)
  - error state (mock returns 500)
  - empty state (mock returns `[]`)
- [ ] Pages requiring tests: `analytics`, `dashboard`, `documents` (list), `documents/[id]/preview`, `signup` (invite-validation), `EmployeePicker`.
- [ ] If any page is too complex for Tier-2 (full router context required), add Tier-3 Playwright spec at `apps/web/tests/e2e/test_migration_<page>.spec.ts`. Document the choice in commit body.
- [ ] If a migration cannot be validated without backend changes, file a GitHub issue + flag in workspace journal; do NOT ship the migration without the regression test (per F9, brief criterion 4).

### 2.6 Acceptance gates

- [ ] `cd apps/web && npx eslint . 2>&1 | tail -3` — at least 6 errors removed (the Cat A hits).
- [ ] `npx tsc --noEmit` clean.
- [ ] `npm run test -- --run` green INCLUDING new regression tests.
- [ ] `npx playwright test tests/regression/` green (or `tests/e2e/test_migration_*.spec.ts` if Tier-3 chosen).
- [ ] `npm run build` green.
- [ ] No new `// eslint-disable-*` comments.
- [ ] No `as any` / `as unknown as` / `// @ts-ignore` introduced.

## Files (per matrix, plan v2)

S2 owns ~6 pages exclusively (after S1 merges its parts on shared files): `signup/page.tsx`, `analytics/page.tsx` (full rewrite), `dashboard/page.tsx`, `documents/[id]/preview/page.tsx`, `documents/page.tsx`, `EmployeePicker.tsx`. Plus new hook files at `apps/web/src/hooks/api/` and new regression specs at `apps/web/tests/regression/`.

## Definition of Done

S2 PR merged; 6 fetches migrated; per-page regression tests green against canned fixtures; per-hook staleTime decisions justified inline; no behavioral regression observable through the regression suite. Brief criterion 4 satisfied via the regression suite, not manual playwright.
