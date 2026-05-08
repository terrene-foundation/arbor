# Type Safety, a11y, and Cleanup Classification

Generated: 2026-05-08. Scope: NON–react-hooks lint violations from
`workspaces/shard-d-lint/01-analysis/01-violation-inventory.md`. The
react-hooks set is classified separately in
`02-react-hooks-pattern-classification.md` and not duplicated here.

Total in scope: **11 errors** + **49 warnings**.

---

## Errors (11)

### `@typescript-eslint/no-explicit-any` (10)

| File:line                                                  | Current shape                                                                                                                                                                                                                                             | Proposed type                                                                                                                                                                                                                                                                                                            | Effort  |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- | ------------------ | ------- |
| `apps/web/src/app/(auth)/onboarding/page.tsx:44`           | `clientsApi.create({ name, sector, estimated_headcount } as any)` — caller uses `estimated_headcount`, `ClientCreateRequest` declares `employee_count`. Backend (`src/hr_advisory/api/routers/clients.py:96`) accepts BOTH keys.                          | Fix the request type. Either (preferred) add `estimated_headcount?: number` to `ClientCreateRequest` in `apps/web/src/types/api.ts:690` and have callers pass `employee_count`, OR (minimum) rename the call-site key to `employee_count: data.totalHeadcount                                                            |         | 5`. Drop the cast. | trivial |
| `apps/web/src/app/(auth)/onboarding/page.tsx:46`           | `} catch (err: any) { console.warn(..., err?.message); }`                                                                                                                                                                                                 | TS 4.4+: `} catch (err) {` (binding inferred as `unknown`); replace `err?.message` with `err instanceof Error ? err.message : String(err)`.                                                                                                                                                                              | trivial |
| `apps/web/src/app/(dashboard)/appraisals/page.tsx:672`     | `formatDate((t as any).created_at \|\| "")` — `t` is typed `AppraisalTemplate` which presumably lacks `created_at`.                                                                                                                                       | Add `created_at?: string;` to `AppraisalTemplate` in `apps/web/src/services/api/appraisals.ts:7` (the backend returns it; the type just hasn't caught up). Then drop the cast: `formatDate(t.created_at \|\| "")`.                                                                                                       | trivial |
| `apps/web/src/app/(dashboard)/employees/page.tsx:926`      | `Array.isArray(data) ? data : ((data as any)?.invitations ?? [])` — defensive shape probe. `employeesApi.listInvitations()` is typed `Promise<Invitation[]>` (services/api/employees.ts:300) but the backend may sometimes return `{invitations: [...]}`. | Either (preferred) tighten the API service to one canonical shape and remove the defensive branch, OR widen the return type to `Invitation[] \| { invitations: Invitation[] }` and use a type guard: `const list = Array.isArray(data) ? data : data.invitations ?? [];` (no cast).                                      | trivial |
| `apps/web/src/app/(dashboard)/leave/page.tsx:867`          | `setLeaveTypes(typesRes.types ?? (typesRes as any).leave_types ?? [])` — fallback to `leave_types` shape.                                                                                                                                                 | The service is typed `Promise<{ types: LeaveType[] }>` (services/api/leave.ts:83). If backend may also return `leave_types`, widen the service return type to `{ types?: LeaveType[]; leave_types?: LeaveType[] }` and the cast disappears. Better: pin one canonical shape at the API boundary and remove the fallback. | trivial |
| `apps/web/src/app/(dashboard)/leave/page.tsx:1003`         | `{leaveTypes.map((lt: any) => (` — `leaveTypes` is `LeaveType[]` but the JSX reads multiple aliases (`lt.name \|\| lt.leave_type_name`, `lt.default_days ?? lt.entitlement_days`).                                                                        | Same root cause as line 867: the `LeaveType` interface is missing the legacy alias fields. Add `leave_type_name?: string; entitlement_days?: number;` to `LeaveType` (services/api/leave.ts:7). Drop the `: any`; map with `lt: LeaveType`.                                                                              | trivial |
| `apps/web/src/app/(dashboard)/projects/page.tsx:248`       | `(data.projects ?? []).map((p: any) => ({...}))` — code reads `p.budget_amount`, `p.is_archived`.                                                                                                                                                         | The `Project` interface in `services/api/projects.ts:7` is missing `budget_amount?: number; is_archived?: boolean;`. Add both, drop the `: any`.                                                                                                                                                                         | trivial |
| `apps/web/src/app/(dashboard)/recruitment/page.tsx:932`    | `{job.title \|\| (job as any).position_title \|\| "-"}` — `job` is `JobListing`.                                                                                                                                                                          | Add `position_title?: string;` to `JobListing` (recruitment service, line ~285). Drop the cast.                                                                                                                                                                                                                          | trivial |
| `apps/web/src/components/company/CompanySetupModal.tsx:60` | `clientsApi.create({...} as any)` — same `estimated_headcount` mismatch as onboarding/page.tsx:44.                                                                                                                                                        | Same fix as row 1: align `ClientCreateRequest` and remove the cast.                                                                                                                                                                                                                                                      | trivial |
| `apps/web/src/components/company/CompanySetupModal.tsx:69` | `} catch (err: any) { ...err?.detail \|\| err?.message }`                                                                                                                                                                                                 | TS 4.4+: `} catch (err) {`; type the API-error shape once: `interface ApiError { detail?: string; message?: string }`; narrow with `const apiErr = err as ApiError;` OR (cleaner) extract a `humanizeApiError(err: unknown): string` helper in `services/api/errors.ts`.                                                 | trivial |

**Pattern observation:** 7 of 10 `no-explicit-any` errors are NOT
form-state setters — they are **type definitions lagging the backend
contract**. The `as any` is the developer's escape hatch when the
TypeScript interface in `services/api/*.ts` or `types/api.ts` doesn't
have a field the response actually carries. The systemic fix is to
align the type files with the backend response shapes (one PR per
service file is small). The remaining 2 are caught-error bindings
(`err: any`) — the modern idiom is to drop the annotation and narrow.

### `react/no-unescaped-entities` (2)

| File:line                                                   | Offending text                              | Fix                                                                                                                |
| ----------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `apps/web/src/components/company/CompanySetupModal.tsx:211` | `>I'll do this later<`                      | Replace `'` with `&apos;` (preferred — semantic) or `&#39;`. The button label becomes `>I&apos;ll do this later<`. |
| `apps/web/src/components/company/CompanySetupModal.tsx:237` | `>You're all set!<` (success state heading) | `>You&apos;re all set!<`.                                                                                          |

Both are pure JSX text-content escapes. No semantic change.

### `@next/next/no-assign-module-variable` (1)

`apps/web/src/components/shadow-agent/ArborResult.tsx:50` —

```ts
const module = response.intent?.module ?? "";
```

**Why Next.js blocks it:** the local binding `module` shadows
Node/Webpack's CommonJS `module` global at function scope. Inside a
React Client Component bundled by Webpack/Turbopack, `module.exports`
and `module.hot` are still injected at the bundler level; reassigning
`module` inside the component breaks bundler-injected references and
upstream tooling that walks the chunk runtime. Next.js's lint rule is
defensive — even though this specific code is a `const` declaration
(not a literal reassignment), the rule blocks the _name_ because the
shadowing pattern is the failure-mode signal.

**Fix:** rename the local. The variable is a UI-routing string used at
lines 51, 79, 113, etc. (it represents the module the action targeted —
`"leave"`, `"payroll"`, etc.):

```ts
const targetModule = response.intent?.module ?? "";
```

Update all 4–6 references in the component body. Trivial.

---

## Warnings (49)

### `@typescript-eslint/no-unused-vars` (48) grouped

#### Type A — Dead imports (29)

Pure imports with zero downstream use; safe to delete from the import statement.

| File:line                                                                          | Symbol                                                                                                        |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/app/(dashboard)/admin/elements/__tests__/NewSessionModal.test.tsx:4` | `within` (only `render, screen` used)                                                                         |
| `apps/web/src/app/(dashboard)/admin/elements/FeedbackReviewTab.tsx:4`              | `AppButton`                                                                                                   |
| `apps/web/src/app/(dashboard)/admin/elements/OverviewTab.tsx:11`                   | `Loader2`                                                                                                     |
| `apps/web/src/app/(dashboard)/advisory/history/page.tsx:20`                        | `AppCard`                                                                                                     |
| `apps/web/src/app/(dashboard)/alerts/page.tsx:18`                                  | `Loader2`                                                                                                     |
| `apps/web/src/app/(dashboard)/approvals/page.tsx:44`                               | `StatusBadge` (component declared inside file but never rendered)                                             |
| `apps/web/src/app/(dashboard)/dashboard/page.tsx:8`                                | `AlertBanner`                                                                                                 |
| `apps/web/src/app/(dashboard)/documents/[id]/preview/page.tsx:6`                   | `Download` (icon imported, never rendered)                                                                    |
| `apps/web/src/app/(dashboard)/inventory/page.tsx:17`                               | `ArrowRight`                                                                                                  |
| `apps/web/src/app/(dashboard)/my-payslips/page.tsx:24`                             | `end` (function param of `formatPeriod`) — see Type C re-classification below                                 |
| `apps/web/src/app/(dashboard)/payroll/[id]/page.tsx:46`                            | `end` (same `formatPeriod` shape) — see Type C                                                                |
| `apps/web/src/app/(dashboard)/payroll/page.tsx:17`                                 | `ArrowRight`                                                                                                  |
| `apps/web/src/app/(dashboard)/payroll/page.tsx:39`                                 | `end` (formatPeriod param) — see Type C                                                                       |
| `apps/web/src/app/(dashboard)/settings/import/page.tsx:18`                         | `LoadingState` (used at line 401 in DIFFERENT file `settings/integrations/page.tsx` — verify)                 |
| `apps/web/src/app/(dashboard)/settings/import/page.tsx:26`                         | `FieldMapping` (type-only import never referenced)                                                            |
| `apps/web/src/app/(dashboard)/settings/integrations/page.tsx:9`                    | `Phone`                                                                                                       |
| `apps/web/src/app/(dashboard)/shifts/page.tsx:34`                                  | `formatCurrency` (declared, never called in this file) — see Type D                                           |
| `apps/web/src/app/(dashboard)/training/skillsfuture/page.tsx:3`                    | `useCallback`                                                                                                 |
| `apps/web/src/app/(dashboard)/training/skillsfuture/page.tsx:21`                   | `toast`                                                                                                       |
| `apps/web/src/components/management/ManagementShowcase.tsx:13`                     | `BarChart3`                                                                                                   |
| `apps/web/src/components/onboarding/FirstQuestionStep.tsx:6`                       | `AppCard`                                                                                                     |
| `apps/web/src/components/shadow-agent/ArborHistory.tsx:8`                          | `RotateCcw`                                                                                                   |
| `apps/web/src/lib/prism-advisory-adapter.ts:85:19`                                 | `_data` parameter (`onStart: (_data: AdvisoryStreamStartEvent) => {…}`) — see Type C                          |
| `apps/web/src/components/advisory/SystemMessage.tsx:134`                           | `messageId` (prop declared in interface and destructured but never referenced in component body) — see Type E |
| `apps/web/src/components/shadow-agent/ShadowMargin.tsx:62`                         | `onOpenHistory` (prop destructured but never invoked — handler declared, never wired) — see Type E            |
| `apps/web/src/components/shell/NavigationSidebar.tsx:496`                          | `collapsed` (parameter on `ExpandableNavLink` — neighbours use it; this one drops it) — see Type E            |
| `apps/web/tests/e2e/00-route-intercept-verify.spec.ts:4`                           | `expect` (import named but never asserted in this diagnostic spec)                                            |
| `apps/web/tests/e2e/04-advisory-chat.spec.ts:10`                                   | `expect` (same — diagnostic spec)                                                                             |
| `apps/web/tests/e2e/helpers/auth.helper.ts:96`                                     | `request` (`const request = route.request();` then never used) — see Type D                                   |

> **Note on `LoadingState` at `settings/import/page.tsx:18`** — the
> grep shows `LoadingState` referenced in the SIBLING file
> `settings/integrations/page.tsx:401`, NOT in `import/page.tsx`. The
> import in `import/page.tsx` is dead; integrations imports its own
> copy (used). Safe delete.

> **Note on `useCallback` at `skillsfuture/page.tsx:3`** — file
> declares `formatCurrency = (amount) => …` as plain arrow functions
> at lines 180, 268; no `useCallback` call site exists. Safe delete.

#### Type B — Caught error bindings (2)

Fix: drop the binding entirely. Requires TS 4.4+; the repo runs much later.

| File:line                                              | Current                                          | Fix                                        |
| ------------------------------------------------------ | ------------------------------------------------ | ------------------------------------------ |
| `apps/web/src/app/(dashboard)/my-profile/page.tsx:218` | `} catch (err) { setError("Unable to load…"); }` | `} catch { setError("Unable to load…"); }` |
| `apps/web/tests/e2e/helpers/auth.helper.ts:116`        | `} catch (err) { await route.continue(...); }`   | `} catch { await route.continue(...); }`   |

#### Type C — Required params unused (4)

Function signature dictates the parameter exists; rename with leading
underscore. ESLint convention treats `_name` as "intentionally
unused" and stops warning.

| File:line                                               | Signature                                                                                                       | Fix                                                                                                                                                                                                                   |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/app/(dashboard)/my-payslips/page.tsx:24`  | `function formatPeriod(start: string, end: string)`                                                             | `function formatPeriod(start: string, _end: string)` — function only formats the start date. (Better long-term: drop the param if no caller needs the end signature; check call sites first.)                         |
| `apps/web/src/app/(dashboard)/payroll/[id]/page.tsx:46` | same `formatPeriod(start, end)` shape                                                                           | `_end`                                                                                                                                                                                                                |
| `apps/web/src/app/(dashboard)/payroll/page.tsx:39`      | same                                                                                                            | `_end`                                                                                                                                                                                                                |
| `apps/web/src/lib/prism-advisory-adapter.ts:85`         | `onStart: (_data: AdvisoryStreamStartEvent) => {…}` (already has `_` prefix but ESLint config not honouring it) | Verify `eslint.config.*` `argsIgnorePattern: "^_"` is set; if so, the warning is a misconfig. If not, add it — that single eslint-config tweak silences this kind of warning **everywhere** without per-site changes. |

