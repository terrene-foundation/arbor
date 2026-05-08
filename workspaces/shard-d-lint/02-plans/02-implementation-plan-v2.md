# Shard D Implementation Plan — v2 (post Round 1 redteam)

Supersedes `01-implementation-plan.md`. Addresses all 13 HIGH and 9 MED findings from `01-analysis/04-redteam-round-1.md`. The 3 LOW findings are folded into Shard 5's codify step.

Goal unchanged: `cd apps/web && npx eslint .` exits 0/0, no `// eslint-disable-*` added, tests + build green, no production behavior regression.

## File→owner matrix (replaces v1's R4 mitigation)

The v1 plan's R4 ("designate Shard 3 as `types/api.ts` owner") was wrong — file-level collisions are broader. The matrix below assigns each file to exactly one shard (or sequences edits across shards) so parallel worktrees never share a file.

| File                                                                                        | Shards that want to edit                                                          | Owner / sequence                                                                                                                                       |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/app/(auth)/signup/page.tsx`                                                            | 1 (Type B catch), 2 (Cat A invite)                                                | **Shard 2** absorbs the catch; Shard 1 skips this file                                                                                                 |
| `src/app/(dashboard)/analytics/page.tsx`                                                    | 1 (immutability ln 122), 2 (Cat A 6-fetch ln 400), 3 (Type D quartet lns 369-377) | **Shard 1** does ONLY ln 122 immutability fix; **Shard 2** absorbs everything else (the 6-useQuery rewrite eliminates the Type D state hooks entirely) |
| `src/app/(dashboard)/dashboard/page.tsx`                                                    | 1 (Type A AlertBanner import), 2 (Cat A)                                          | **Shard 2** absorbs Type A                                                                                                                             |
| `src/app/(dashboard)/employees/[id]/page.tsx`                                               | 1 (×3 Cat D form-reset, ×1 purity, ×1 Type E `employeeId`)                        | **Shard 1** owns; do all 5 in one pass after F1 investigation                                                                                          |
| `src/app/(dashboard)/documents/[id]/preview/page.tsx`                                       | 1 (Type A Download import), 2 (Cat A)                                             | **Shard 2**                                                                                                                                            |
| `src/app/(dashboard)/documents/page.tsx`                                                    | 1 (any Type A), 2 (Cat A + onRetry adapter F2)                                    | **Shard 2**                                                                                                                                            |
| `src/components/design-system/EmployeePicker.tsx`                                           | 2 (Cat A)                                                                         | **Shard 2**                                                                                                                                            |
| `src/contexts/AdvisoryPanelContext.tsx`                                                     | 1 (Cat B + Cat C ln 85)                                                           | **Shard 1** owns; F7 fix is action-driven (consumer-grep required)                                                                                     |
| `src/components/advisory-panel/AdvisoryPanel.tsx`                                           | 1 (Cat C ln 88)                                                                   | **Shard 1** owns; F8 fix is action-driven                                                                                                              |
| `src/components/shadow-agent/useObservation.ts`                                             | 1 (Cat B + Cat F + F5 cascade fix)                                                | **Shard 1** owns                                                                                                                                       |
| `src/components/shadow-agent/PaceCard.tsx`                                                  | 1 (Cat F + remove disable)                                                        | **Shard 1** owns; F6 verify isDangerous stability                                                                                                      |
| `src/components/shell/AppShell.tsx`                                                         | 1 (Cat B)                                                                         | **Shard 1** owns                                                                                                                                       |
| `src/components/shell/TopBar.tsx` + `SearchResults.tsx`                                     | 1 (a11y aria-controls plumb)                                                      | **Shard 1** owns                                                                                                                                       |
| `src/components/shadow-agent/ArborResult.tsx`                                               | 1 (rename `module`)                                                               | **Shard 1** owns                                                                                                                                       |
| `src/components/company/CompanySetupModal.tsx`                                              | 1 (×2 unescaped + Type B catch) + 3 (×2 no-explicit-any)                          | **Shard 3** absorbs everything in this file                                                                                                            |
| `src/services/api/*.ts` + `src/types/api.ts`                                                | 3 (interface edits)                                                               | **Shard 3** owns exclusively                                                                                                                           |
| `src/app/(dashboard)/{onboarding,appraisals,leave,projects,recruitment,employees}/page.tsx` | 3 (consume new field types)                                                       | **Shard 3** owns                                                                                                                                       |
| `src/components/shadow-agent/{ArborResult,...}.tsx` Type E wiring                           | 4 (triage)                                                                        | **Shard 4** — triage only, may produce tracking issues + deletions; no silent eslint-disable                                                           |
| `src/app/(dashboard)/advisory/history/page.tsx`, `alerts/page.tsx`                          | 1 (×3 exhaustive-deps `useMemo` wraps)                                            | **Shard 1** — F20 confirmed no Shard 2 collision; data refs come from existing TanStack hooks                                                          |
| `apps/web/eslint.config.mjs`                                                                | 1 (preflight + maybe add `argsIgnorePattern`)                                     | **Shard 1** — F19 preflight first                                                                                                                      |

**Result**: Shard 1 owns ~12 files; Shard 2 owns ~6 files; Shard 3 owns ~10 files; Shard 4 owns ~6 files. Zero file overlap → genuinely parallelizable after Shard 1 merges.

## Sequencing

```
Shard 1 (sequential, 1 session) ─→ Shard 2 │
                                  ─→ Shard 3 │ all parallel worktrees
                                  ─→ Shard 4 │ no file overlap
                                  ─→ Shard 5 (final, post-merge)
```

## Shard 1 — Mechanical sweep + 4 action-driven fixes

**Scope adjusted from v1.** Some "mechanical" fixes turned out to need consumer enumeration or behavior verification (F1, F5, F6, F7, F8). Shard 1 is now:

### 1.1 Preflight (F19)

- Read `apps/web/eslint.config.mjs`. Verify whether `argsIgnorePattern: "^_"` is currently set on `@typescript-eslint/no-unused-vars`.
- If set: the warnings on `_data` etc. are from a different rule. Identify the actual rule and config knob.
- If not set: add it as part of Shard 1.
- Document the result inline in Shard 1's first commit message.

### 1.2 Investigate before fixing (F1, F5, F6)

Per redteam HIGH findings, the following are NOT mechanical — verify behavior first:

- **F1 — `employees/[id]/page.tsx` form-reset**:
  1. Read parent component to identify how `employee` is delivered (useState/useQuery/refetch).
  2. If `employee` IS refetched after save (likely via TanStack Query), the v1 fix `key={employee.id}` would DROP the post-save reset.
  3. Use `key={employee.updated_at}` (or any field that changes per save). Document choice in `react-hooks-correctness.md` antipattern 4 addendum (F24).
- **F5 — `useObservation.ts:230` insights**: After lazy-init refactor, the `insights = useMemo(...)` MUST gate on `isEnabled`:
  ```tsx
  const insights = useMemo(
    () => (isEnabled && visits.length >= 5 ? generateInsights(visits) : []),
    [visits, isEnabled],
  );
  ```
  Then DELETE the `setInsights([])` call inside `setEnabled` (now redundant — memo recomputes when `isEnabled` flips). Verify `clearAll` still produces empty insights (it does — clearing visits → memo returns `[]`).
- **F6 — `PaceCard.tsx:76` cooldown**: Verify whether `isDangerous` is stable per mount (likely yes — each command response gets its own `PaceCard` instance, `response.intent.trust_level` is set once). If stable, the `[state]`-deps refactor is correct. If `PaceCard` is reused across responses without remount, add an explicit `useEffect(() => { /* reset state machine */ }, [isDangerous])` that re-arms cooldown on flip.

### 1.3 Action-driven fixes (F7, F8) — consumer enumeration required

Per `rules/abstraction-consumers.md`, these MUST grep ALL consumers before editing:

- **F7 — `AdvisoryPanelContext:85`**: Grep for `setIsOpen` callers across `apps/web/src/`. The fix is action-driven, NOT derive-during-render:
  ```tsx
  const setIsOpen = useCallback(
    (next: boolean) => setRawIsOpen(isAdvisoryPage ? false : next),
    [isAdvisoryPage],
  );
  ```
  Plus: ensure `rawIsOpen=false` whenever the user navigates TO advisory. The redteam shows the v1 derive-during-render fix breaks "panel auto-closes when navigating to advisory" — only the action-driven version preserves it.
- **F8 — `AdvisoryPanel:88` showHistory**: Grep for `setIsOpen(false)` and `close()` callers in the advisory-panel surface (likely 2-3: `handleScrimClick`, Esc handler, context close). Attach `setHistoryOpen(false)` to each. Add a spec antipattern entry (F15) so the pattern is grep-able from /redteam.

### 1.4 Mechanical sweep (the actually-mechanical fixes)

After 1.1-1.3 land, run the genuinely-mechanical batch:

- 3 × Cat B localStorage hydration → lazy `useState` initializer (AppShell, AdvisoryPanelContext top half, useObservation top half — F5 already covers the cascade)
- 3 × `react-hooks/exhaustive-deps` → `useMemo` wraps for `data?.X ?? []` (advisory/history, alerts ×2) — F20 confirmed no Shard 2 collision
- 1 × Cat F PaceCard cooldown (after F6 verification)
- Remove `// eslint-disable-next-line react-hooks/exhaustive-deps` at PaceCard:91
- 29 × Type A dead imports — pure deletion
- 2 × Type B catch bindings → `} catch {`
- 4 × Type C required params → leading underscore prefix
- 1 × `no-assign-module-variable` (`ArborResult.tsx:50`) → rename `module` → `targetModule`
- 1 × `role-has-required-aria-props` (TopBar:226) → add `aria-controls="topbar-search-results"` + plumb `id` into `SearchResults`
- 1 × eslint config tweak (only if F19 confirmed needed)

