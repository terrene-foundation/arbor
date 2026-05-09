# Shard D Implementation Plan — Lint to 0/0

Synthesized from the two analyses:

- `01-analysis/02-react-hooks-pattern-classification.md` (20 react-hooks errors)
- `01-analysis/03-type-safety-and-cleanup.md` (11 type-safety/a11y errors + 49 warnings)

Goal: `cd apps/web && npx eslint .` exits 0 with **0 errors + 0 warnings**, no `// eslint-disable-*` comments added (per `rules/zero-tolerance.md` Rule 4), tests green, build green.

## Sequencing

**Shard 1 → land first, sequentially.** Clears noise so later shards see real picture.

**Shards 2 + 3 + 4 → run in parallel via worktrees** after Shard 1 merges. They edit disjoint file sets so merge conflicts are minimal.

**Shard 5 → final verification + spec landing**, runs after 1-4 are merged.

```
Shard 1 (sequential) ─┬─→ Shard 2 (parallel worktree) ─┐
                      ├─→ Shard 3 (parallel worktree) ─┼─→ Shard 5 (final)
                      └─→ Shard 4 (parallel worktree) ─┘
```

## Shard 1 — Mechanical sweep (no new files, no type changes)

**Scope:** Pure deletion + syntax fixes that cannot break behavior. ~22 violations cleared.

From `02-react-hooks-pattern-classification.md`:

- 3 × Category B (localStorage hydration) → lazy `useState` initializer
  - `src/components/shell/AppShell.tsx:23`
  - `src/contexts/AdvisoryPanelContext.tsx:68`
  - `src/components/shadow-agent/useObservation.ts:217`
- 2 × Category C (state-invariant violations) → derive in render or fold into action handler
  - `src/contexts/AdvisoryPanelContext.tsx:85`
  - `src/components/advisory-panel/AdvisoryPanel.tsx:88`
- 3 × Category D (form-reset on prop change) → parent uses `key={employee.id}` instead
  - `src/app/(dashboard)/employees/[id]/page.tsx:516`, `:1334`, `:1885` — single-`key` fix kills all three
- 1 × Category F (PaceCard cooldown timer) → use `setTimeout` ref pattern
  - `src/components/shadow-agent/PaceCard.tsx:76`
- 3 × `react-hooks/exhaustive-deps` → wrap unstable refs in `useMemo`
  - `src/app/(dashboard)/advisory/history/page.tsx:230`
  - `src/app/(dashboard)/alerts/page.tsx:156` (×2)
- Remove existing `// eslint-disable-next-line react-hooks/exhaustive-deps` at `PaceCard.tsx:91` (per Rule 4)

From `03-type-safety-and-cleanup.md`:

- 29 × Type A (dead imports) — pure deletion
- 2 × Type B (catch bindings) — `} catch (err) {` → `} catch {`
- 4 × Type C (required params) — leading underscore prefix
- 1 × eslint config: add `argsIgnorePattern: "^_"` to `apps/web/eslint.config.mjs` (retroactively suppresses underscore-prefixed unused params if they slip back in)
- 2 × `no-unescaped-entities` → `&apos;` substitution
- 1 × `no-assign-module-variable` (`ArborResult.tsx:50`) → rename `module` → `targetModule`
- 1 × `role-has-required-aria-props` (`TopBar.tsx:226`) → add `aria-controls="topbar-search-results"` + plumb `id` into `SearchResults`

**Files touched:** ~16 files, all in `apps/web/src/`. ~150 LOC delta (mostly deletions).

**Acceptance:**

- `npx eslint .` shows ≤ 9 errors + ≤ 13 warnings remaining
- `npm run build` clean
- `npm run test` green
- No `// eslint-disable` comments added; one removed (PaceCard:91)

**Verification commands** (in same shard):

```bash
cd apps/web
npx eslint . 2>&1 | tail -3                    # error/warning count
npm run build 2>&1 | tail -10                  # build green
npm run test -- --run 2>&1 | tail -5           # tests green
```

## Shard 2 — TanStack Query hook additions (parallel worktree A)

**Scope:** Migrate the 6 fetch-on-mount Category A errors to existing/new TanStack Query hooks. Hooks live at `apps/web/src/hooks/api/`.

From `02-react-hooks-pattern-classification.md` Category A:

- `src/app/(auth)/signup/page.tsx:534` → new `useAuth.ts` hook (or extend if exists)
- `src/app/(dashboard)/analytics/page.tsx:400` → new `useAnalytics.ts`
- `src/app/(dashboard)/dashboard/page.tsx:368` → existing dashboard hook OR new `useDashboard.ts`
- `src/app/(dashboard)/documents/[id]/preview/page.tsx:20` → extend existing `useDocuments.ts`
- `src/app/(dashboard)/documents/page.tsx:72` → extend `useDocuments.ts`
- `src/components/design-system/EmployeePicker.tsx:42` → new `useEmployees.ts`

**Pattern reference:** `apps/web/src/hooks/useAdvisoryHistory.ts` and `apps/web/src/hooks/api/useAlerts.ts`.

For each query hook:

- `queryKey: ["domain", id?]`
- `queryFn` calls existing `services/api/<domain>.ts`
- `staleTime` matches the data's natural freshness (employee profile: 60s; documents list: 30s; analytics: 5min)
- Existing `loading` / `error` triplet in callsites collapses to `query.isLoading` / `query.error` / `query.data`

**Files touched:** ~6 page/component files (call-site swap) + 3 new hook files + extension of 1 existing hook file. ~250 LOC.

**Acceptance:**

- `npx eslint .` errors drop by 6 (the 6 fetch-on-mount Category-A hits)
- Each migrated page renders identically against `arbor.aitelab.net` API (manual playwright check OR existing E2E run)
- Tests green; new tests for any new hook (Tier 1 unit-style at minimum)

## Shard 3 — Type reconciliation (parallel worktree B)

**Scope:** Replace 10 × `no-explicit-any` with real types + delete 4 × Type D dead vars.

From `03-type-safety-and-cleanup.md`:

- 7 of 10 `no-explicit-any` are caused by service-type interfaces lagging backend response shape. Add the missing fields:
  - `LeaveType` ← `leave_type_name`
  - `Project` ← `budget_amount`
  - `ClientCreateRequest` ← `estimated_headcount`
  - (3 more — see `03-type-safety-and-cleanup.md` § no-explicit-any)
- 3 of 10 are caught-error bindings → narrow with `instanceof Error` check or use `unknown` + type guard.
- 4 × Type D (genuine dead vars) — delete.

**Files touched:** `apps/web/src/services/api/*.ts` + `apps/web/src/types/api.ts` + 8 page files (call sites consume the new field types). ~80 LOC added, ~30 LOC deleted.

**Acceptance:**

- `npx eslint .` errors drop by 10 + warnings drop by 4
- `npx tsc --noEmit` clean (per-file)
- No `as any` / `as unknown as` / `// @ts-ignore` introduced
- Tests green; build green

## Shard 4 — Wiring investigations (parallel worktree C)

**Scope:** 9 Type E warnings are LOST UI WIRING (variables WERE used but the rendering code was deleted). Each needs product judgment.

From `03-type-safety-and-cleanup.md` Type E list:

- `URGENCY_TIMEFRAMES` not rendered
- `messageId` not threaded to feedback callback
- `onOpenHistory` button never wired
- `STAGE_STYLES` not consumed
- `FUNDING_OPTIONS` dropdown missing
- analytics error/loading state quartet not rendered
- `ExpandableNavLink` ignoring `collapsed`
- (2 more — see § "Type E (Investigation needed)")

**For each:** read the file context, determine:

- (a) intentional dead code → delete (preserve as a follow-up issue if scope is large)
- (b) lost wiring → restore the call site
- (c) genuinely planned-but-not-yet-built → leave with `// eslint-disable-next-line` + tracking issue (PER ZERO-TOLERANCE RULE 3 EXCEPTION — only if (a) and (b) genuinely don't apply)

**Files touched:** ~9 component/page files. LOC variable depending on (a)/(b)/(c) split.

**Acceptance:**

- 9 Type E warnings cleared
- Each (b) restoration verified to render the missing UI element
- Each (c) has a filed tracking issue linked in the eslint-disable comment

## Shard 5 — Final verification + spec landing

**Scope:** After Shards 1-4 merge, verify zero residual + land the canonical spec.

Steps:

1. Run `cd apps/web && npx eslint .` → expect `0 errors, 0 warnings`
2. Run `cd apps/web && npm run build` → clean
3. Run `cd apps/web && npm run test -- --run` → green
4. Land `specs/frontend-data-fetching.md` documenting the canonical TanStack Query pattern (if not already in the project's spec dir; if a workspace spec, use `workspaces/shard-d-lint/specs/`).
5. Add a CI gate so `eslint .` failures block PR merge (verify the existing GH workflow already does this; if not, add).
6. Codify findings into `.claude/skills/project/` as appropriate (e.g., `frontend-state-patterns.md`).

## Risk register

- **R1 — TanStack Query stale-time defaults change behavior**: a page that re-fetched on every mount now caches for `staleTime`. Pick `staleTime` per-domain conservatively (employee profile: 60s, documents list: 30s, analytics: 5min). Verify each migrated page renders fresh data within expected window.
- **R2 — Type reconciliation cascades**: adding `leave_type_name` to `LeaveType` may surface previously-hidden `undefined` paths. Run `tsc --noEmit` after each interface edit, fix ALL surfaced errors in same shard.
- **R3 — Type E "lost wiring" might be intentional**: some unused vars may be feature-flagged-off code. Read git history (`git log -- <file>`) to understand original intent before deleting.
- **R4 — Worktree merge conflicts**: Shards 2 + 3 + 4 may both edit `apps/web/src/types/api.ts`. Designate Shard 3 as the type-file owner; Shards 2 + 4 must rebase on Shard 3's merged HEAD before opening their PR.

## Effort estimate (autonomous execution cycles)

- Shard 1: 1 session (mechanical, no design decisions)
- Shards 2 + 3 + 4 in parallel: 1 session each, all in one wall-clock window
- Shard 5: < 1 session

**Total: 2 wall-clock sessions** (1 for Shard 1, 1 for parallel 2+3+4+5).