> **Cross-cutting**: 3 of the 4 `formatPeriod(start, end)` cases are
> the same signature replicated across pages. The right fix is **one
> shared `formatPeriod` helper** in a `lib/format.ts` module; the
> consolidation also kills 3 of the redundant local declarations.

#### Type D — Genuine dead vars (4)

The variable was assigned for a side-effect or as a local cache; the
code that read it has been deleted. Action: **delete**.

| File:line                                                          | Code                                                                                                                                                                                                                          | Action                                                                                                                                                                                                             |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/web/src/app/(dashboard)/analytics/page.tsx:369,374,376,377`  | `reportLoading`, `metricsError`, `feedbackError`, `reportError` — assigned via `setReportLoading(...)` etc. but never read in JSX. (Sibling errors `workforceError`, `complianceError`, `metricsLoading`, etc. ARE rendered.) | **Investigate first.** This looks like Type E — a partial UI render where 3-4 cards never had their error/loading state wired. Either render them (most likely intent) or drop the unused state hooks. See Type E. |
| `apps/web/src/components/dashboard/ExpiringDocumentsWidget.tsx:64` | `const ninetyDaysMs = 90 * 86400000;` declared, then `daysLeft <= 90` is computed via `(expiryTime - now) / 86400000`. Constant is dead.                                                                                      | **Delete the line.** The threshold is hard-coded at line 75 anyway. (Optional polish: replace `90` magic number with `MAX_DAYS_AHEAD = 90` at module scope.)                                                       |
| `apps/web/src/app/(dashboard)/shifts/page.tsx:34`                  | `function formatCurrency(amount: number) {…}` declared but never called within the file.                                                                                                                                      | **Delete the function.** Or move it into the shared `lib/format.ts` if other shifts code paths add currency formatting in future.                                                                                  |
| `apps/web/tests/e2e/helpers/auth.helper.ts:96`                     | `const request = route.request();` then `request` is never read; nearby code uses `route.fetch(...)` directly.                                                                                                                | **Delete the line.** Pure dead assignment.                                                                                                                                                                         |

#### Type E — Investigation needed (9)

Variables that LOOK like they should be used but aren't — code path
deleted, partial wiring, or refactor leftover.

| File:line                                                          | Symbol                                                                                                        | Investigation + recommended action                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/app/(dashboard)/analytics/page.tsx:369,374,376,377`  | `reportLoading`, `metricsError`, `feedbackError`, `reportError`                                               | Each card pair has loading+error state. The sibling cards render their state in JSX; these four don't. Action: either render them in the matching JSX block, or drop the state hooks AND the corresponding `setReportLoading(false)` calls (lines 366–368 area). Likely the metrics/feedback/report cards lost their error UI in a refactor.                                                                                                                                                    |
| `apps/web/src/app/(dashboard)/employees/[id]/page.tsx:1317`        | `employeeId` (param of `EmploymentTab`)                                                                       | Component receives `employee` AND `employeeId`. Body only uses `employee`. Other tabs (Salary at 1517, Leave at 2111, Documents at 2248) DO use `employeeId`. The Employment tab probably should call an endpoint with `employeeId` (e.g., update employment record by id) but doesn't yet. Action: confirm with a quick read of the tab body — if there's a `handleSave` that calls `employeesApi.update(employeeId, …)` then the prop IS used; if not, either drop the prop or wire the save. |
| `apps/web/src/app/(dashboard)/my-inventory/page.tsx:159`           | `user` from `useAuth()`                                                                                       | Page renders inventory data but `user` is never read in JSX. Likely the page should filter "my" inventory by `user.id`/`user.employee_id` but doesn't — `fetchData` may call a `/me` endpoint server-side. Action: confirm `fetchData` doesn't need `user.id` (it shouldn't, since the route is `my-*`). If it doesn't, drop the destructure.                                                                                                                                                   |
| `apps/web/src/app/(dashboard)/my-profile/page.tsx:199`             | `user`                                                                                                        | Same pattern. The profile page fetches `/employees/me` (line 216) — `user` from context is genuinely redundant. Drop.                                                                                                                                                                                                                                                                                                                                                                           |
| `apps/web/src/app/(dashboard)/my-profile/page.tsx:207`             | `payrollRequired = ["date_of_birth", ...]`                                                                    | Declared as a local list but never iterated to compute "missing payroll fields" warning. Was probably intended to drive a `<MissingFieldsBanner>`. Action: either render the banner OR delete.                                                                                                                                                                                                                                                                                                  |
| `apps/web/src/app/(dashboard)/my-timesheets/page.tsx:239`          | `user`                                                                                                        | Same `my-*` pattern — server endpoint scoped by JWT. Drop.                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `apps/web/src/app/(dashboard)/recruitment/page.tsx:51`             | `STAGE_STYLES` constant                                                                                       | A `Record<string, string>` of CSS class strings for candidate stages. Probably consumed by a `<CandidateStageBadge>` that hasn't been wired into the candidates table. Action: grep `recruitment/page.tsx` for stage rendering — if a badge IS rendered with hard-coded class strings, swap it to `STAGE_STYLES[stage]`. Otherwise delete.                                                                                                                                                      |
| `apps/web/src/app/(dashboard)/reports/page.tsx:352`                | `isAdmin`                                                                                                     | Computed once, never branched on. The page probably hides admin-only reports for non-admins but the gate was lost. Action: confirm with product whether non-admins should see all reports; if so, delete; if not, wire the `if (!isAdmin && report.adminOnly) skip` filter.                                                                                                                                                                                                                     |
| `apps/web/src/app/(dashboard)/training/skillsfuture/page.tsx:48`   | `FUNDING_OPTIONS` constant                                                                                    | Adjacent to `TOPIC_OPTIONS` and `DURATION_OPTIONS` which ARE used in the search filter dropdowns. The funding select probably lost its `<select>` element in a UI refactor. Action: render a "Funding eligibility" dropdown next to topic/duration, or delete.                                                                                                                                                                                                                                  |
| `apps/web/src/components/advisory/EscalationDialog.tsx:25`         | `URGENCY_TIMEFRAMES: Record<EscalationUrgency, string>`                                                       | Maps urgency tier to "2 business hours" / "24 hours" / "3 business days" copy. Almost certainly meant to render in the dialog under the urgency selector ("Response within: 2 business hours"). Action: render the timeframe under the selected urgency. The constant exists for a reason.                                                                                                                                                                                                      |
| `apps/web/src/components/advisory/SystemMessage.tsx:134`           | `messageId` (prop)                                                                                            | Prop is declared in the interface (line 32) and destructured but never used. Likely intended to thread through to the feedback callback (`onFeedback(messageId, …)`) so the backend knows WHICH message got thumbed. Action: confirm `onFeedback` signature; if it takes a message id and the call site passes `undefined`, this is a real bug — wire it.                                                                                                                                       |
| `apps/web/src/components/dashboard/ExpiringDocumentsWidget.tsx:64` | already covered in Type D — delete                                                                            |
| `apps/web/src/components/shadow-agent/ArborHistory.tsx:8`          | already covered in Type A — `RotateCcw` icon imported but the "Undo" button uses inline SVG or different icon |
| `apps/web/src/components/shadow-agent/CommandSurface.tsx:558`      | `sid` parameter on `onRetry={(sid) => {…}}`                                                                   | The retry handler ignores the session id and re-submits the original `query`. If a retry should target a SPECIFIC session, the body needs `handleSubmit(query, sid)` or `setSessionId(sid)` first. Action: confirm whether retry should preserve session context; if yes, wire `sid`. If no, rename to `_sid`.                                                                                                                                                                                  |
| `apps/web/src/components/shadow-agent/ShadowMargin.tsx:62`         | `onOpenHistory` prop                                                                                          | Destructured but never bound to a button. The component DOES render insights and a chevron, but no "Open History" affordance. Action: wire it to the existing `useShadowAgent().openCommand()` pattern OR drop the prop from the public interface (line 29).                                                                                                                                                                                                                                    |
| `apps/web/src/components/shell/NavigationSidebar.tsx:496`          | `collapsed` param on `ExpandableNavLink`                                                                      | Sibling `NavLink` (line 478) and others all use `collapsed`. `ExpandableNavLink` should hide the chevron and child group when collapsed. Action: wire `collapsed && children-hidden` and `collapsed && chevron-hidden` rendering.                                                                                                                                                                                                                                                               |
| `apps/web/src/hooks/api/useProfile.ts:68`                          | `data` arg in `onSuccess: (data) => { queryClient.invalidateQueries(...) }`                                   | TanStack Query's `onSuccess` signature provides `data` even when not used. **This is Type C, not E.** Rename to `_data` or drop the param: `onSuccess: () => queryClient.invalidateQueries(...)`.                                                                                                                                                                                                                                                                                               |
| `apps/web/tests/e2e/05-calculators.spec.ts:65`                     | `cpfButton`                                                                                                   | Built but never asserted/clicked — replaced by the `cpfCard.getByRole(...)` path 5 lines later. Action: delete the unused locator. (Or if both paths should fall through, click `cpfButton` when `!hasCpfCard`.)                                                                                                                                                                                                                                                                                |

> Re-classifying `useProfile.ts:68` from Type E → Type C above.

### `jsx-a11y/role-has-required-aria-props` (1)

`apps/web/src/components/shell/TopBar.tsx:226` —

```tsx
<input
  /* search input attrs… */
  role="combobox"
  aria-expanded={showSearchResults}
  aria-haspopup="listbox"
  aria-autocomplete="list"
/>
```

The rule message says `combobox` requires **`aria-controls`** AND
**`aria-expanded`**. The element already has `aria-expanded`; it is
**missing `aria-controls`**.

**Fix:** give the search results dropdown a stable id and reference it.

```tsx
<input
  /* … */
  role="combobox"
  aria-expanded={showSearchResults}
  aria-controls="topbar-search-results"
  aria-haspopup="listbox"
  aria-autocomplete="list"
/>;
{
  showSearchResults && <SearchResults id="topbar-search-results" /* … */ />;
}
```

`SearchResults` (`apps/web/src/components/shell/SearchResults.tsx`)
must accept and forward `id` to the listbox container. If it already
takes children rendered as `role="listbox"`, the id goes on that
container.

This is the canonical WAI-ARIA 1.2 combobox pattern — the input
references the listbox via `aria-controls`; the listbox references its
selected option via `aria-activedescendant` (next-level polish, not
required to satisfy the lint rule).

---

## Cross-cutting recommendations

### 1. Backend-shape laxity is leaking through services/api

7 of 10 `no-explicit-any` errors are **type files lagging the
backend**. The pattern is:

```
backend returns { foo, bar, baz_legacy }
                            ↑ alias kept for backward-compat
TS interface declares { foo, bar }    ← stale
caller uses (resp as any).baz_legacy ← cast as escape hatch
```

**Fix:** for each of these service files, run a one-shot reconcile
against the FastAPI router response:

- `services/api/leave.ts::LeaveType` — add `leave_type_name?`,
  `entitlement_days?` (used at leave/page.tsx:867, 1003)
- `services/api/projects.ts::Project` — add `budget_amount?`,
  `is_archived?` (used at projects/page.tsx:248)
- `services/api/appraisals.ts::AppraisalTemplate` — add `created_at?`
  (used at appraisals/page.tsx:672)
- `services/api/employees.ts::JobListing` — add `position_title?`
  (used at recruitment/page.tsx:932)
- `types/api.ts::ClientCreateRequest` — add `estimated_headcount?`
  (used at onboarding/page.tsx:44, CompanySetupModal.tsx:60)
- `services/api/employees.ts::listInvitations` — pin one canonical
  return shape (`Invitation[]` OR `{ invitations: Invitation[] }`,
  not both) (used at employees/page.tsx:926)

**No new shared `types/` module needed** — the existing per-service
types are the right home; they just need the field additions. ~6
small interface edits eliminates 7 of 10 `any` errors.

### 2. `formatPeriod(start, end)` triplicated across 3 pages

`apps/web/src/app/(dashboard)/my-payslips/page.tsx:24`,
`apps/web/src/app/(dashboard)/payroll/[id]/page.tsx:46`, and
`apps/web/src/app/(dashboard)/payroll/page.tsx:39` each declare a
function with the same `(start: string, end: string): string`
signature where `end` is unused. Either:

- (preferred) consolidate into `apps/web/src/lib/format.ts::formatPeriod`
  exported once, and either drop `end` from the signature or actually
  use it (e.g., `if (start && end) return "Jan – Mar 2026"`); OR
- prefix `_end` in each local declaration (mechanical; doesn't reduce
  duplication).

### 3. Verify `argsIgnorePattern: "^_"` in eslint config

`apps/web/src/lib/prism-advisory-adapter.ts:85` flags `_data` despite
the leading underscore — that suggests the project's eslint config
either doesn't set `argsIgnorePattern: "^_"` on
`@typescript-eslint/no-unused-vars`, or has overridden it. A one-line
change to `apps/web/eslint.config.*` resolves Type C cases (4 today,
plus every future occurrence) without per-site work.

### 4. Catch-binding modernisation

3 `catch (err: any)` and 2 `catch (err)` instances are scattered. TS
4.4+ infers `unknown` automatically with no annotation, AND TS 4.4+
allows `catch {}` with no binding when `err` is unused. Single global
search-and-replace pass reduces the surface area:

- `} catch (err: any) {` (with no body use) → `} catch {`
- `} catch (err: any) { … err?.message …}` → `} catch (err) { …
err instanceof Error ? err.message : String(err) …}`

### 5. The `ExpiringDocumentsWidget` ninety-day pattern

The unused `ninetyDaysMs` constant is symptomatic — the threshold `90`
appears as both a constant declaration AND a magic number in the
comparison. Pick one: declare `const MAX_DAYS_AHEAD = 90` at module
scope and use `daysLeft <= MAX_DAYS_AHEAD`.

---

## Suggested shard breakdown

### Shard X — Mechanical sweep (no semantic risk)

**Estimated diff:** ~150 lines, mostly deletions.

**Includes:**

- All 29 Type A dead imports (single-line deletions or array-element
  removals from `import {}` statements)
- All 2 Type B caught-error bindings (`} catch (err) {` → `} catch {`)
- All 4 Type C required-params (`end` → `_end`, `data` → `_data`)
- The `useProfile.ts:68` `data` → `_data` (re-classified to C)
- (Optional) the eslint-config tweak setting `argsIgnorePattern: "^_"`
  which retroactively silences any future `_*` warnings

**No type-system risk.** Pure deletions and renames. Each file is
self-contained; no cross-file refactor required. Single
`/redteam`-able PR.

### Shard Y — Type system reconciliation + dead-code cleanup

**Estimated diff:** ~80 lines added (interface fields), ~30 lines deleted.

**Includes:**

- All 10 `no-explicit-any` errors. Per-service-file edits to
  `services/api/{leave,projects,appraisals,employees}.ts` and
  `types/api.ts::ClientCreateRequest` to add the missing optional
  fields. Drop the casts at call sites.
- All 4 Type D genuine-dead variables (`ninetyDaysMs`, `formatCurrency`
  in shifts, `request` in auth.helper, the analytics state quartet —
  if Type E investigation concludes "drop, don't render")

**Real code review per file.** Each interface change touches the type
file plus 1–3 call sites; verify no other consumer breaks (run
`tsc --noEmit` after each).

### Shard Z — Investigation/wiring + a11y + Next.js rule

**Estimated diff:** ~60–120 lines, depending on Type E rulings.

**Includes:**

- All 9 Type E investigation cases. Each requires a product/intent
  decision: render the missing UI vs delete the dangling state. The
  `EscalationDialog` `URGENCY_TIMEFRAMES`, `SystemMessage` `messageId`,
  `ShadowMargin` `onOpenHistory`, `NavigationSidebar` `collapsed` on
  `ExpandableNavLink`, `CommandSurface` `sid`, and the `analytics`
  loading/error quartet are the highest-priority wires (real UX gaps
  shipping with the production build).
- The 2 `no-unescaped-entities` errors in `CompanySetupModal`
  (`I'll` → `I&apos;ll`, `You're` → `You&apos;re`)
- The 1 `no-assign-module-variable` rename in
  `ArborResult.tsx:50` (`module` → `targetModule`, plus 4–6 reference
  updates)
- The 1 `role-has-required-aria-props` fix in `TopBar.tsx:226` plus
  the small `SearchResults` `id` plumbing to make `aria-controls`
  reference a real element id

**Best as 2–3 sub-PRs:** one for the Type E wiring decisions (needs
product context), one for the trivial 4 fixes (a11y + 2 escapes +
module rename) which are independent and trivial each.

---

## File-path index (absolute paths for downstream reference)

Errors:

- `/Users/esperie/repos/terrene/contrib/arbor/apps/web/src/app/(auth)/onboarding/page.tsx`
- `/Users/esperie/repos/terrene/contrib/arbor/apps/web/src/app/(dashboard)/appraisals/page.tsx`
- `/Users/esperie/repos/terrene/contrib/arbor/apps/web/src/app/(dashboard)/employees/page.tsx`
- `/Users/esperie/repos/terrene/contrib/arbor/apps/web/src/app/(dashboard)/leave/page.tsx`
- `/Users/esperie/repos/terrene/contrib/arbor/apps/web/src/app/(dashboard)/projects/page.tsx`
- `/Users/esperie/repos/terrene/contrib/arbor/apps/web/src/app/(dashboard)/recruitment/page.tsx`
- `/Users/esperie/repos/terrene/contrib/arbor/apps/web/src/components/company/CompanySetupModal.tsx`
- `/Users/esperie/repos/terrene/contrib/arbor/apps/web/src/components/shadow-agent/ArborResult.tsx`
- `/Users/esperie/repos/terrene/contrib/arbor/apps/web/src/components/shell/TopBar.tsx`

Type files needing edits (Shard Y):

- `/Users/esperie/repos/terrene/contrib/arbor/apps/web/src/types/api.ts`
- `/Users/esperie/repos/terrene/contrib/arbor/apps/web/src/services/api/leave.ts`
- `/Users/esperie/repos/terrene/contrib/arbor/apps/web/src/services/api/projects.ts`
- `/Users/esperie/repos/terrene/contrib/arbor/apps/web/src/services/api/appraisals.ts`
- `/Users/esperie/repos/terrene/contrib/arbor/apps/web/src/services/api/employees.ts`

ESLint config (Shard X cross-cutting):

- `/Users/esperie/repos/terrene/contrib/arbor/apps/web/eslint.config.*`