### Shard 1 acceptance

Per F14 (file-count realism) and F22 (test layer specificity):

```bash
cd apps/web
# Per-batch monitoring (F14):
# After every 5-file batch, run:
npx eslint . 2>&1 | tail -3   # error/warning count must monotonically decrease
# If lint count goes UP after an edit, abort + diagnose.

# Final acceptance:
npx eslint . 2>&1 | tail -3              # ≤ 7 errors + ≤ 13 warnings remaining (whatever Shards 2-4 own)
npx tsc --noEmit                          # clean
npm run test -- --run                     # Vitest green
# Playwright NOT required for Shard 1 (mechanical + action-driven within single files)
npm run build                             # production build green
```

## Shard 2 — TanStack Query migrations + onRetry adapter

**Scope:** 6 fetch-on-mount Cat A migrations + the F2 onRetry shape adapter + the F12 analytics quartet absorption + the per-page staleTime decisions per F11.

### 2.1 Pre-migration callsite enumeration (F2)

For EACH of the 6 migrated pages, grep:

```bash
grep -n "fetchTemplates\|setError\|setLoading" <file>
```

Enumerate every callsite of:

- The fetch closure (e.g., `<ErrorState onRetry={fetchTemplates}/>` at `documents/page.tsx:176`)
- The setError closure (e.g., the `"Invalid template ID"` branch at `documents/[id]/preview/page.tsx:24-34`)
- Other consumers of `loading` / `error` / `data` triplet

