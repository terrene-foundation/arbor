# S1b — Shard 1b: Mechanical fan-out (boilerplate)

**Status**: ACTIVE
**Shard**: 1b of 5 (parallel worktree after S1a merges; runs alongside S2/S3/S4)
**Plan**: `workspaces/shard-d-lint/02-plans/02-implementation-plan-v2.md` § Shard 1, sub-section 1.5 ("Mechanical sweep — boilerplate fan-out")
**Implements**: brief criterion 1 (lint surface reduction) — pure boilerplate class
**Dependencies**: S1a merged
**Estimated effort**: 1 autonomous session (boilerplate per `rules/autonomous-execution.md` Rule 2 — single pattern stamped across 35+ files)

## Why split from S1a

Per `/todos` red-team FT1 (HIGH): pure boilerplate fan-out (one pattern per file, no cross-file reasoning) MAY use up to 5× the base session budget per autonomous-execution Rule 2. Keeping it separate from S1a's load-bearing investigations protects the invariant ceiling on S1a AND lets S1b run in parallel with S2/S3/S4.

## What to do

Stamp out the genuinely-mechanical fixes across ~35 files. After every 5-file batch, run `npx eslint . 2>&1 | tail -3` — if the count moves UP, abort that file's edit and diagnose (per F14).

Files owned by S2/S3/S4 (per matrix lines 13–32) MUST be skipped here even if they have Type A imports — those shards absorb their own. Cross-reference the matrix before each deletion.

## Acceptance Criteria

### 1.5.1 Type A — dead imports (29)

- [ ] Delete 29 unused imports across files NOT owned by S2/S3/S4 per matrix. The full list lives in `01-analysis/03-type-safety-and-cleanup.md` § Type A.
- [ ] BLOCKED files (matrix-owned by other shards): `signup/page.tsx` (S2), `dashboard/page.tsx` (S2 absorbs Type A AlertBanner), `documents/page.tsx` (S2), `documents/[id]/preview/page.tsx` (S2 absorbs Type A Download), `analytics/page.tsx` (S2 owns rewrite), `EmployeePicker.tsx` (S2), `CompanySetupModal.tsx` (S3), service files in `services/api/*.ts` (S3).

### 1.5.2 Type B — catch bindings (2)

- [ ] `apps/web/src/app/(dashboard)/my-profile/page.tsx:218` — `} catch (err) { ... }` → `} catch { ... }`.
- [ ] `apps/web/tests/e2e/helpers/auth.helper.ts:116` — same pattern.
- [ ] BLOCKED: `signup/page.tsx` Type B (S2 absorbs); `CompanySetupModal.tsx` Type B (S3 absorbs).

### 1.5.3 Type C — required params unused (4)

- [ ] `apps/web/src/app/(dashboard)/my-payslips/page.tsx:24` — `formatPeriod(start, end)` → `_end` (function only formats start).
- [ ] `apps/web/src/app/(dashboard)/payroll/[id]/page.tsx:46` — same → `_end`.
- [ ] `apps/web/src/app/(dashboard)/payroll/page.tsx:39` — same → `_end`.
- [ ] `apps/web/src/lib/prism-advisory-adapter.ts:85` — `_data` already prefixed; resolution depends on S1a § 1.1 preflight outcome (rule misconfig vs different-rule).

### 1.5.4 Module variable rename

- [ ] `src/components/shadow-agent/ArborResult.tsx:50` — rename local `module` → `targetModule` (resolves `@next/next/no-assign-module-variable`).

### 1.5.5 a11y plumb

- [ ] `src/components/shell/TopBar.tsx:226` — add `aria-controls="topbar-search-results"` on the `role="combobox"` input.
- [ ] `src/components/shell/SearchResults.tsx` — accept and forward `id` prop to the listbox container.
- [ ] Caller passes `<SearchResults id="topbar-search-results" />`.

### 1.5.6 Eslint config tweak (conditional)

- [ ] If S1a § 1.1 preflight concluded "config tweak needed", apply it to `apps/web/eslint.config.mjs`. Otherwise skip.

### 1.5.7 Acceptance gates

- [ ] `cd apps/web && npx eslint . 2>&1 | tail -3` — at least 36 problems removed (29 Type A + 2 Type B + 4 Type C + module + a11y + optional config tweak).
- [ ] Per-batch `npx eslint . | tail -3` count moved monotonically toward 0 across the session (F14 process discipline).
- [ ] `npx tsc --noEmit` clean.
- [ ] `npm run test -- --run` green.
- [ ] `npm run build` green.
- [ ] No new `// eslint-disable-*` comments.
- [ ] No matrix-owned file accidentally edited (cross-check via `git diff --name-only`).

## Files

S1b owns: ~30 files for Type A deletions, 2 files for Type B catch, 3 files for Type C `formatPeriod`, 1 file for `useProfile` (Type C `_data`), `ArborResult.tsx`, `TopBar.tsx` + `SearchResults.tsx`, optional `eslint.config.mjs`. Matrix-owned files BLOCKED.

## Definition of Done

S1b PR merged; ~36 lint problems cleared via mechanical pattern application; zero matrix-violation edits; all acceptance gates green.
