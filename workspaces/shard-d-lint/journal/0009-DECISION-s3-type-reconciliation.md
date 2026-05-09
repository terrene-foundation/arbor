---
type: DECISION
date: 2026-05-09
created_at: 2026-05-09T10:30:00Z
author: agent
session_id: shard-d-implement-s3
session_turn: 1
project: shard-d-lint
topic: S3 — Type reconciliation lands (10 no-explicit-any + 2 unescaped + 3 Type D)
phase: implement
tags: [shard-d, implement, type-reconciliation, no-explicit-any, type-cascade]
---

# S3 — Type reconciliation closes 10 no-explicit-any errors at the source

## What

S3 reconciled six service-type interfaces with their backend response
shapes, narrowed two caught-error bindings, deleted three genuinely
dead local variables, and consolidated CompanySetupModal entirely (per
matrix consolidation). Cumulative S1a+S1b+S2+S3 lint delta:

| Stage           | Errors      | Warnings    |
| --------------- | ----------- | ----------- |
| Before S1a      | 31          | 52          |
| After S1a + S1b | 18          | 22          |
| After S2        | 12          | 16          |
| **After S3**    | **0 (-12)** | **13 (-3)** |

All 12 remaining errors and 3 of the 16 warnings cleared. Remaining 13
warnings are S4-owned (Type A dead imports + Type C param renames + Type
E investigation/wiring cases) per the file→owner matrix.

## Why the source-of-truth fix instead of the call-site fix

Per `01-analysis/03-type-safety-and-cleanup.md` § no-explicit-any
pattern observation: **7 of 10 `no-explicit-any` errors were not
form-state casts — they were type definitions lagging the backend
contract**. The `as any` was the developer's escape hatch when the
TypeScript interface in `services/api/*.ts` or `types/api.ts` did not
have a field the response actually carries.

The systemic fix is to align the type files with the backend response
shapes (one PR per service file is small). The remaining 2 are
caught-error bindings (`err: any`) which TS 4.4+ narrows automatically
when the annotation is dropped.

## Files touched (10 total)

Phase 1 — Service-type interface updates (commit ae9451a):

- `apps/web/src/types/api.ts::ClientCreateRequest` — added
  `estimated_headcount?: number`, made `uen` and `employee_count`
  optional. Backend `clients.py:96` accepts both legacy keys.
- `apps/web/src/services/api/leave.ts::LeaveType` — added canonical
  fields (`code?`, `category?`, `default_days?`, etc.) plus legacy
  aliases (`leave_type_name?`, `entitlement_days?`, `gender_restriction?`).
- `apps/web/src/services/api/leave.ts::leaveApi.listTypes()` — widened
  return to `{ types?, leave_types?, count? }` since backend currently
  emits `leave_types`.
- `apps/web/src/services/api/projects.ts::Project` — added
  `budget_amount?` and `is_archived?` matching the backend model.
- `apps/web/src/services/api/appraisals.ts::AppraisalTemplate` — added
  `created_at?` and `updated_at?` (DataFlow auto-managed).
- `apps/web/src/services/api/recruitment.ts::JobListing` — added
  `position_title?` (canonical backend field).
- `apps/web/src/services/api/employees.ts::listInvitations()` —
  widened return to `Invitation[] | { invitations: Invitation[] }`.

Phase 2 — Cast removal at call sites (commit 13068ef):

- `(auth)/onboarding/page.tsx` — dropped `as any` on `clientsApi.create`
  call AND narrowed `catch (err: any)` to `catch (err)` with
  `instanceof Error` check.
- `(dashboard)/appraisals/page.tsx:672` — dropped `(t as any).created_at`.
- `(dashboard)/employees/page.tsx:926` — replaced
  `(data as any)?.invitations` with type-guarded narrowing.
- `(dashboard)/leave/page.tsx:867,1003` — dropped `(typesRes as any)`
  and `(lt: any)`.
- `(dashboard)/projects/page.tsx:248` — dropped `(p: any)` annotation.
- `(dashboard)/recruitment/page.tsx:932` — dropped `(job as any).position_title`.

Phase 3 — Type D dead var deletions (commit 835322b):

- `components/dashboard/ExpiringDocumentsWidget.tsx:64` —
  `const ninetyDaysMs` assigned but never read; threshold computed
  inline at line 75.
- `app/(dashboard)/shifts/page.tsx:34` — `function formatCurrency`
  declared but never called.
- `tests/e2e/helpers/auth.helper.ts:96` — `const request = route.request()`
  never read.

Phase 4 — CompanySetupModal consolidation (commit 7a433e3):

- 2 × `react/no-unescaped-entities` — `'` → `&apos;` on "I'll do this
  later" and "You're all set!".
- `catch (err: any)` → `catch (err)` with `instanceof Error` narrowing
  - `humanizeError()` integration; backend `detail` field preferred
    for actionable copy when present.
- 2 × `as any` casts dropped (downstream of Phase 1 interface update).

## Why catch-error narrowing instead of a typed ApiError interface

`services/api/errors.ts::humanizeError(error: unknown)` already
provides the canonical narrowing pattern for transport-level errors
(401/403/429/500/503, network/timeout). For CompanySetupModal, the
backend `detail` field is preferred when present (actionable copy
like "UEN already registered") with `humanizeError()` as fallback.
This avoids defining a competing `interface ApiError` in 10 different
service files; the existing `humanizeError()` is the single
source-of-truth narrowing utility.

## What was NOT touched

S3 deliberately did NOT edit `apps/web/src/app/(dashboard)/analytics/page.tsx`
per matrix line 14 + F12 — S2's 6-useQuery rewrite eliminated the
analytics Type D quartet (`reportLoading`, `metricsError`,
`feedbackError`, `reportError`) as a structural side effect. Touching
that file from S3 would have created the cross-shard collision the
matrix exists to prevent.

## Acceptance gates (all green)

```
$ cd apps/web && npx eslint . 2>&1 | tail -3
✖ 13 problems (0 errors, 13 warnings)
$ npx tsc --noEmit
(clean — no output)
$ npm run test -- --run
Test Files  11 passed (11)
Tests       73 passed (73)
$ npm run build
✓ Compiled successfully in 2.4s
✓ Generating static pages using 15 workers (57/57) in 175.3ms
```

No `as any`, no `as unknown as`, no `// @ts-ignore`, no new
`// eslint-disable-*` comments introduced. Verified via:

```
git diff 2135c9c2..HEAD -- apps/web/ | grep '^+' \
  | grep -E 'as any|as unknown as|@ts-ignore|eslint-disable'
```

— all matches are inside doc comments explaining why the cast was
removed; zero matches in code.

## Commits

- `ae9451a` — Phase 1: align service-type interfaces with backend response shapes
- `13068ef` — Phase 2: drop `as any` casts at call sites
- `7a433e3` — Phase 4: clean CompanySetupModal lint surface (matrix consolidation)
- `835322b` — Phase 3: delete 3 Type D dead variables

## Cross-references

- Matrix file→owner ownership: `02-plans/02-implementation-plan-v2.md` § "File→owner matrix"
- Type analysis: `01-analysis/03-type-safety-and-cleanup.md` § no-explicit-any
- F12 (analytics quartet absorbed by S2): `01-analysis/04-redteam-round-1.md`
- Cascading Type E investigation list (S4 deliverable): same analysis doc § Type E