Each callsite becomes either:

- `query.refetch` with shape adapter (`onRetry={() => { void query.refetch(); }}` if `onRetry` is `() => void`) OR
- A separately-rendered branch (e.g., the `!templateId || isNaN` check renders an explicit "Invalid template ID" state since `query.error` is undefined when `enabled: false`)

### 2.2 Per-hook staleTime decisions (F11)

Decision per hook, replacing v1's generic table. **Rationale: external mutators (admin tabs, scheduled jobs, webhooks) defeat any non-zero staleTime.**

| Hook                                            | staleTime       | refetchOnWindowFocus | retry       | Rationale                                                                                                                                       |
| ----------------------------------------------- | --------------- | -------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `useTemplates` (documents list)                 | **0**           | `true`               | default     | External admin can delete; user-clickable items must reflect server truth on every navigation                                                   |
| `useTemplate(id)` (preview)                     | **0**           | `true`               | default     | Same — could be deleted between list view and preview                                                                                           |
| `useDashboardSummary`                           | **30_000**      | `true`               | default     | Aggregate; staleness window acceptable                                                                                                          |
| `useEmployeeForPicker` (EmployeePicker)         | **60_000**      | `true`               | default     | Profile data; rarely changes within session                                                                                                     |
| `useAnalyticsReports` (the 6 analytics queries) | **5 \* 60_000** | `false`              | default     | Computed server-side, expensive; refresh-on-focus would be costly                                                                               |
| `useInviteValidation(token)`                    | **0**           | **`false`**          | **`false`** | **F13**: token rotation is real; `Infinity` is unsafe; `retry: false` because a failed validation is a real failure (don't retry against a 4xx) |

### 2.3 Hook implementations

Hooks live at `apps/web/src/hooks/api/`. Reference patterns: `useAdvisoryHistory.ts`, `useAlerts.ts`. F23 disambiguation: do the file discovery first.

```bash
find apps/web/src -name "useDashboard*" -o -name "useAnalytics*" -o -name "useTemplates*" -o -name "useEmployees*" -o -name "useAuth*"
```

For each hook NOT found, create new at `apps/web/src/hooks/api/<name>.ts`. For each hook found, extend.

### 2.4 Analytics quartet absorption (F12)

The v1 plan put the 4 Type D analytics dead vars (`reportLoading`, `metricsError`, `feedbackError`, `reportError` at lines 369-377) in Shard 3. Per F4/F12, **Shard 2's full rewrite eliminates these state hooks entirely** as a side effect. Remove this work item from Shard 3.

### 2.5 Regression suite (F9, F18)

**Brief criterion 4 demands behavioral parity. The current E2E suite covers none of the migrated pages.** Add per-page Tier 2 (Vitest + MSW component tests) regression tests at `apps/web/tests/regression/test_migration_<page>.spec.ts` that:

1. Mock the API endpoint via MSW with canned fixture data
2. Render the page (or component) with React Testing Library
3. Assert the migrated path renders the expected user-visible text/structure
4. Test the loading state (mock returns Promise that doesn't resolve immediately)
5. Test the error state (mock returns 500)
6. Test the empty state (mock returns `[]`)

Pages requiring regression tests:

- `analytics/page.tsx` (6 queries)
- `dashboard/page.tsx`
- `documents/page.tsx`
- `documents/[id]/preview/page.tsx`
- `signup/page.tsx` (invite-validation flow)
- `EmployeePicker.tsx` (embedded in employee detail flow)

If any page is genuinely too complex for a Tier-2 component test (e.g., needs full router context), add a Playwright Tier-3 spec at `apps/web/tests/e2e/test_migration_<page>.spec.ts` that hits a stubbed local backend OR `arbor.aitelab.net` against fresh-reads-only paths.

### Shard 2 acceptance

```bash
cd apps/web
npx eslint . 2>&1 | tail -3          # 6+ errors removed (the Cat A hits)
npx tsc --noEmit                      # clean
npm run test -- --run                 # Vitest green INCLUDING new regression tests
# Plus: each migrated page's Tier-3 spec passes (Playwright)
npx playwright test tests/regression/  # green
npm run build                         # production build green
```

If a migration cannot be validated without backend changes, file an issue + flag in shard journal; do NOT ship the migration without the regression test (per F9).

## Shard 3 — Type reconciliation

**Scope adjusted per F4/F12.** Shard 3 no longer touches `analytics/page.tsx` (Shard 2 absorbs). The remaining work:

- **7 of 10 `no-explicit-any`** are caused by service-type interfaces lagging backend response shape. Add the missing fields (per `03-type-safety-and-cleanup.md` § no-explicit-any):
  - `LeaveType` ← `leave_type_name`
  - `Project` ← `budget_amount`
  - `ClientCreateRequest` ← `estimated_headcount`
  - (4 more — see analysis doc § no-explicit-any)
- **3 of 10 `no-explicit-any`** are caught-error bindings → narrow with `instanceof Error` check OR use `unknown` + type guard (NOT `as any`).
- **3 of 4 Type D dead vars** — delete (the 4th is the analytics quartet, now Shard 2's).
- **2 × `no-unescaped-entities`** in CompanySetupModal → `&apos;` substitution (was Shard 1 in v1; CompanySetupModal also has 2 no-explicit-any → consolidate ownership in Shard 3 per matrix).
- **CompanySetupModal Type B catch** (was Shard 1 in v1; consolidated to Shard 3 per matrix).

### Shard 3 acceptance

```bash
cd apps/web
npx eslint . 2>&1 | tail -3          # 10+ errors and 3+ warnings removed
npx tsc --noEmit                      # clean — type changes can cascade
npm run test -- --run                 # Vitest green
npm run build                         # production build green
```

No `as any`, no `as unknown as`, no `// @ts-ignore` introduced.

## Shard 4 — Wiring triage (F10)

**Scope adjusted.** v1's "(c) eslint-disable + tracking issue" carveout violates brief criterion 2. New protocol per F10:

For each of the 9 Type E warnings:

1. Read the file + git history (`git log --all -- <file>` for the relevant commit) to understand original intent.
2. Classify into:
   - **(a) Intentional dead code** — the variable was used briefly during development and never wired. **Action: delete.**
   - **(b) Lost wiring** — the UI element WAS rendered, was lost in a refactor. **Action: restore the call site (in this shard, with a `git log` reference in the commit body).**
   - **(c) Real product gap** — the feature is half-built and needs product judgment. **Action: file a tracking issue against the project (`gh issue create`), link the issue, DELETE the variable in this workstream (the deletion comment references the tracking issue).** No `eslint-disable`.

Each Type E case produces ONE of the three outcomes; tracking issues opened in this shard form a deliverable list.

### Shard 4 acceptance

```bash
cd apps/web
npx eslint . 2>&1 | tail -3          # 9 warnings cleared
npm run test -- --run                 # Vitest green; new tests for restored UI in (b)
npx playwright test tests/e2e/        # green; restored UI verified
npm run build                         # production build green
```

Tracking issue list documented in workspace journal.

## Shard 5 — Final verification + spec landing + CI gate

**Scope expanded per F25** — make the lint-clean state structurally enforced.

### 5.1 Final lint check

```bash
cd apps/web
npx eslint . 2>&1 | tail -3          # 0 errors, 0 warnings
```

### 5.2 Build + tests

```bash
npx tsc --noEmit && npm run test -- --run && npx playwright test tests/ && npm run build
```

### 5.3 CI gate (F25)

Verify the existing GitHub Actions workflow (`.github/workflows/lint-web.yml` or equivalent) runs `npx eslint .` and fails on non-zero exit. If absent, add the gate. This is the structural defense that prevents future agents from re-introducing lint failures.

### 5.4 Spec landing

- Land `specs/frontend-data-fetching.md` (already drafted) — but with the per-hook staleTime decisions from Shard 2 (F11) replacing the generic table, and the F23 ambiguity resolved.
- Land `specs/react-hooks-correctness.md` (already drafted) — with antipatterns 7 (cascading setState in updater, F15), 5b (closure mutation in `.map()`, F16), exhaustive-deps TanStack-Query gotcha (F17), and antipattern 4 addendum on `key=<field>` choice (F24).

### 5.5 Codify

Codify the canonical pattern + the lessons learned into `.claude/skills/project/frontend-data-fetching.md` (project-level, not workspace-only). The workspace specs are the source; the project skill is the agent-facing reference.

## Risk register (R1-R8 — replaces v1's R1-R4)

- **R1 — TanStack Query stale-time defaults change behavior** — F11 mitigation: per-hook decision; documents lists at `staleTime: 0`.
- **R2 — Type reconciliation cascades** — `tsc --noEmit` after each interface edit; fix all surfaced errors in same shard.
- **R3 — Type E "intentional vs lost vs gap"** — F10 protocol; (c) outcomes file tracking issues + delete; no silent `eslint-disable`.
- **R4 — File collisions across shards** — File→owner matrix above; zero file overlap after Shard 1.
- **R5 — Behavioral regression for the 6 migrations** (F9, F18) — Tier 2 + Tier 3 regression tests in Shard 2; brief criterion 4 acceptance.
- **R6 — Action-driven fixes need consumer grep** (F7, F8) — Shard 1 explicitly enumerates `setIsOpen`, `close()`, `Esc handler` callers per `abstraction-consumers.md`.
- **R7 — Lazy-init interacts with mutation handlers** (F5) — Shard 1 verifies and edits `setEnabled` callback in same pass; insights useMemo gates on `isEnabled`.
- **R8 — Eslint config preflight** (F19) — Shard 1 step 1.1 verifies before adding.

## Effort estimate

Per `rules/autonomous-execution.md` § "Per-Session Capacity Budget":

- **Shard 1**: 1 session. ~12 files, mostly mechanical, but 4 action-driven fixes (F1, F5, F6, F7, F8) need consumer enumeration. Use per-batch lint check (F14) every 5 files.
- **Shard 2**: 1 session. 6 hooks + 6 page rewrites + 6 regression tests. Largest single shard; the regression tests dominate LOC. Each migration is a 3-step "grep callsites → write hook → swap component".
- **Shard 3**: 1 session. Type reconciliation + 8 file edits.
- **Shard 4**: 0.5–1 session. 9 Type E investigations; (a) and (b) outcomes are quick; (c) outcomes file issues.
- **Shard 5**: < 0.5 session. Verification, CI gate, codify.

Parallel: Shards 2 + 3 + 4 in one wall-clock window after Shard 1 merges.

**Total: 2 wall-clock sessions** (1 for Shard 1, 1 for parallel 2+3+4 + Shard 5).

## Implementability

Per F-cleanup at the redteam summary, every "see § X" reference is now spelled out inline OR explicitly delegated to the analysis docs by file:line.
