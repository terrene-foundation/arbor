# S3 — Shard 3: Type reconciliation

**Status**: ACTIVE
**Shard**: 3 of 5 (parallel after S1 merges)
**Plan**: `workspaces/shard-d-lint/02-plans/02-implementation-plan-v2.md` § Shard 3
**Implements**: `specs/_index.md` brief criterion 1 (0/0 lint) — type-safety class
**Dependencies**: S1 merged
**Estimated effort**: 1 autonomous session

## What to do

Reconcile service-type interfaces with backend response shapes (no `as any` workarounds), narrow caught-error bindings, delete the 3 of 4 Type D dead vars NOT covered by S2's analytics rewrite (the 4th — analytics quartet — is eliminated by S2 per F12), and absorb CompanySetupModal entirely (per matrix consolidation: 2 unescaped + Type B catch + 2 no-explicit-any in one file).

## Acceptance Criteria

### 3.1 Service-type interface updates (7 of 10 `no-explicit-any`)

- [ ] Read `workspaces/shard-d-lint/01-analysis/03-type-safety-and-cleanup.md` § no-explicit-any for the full list.
- [ ] `LeaveType` ← add `leave_type_name`.
- [ ] `Project` ← add `budget_amount`.
- [ ] `ClientCreateRequest` ← add `estimated_headcount`.
- [ ] (4 more — see analysis doc § no-explicit-any).
- [ ] `src/types/api.ts` is owned exclusively by S3 — no other shard edits this file.
- [ ] `src/services/api/{leave,projects,appraisals,employees}.ts` updated to match new types.

### 3.2 Caught-error narrowing (3 of 10 `no-explicit-any`)

- [ ] 3 × catch-error bindings narrowed via `instanceof Error` check OR `unknown` + type guard. NOT `as any`.

### 3.3 Type D dead var deletes (3 of 4)

- [ ] Delete the 3 Type D dead vars NOT on `analytics/page.tsx`:
  - `apps/web/src/components/dashboard/ExpiringDocumentsWidget.tsx:64` — `ninetyDaysMs` constant (threshold computed inline at line 75; constant is dead).
  - `apps/web/src/app/(dashboard)/shifts/page.tsx:34` — `formatCurrency` declared but never called.
  - `apps/web/tests/e2e/helpers/auth.helper.ts:96` — `request = route.request()` then never read.
- [ ] **S3 MUST NOT edit `analytics/page.tsx`** — the matrix assigns this file fully to S2; S2's 6-`useQuery` rewrite eliminates the 4th Type D quartet (`reportLoading`, `metricsError`, `feedbackError`, `reportError` at lines 369–377) as a side effect. S3 does not touch this file regardless of S2 merge order.

### 3.4 CompanySetupModal.tsx (matrix consolidation)

- [ ] 2 × `react/no-unescaped-entities` — substitute `&apos;` (or `&rsquo;`) appropriately.
- [ ] Type B catch binding → `} catch {`.
- [ ] 2 × `no-explicit-any` resolved via interface or unknown+narrow (no `as any`).

### 3.5 Page consumers of new field types (cascade)

- [ ] After 3.1, run `npx tsc --noEmit` and fix EVERY surfaced error in the same shard. Pages likely affected per matrix line 29: `onboarding`, `appraisals`, `leave`, `projects`, `recruitment`, `employees`/page.tsx.
- [ ] No `// @ts-ignore` introduced; if a downstream consumer needs further type work, file a tracking issue and document.

### 3.6 Acceptance gates

- [ ] `cd apps/web && npx eslint . 2>&1 | tail -3` — at least 10 errors and 3 warnings removed.
- [ ] `npx tsc --noEmit` clean (type changes can cascade — fix all surfaced errors in this shard).
- [ ] `npm run test -- --run` green.
- [ ] `npm run build` green.
- [ ] No `as any`, no `as unknown as`, no `// @ts-ignore` introduced.

## Files (per matrix, plan v2)

S3 owns: `src/types/api.ts`, `src/services/api/*.ts`, `CompanySetupModal.tsx` (entirely), and the cascading consumer pages: `(dashboard)/{onboarding,appraisals,leave,projects,recruitment,employees}/page.tsx`. Approximately 10 files total. NO overlap with S2's analytics rewrite (S2 absorbs the Type D quartet via the rewrite).

## Definition of Done

S3 PR merged; 10 `no-explicit-any` errors resolved at the type-truth level (interface updates) AND error-narrowing level; CompanySetupModal lint-clean; type cascade resolved across 6 consumer pages; all acceptance gates green.

## Verification

**Status**: COMPLETE — 2026-05-09 (worktree `arbor-s3`, branch `feat/shard-d-s3-types`)

### Lint delta (cumulative)

| Stage           | Errors      | Warnings    |
| --------------- | ----------- | ----------- |
| Before S1a      | 31          | 52          |
| After S1a + S1b | 18          | 22          |
| After S2        | 12          | 16          |
| **After S3**    | **0 (-12)** | **13 (-3)** |

All 12 remaining errors removed (10 `no-explicit-any` + 2 `react/no-unescaped-entities`). 3 of 16 warnings cleared via Type D dead-var deletes. Remaining 13 warnings are S4-owned per the file→owner matrix.

### Acceptance gates

- `cd apps/web && npx eslint . 2>&1 | tail -3` → `✖ 13 problems (0 errors, 13 warnings)` — at least 10 errors and 3 warnings removed ✓
- `npx tsc --noEmit` → clean (no output) ✓
- `npm run test -- --run` → 11 files passed / 73 tests passed ✓
- `npm run build` → `✓ Compiled successfully in 2.4s; ✓ Generating static pages 57/57` ✓
- No `as any`, no `as unknown as`, no `// @ts-ignore` introduced (verified via `git diff` grep — all matches in doc comments) ✓
- No new `// eslint-disable-*` comments ✓

### Commits

- `ae9451a` — fix(web): align service-type interfaces with backend response shapes (Phase 1)
- `13068ef` — fix(web): drop `as any` casts at call sites for service-type alignment (Phase 2)
- `7a433e3` — fix(web): clean CompanySetupModal lint surface (matrix consolidation) (Phase 4)
- `835322b` — fix(web): delete 3 Type D dead variables (Phase 3)

### Files touched (10 total — exact match to matrix line 28-29)

Source-of-truth types:

- `apps/web/src/types/api.ts` (ClientCreateRequest)
- `apps/web/src/services/api/leave.ts` (LeaveType + listTypes)
- `apps/web/src/services/api/projects.ts` (Project)
- `apps/web/src/services/api/appraisals.ts` (AppraisalTemplate)
- `apps/web/src/services/api/recruitment.ts` (JobListing)
- `apps/web/src/services/api/employees.ts` (listInvitations)

Consumer pages (cascade):

- `apps/web/src/app/(auth)/onboarding/page.tsx`
- `apps/web/src/app/(dashboard)/appraisals/page.tsx`
- `apps/web/src/app/(dashboard)/employees/page.tsx`
- `apps/web/src/app/(dashboard)/leave/page.tsx`
- `apps/web/src/app/(dashboard)/projects/page.tsx`
- `apps/web/src/app/(dashboard)/recruitment/page.tsx`

Matrix consolidation:

- `apps/web/src/components/company/CompanySetupModal.tsx`

Type D dead-var deletes:

- `apps/web/src/components/dashboard/ExpiringDocumentsWidget.tsx`
- `apps/web/src/app/(dashboard)/shifts/page.tsx`
- `apps/web/tests/e2e/helpers/auth.helper.ts`

### Journal

- `journal/0009-DECISION-s3-type-reconciliation.md`
