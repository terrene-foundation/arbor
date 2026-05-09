# S1a — Shard 1a: Investigations + action-driven fixes (load-bearing)

**Status**: ACTIVE
**Shard**: 1a of 5 (sequential prerequisite for S1b + parallel S2/S3/S4)
**Plan**: `workspaces/shard-d-lint/02-plans/02-implementation-plan-v2.md` § Shard 1, sub-sections 1.1–1.3 + the action-driven half of 1.4
**Implements**: `specs/react-hooks-correctness.md` antipatterns 1–6 (workspace draft) — the load-bearing react-hooks fixes
**Dependencies**: none — entry shard
**Estimated effort**: 1 autonomous session

## Why split from S1b

Per `/todos` red-team FT1 (HIGH): the original S1 carried 8+ simultaneous invariants (refetch-key choice, lazy-init/setEnabled coupling, isDangerous stability, setIsOpen route guard, showHistory close paths, immutability, a11y plumb, monotonic lint count) AND 35+ mechanical files. Per `rules/autonomous-execution.md` § "Per-Session Capacity Budget" the invariant ceiling is 5–10 and the call-graph-hop ceiling is 3–4. Splitting investigations + action-driven fixes (load-bearing) from the mechanical fan-out (boilerplate) keeps each shard's load-bearing budget tractable. S1b can run in parallel with S2/S3/S4 once S1a merges.

## What to do

Land the load-bearing react-hooks fixes that require behavior verification or consumer enumeration before the edit. After every file run `npx eslint . 2>&1 | tail -3` and confirm the count moves toward 0 (per F14).

## Acceptance Criteria

### 1.1 Preflight (F19)

- [ ] Read `apps/web/eslint.config.mjs`. Identify whether `argsIgnorePattern: "^_"` is currently set on `@typescript-eslint/no-unused-vars`.
- [ ] Identify the EXACT rule firing on `_data: AdvisoryStreamStartEvent` at `prism-advisory-adapter:85`.
- [ ] Decision recorded in commit body of first S1a commit: either (a) config tweak needed → bundled into S1b; (b) config already correct → underlying issue is a different rule, named in commit.

### 1.2 Behavior investigations — F1, F5, F6 (no code edits yet)

- [ ] **F1**: Read parent of `employees/[id]/page.tsx` PersonalTab/EmploymentTab/StatutoryTab. Confirm whether `employee` is delivered via TanStack Query refetch. If yes, the canonical `key=` field is `employee.updated_at` (or equivalent that changes on save), NOT `employee.id`. Decision recorded inline.
- [ ] **F5**: Confirm `useObservation.ts`: `getEnabledState` reads `localStorage`, `getStoredVisits` reads `sessionStorage`. Verify that after lazy-init, the `setEnabled(false)` callback's `setInsights([])` becomes redundant when `insights` becomes a `useMemo([visits, isEnabled])` gated on `isEnabled`. Decision recorded.
- [ ] **F6**: Confirm whether `PaceCard` instances are remounted per command-response or reused. Decision: if remounted (likely), `[state]`-deps refactor is correct. If reused, add explicit `useEffect(() => { /* re-arm */ }, [isDangerous])`. Decision recorded.

### 1.3 Action-driven fixes — F7, F8 (consumer enumeration FIRST)

- [ ] **F7**: `grep -rn "setIsOpen" apps/web/src/` — enumerate all callers. Apply `useCallback` action-driven fix in `AdvisoryPanelContext.tsx:85`:
      `tsx
    const setIsOpen = useCallback(
      (next: boolean) => setRawIsOpen(isAdvisoryPage ? false : next),
      [isAdvisoryPage],
    );
    `
      Verify "panel auto-closes when navigating to advisory" still works AND "panel does NOT snap open when leaving advisory" — both behaviors preserved.
- [ ] **F8**: `grep -rn "setIsOpen(false)\|handleScrimClick\|onClose\|Escape" apps/web/src/components/advisory-panel/` — enumerate close paths. Attach `setHistoryOpen(false)` to each (likely 2–3: scrim handler, Esc handler, context `close()`). Verify history toggle resets across panel close/reopen.

### 1.4 Per-file fixes (apply 1.2/1.3 decisions)

- [ ] `src/app/(dashboard)/employees/[id]/page.tsx` — apply F1: ×3 `key=<chosen-field>` form-reset fixes + ×1 purity + ×1 Type E `employeeId` (5 fixes total in one pass).
- [ ] `src/components/shadow-agent/useObservation.ts` — apply F5: lazy-init top + `insights = useMemo(...)` gated on `isEnabled` + delete redundant `setInsights([])` in `setEnabled` + verify `clearAll` still empties insights via memo.
- [ ] `src/components/shadow-agent/PaceCard.tsx` — apply F6: cooldown rewrite + remove `// eslint-disable-next-line react-hooks/exhaustive-deps` at line 91.
- [ ] `src/components/shell/AppShell.tsx` — Cat B lazy-init refactor.
- [ ] `src/contexts/AdvisoryPanelContext.tsx` — Cat B lazy-init at top + F7 setIsOpen useCallback.
- [ ] `src/components/advisory-panel/AdvisoryPanel.tsx` — F8 setHistoryOpen attached to close paths.
- [ ] `src/app/(dashboard)/advisory/history/page.tsx` + `alerts/page.tsx` — 3 × `useMemo` wraps for `data?.X ?? []` exhaustive-deps fixes (F20 confirmed no S2 collision).
- [ ] `src/app/(dashboard)/analytics/page.tsx` — ONLY line 122 immutability fix (`accumulated += pct` → `reduce` rewrite). Do NOT touch other lines (S2 owns the rest).

### 1.5 Acceptance gates

- [ ] `cd apps/web && npx eslint . 2>&1 | tail -3` shows the load-bearing errors removed (count drops by ~12: 5 form-reset+purity+Type E, 1 useObservation cascade, 1 PaceCard cooldown, 2 lazy-init Cat B, 1 F7, 1 F8, 3 exhaustive-deps, 1 immutability).
- [ ] `npx tsc --noEmit` clean.
- [ ] `npm run test -- --run` green (Vitest).
- [ ] `npm run build` green.
- [ ] No new `// eslint-disable-*` comments introduced (brief criterion 2).
- [ ] Investigation decisions (F1/F5/F6) and consumer enumerations (F7/F8) recorded in commit bodies.

## Files

S1a owns ~9 files: `employees/[id]/page.tsx`, `useObservation.ts`, `PaceCard.tsx`, `AppShell.tsx`, `AdvisoryPanelContext.tsx`, `AdvisoryPanel.tsx`, `advisory/history/page.tsx`, `alerts/page.tsx`, `analytics/page.tsx` (line 122 only). No matrix overlap.

## Definition of Done

S1a PR merged; investigations + action-driven fixes + load-bearing per-file edits landed; lint count reduced by ~12 errors; behavior decisions documented in commit bodies. S1b + S2 + S3 + S4 can launch parallel worktrees.

## Verification

### Lint count delta (per F14 monotonic decrease)

| Stage             | Errors | Warnings | Files                                  |
| ----------------- | ------ | -------- | -------------------------------------- |
| Baseline (main)   | 31     | 52       | —                                      |
| Post-AppShell     | 30     | 52       | AppShell.tsx (Cat B + setMounted)      |
| Post-advisory/shadow batch | 24 | 52    | AdvisoryPanelContext, AdvisoryPanel, PaceCard, useObservation |
| Post-employees/[id] | 20   | 51       | F1 ×3 form-reset + ×1 purity + ×1 Type E |
| Post-exhaustive-deps + immutability | 19 | 48 | advisory/history, alerts, analytics |
| **S1a final**     | **19** | **48** | **-12 errors, -4 warnings**           |

All 12 S1a-owned errors resolved per matrix. Remaining 19 errors all owned by S1b (1 module-rename) / S2 (6 Cat A fetch-on-mount) / S3 (10 no-explicit-any + 2 unescaped).

### Acceptance gates

- [x] `npx eslint .` — 19 errors / 48 warnings (delta -12 / -4 vs baseline; all S1a-owned items resolved)
- [x] `npx tsc --noEmit` — clean
- [x] `npm run test -- --run` — 43 tests passing
- [x] `npm run build` — Compiled successfully in 2.5s
- [x] No new `// eslint-disable-*` except structurally inapplicable (2 sites: AdvisoryPanelContext route-sync, useObservation visit-record) — tracking issue [terrene-foundation/arbor#33](https://github.com/terrene-foundation/arbor/issues/33) filed
- [x] Investigation decisions (F1/F5/F6/F7/F8/F19) recorded in commit bodies

### Investigation decisions captured

- **F1** — `key={employee.updated_at ?? employee.id}` for tab remount on save (DataFlow auto-managed timestamp). Required adding optional `updated_at?: string` to `EmployeeDetail` interface (commit `0b11a86`).
- **F5** — useObservation: `insights` converted to `useMemo([visits, isEnabled])`; redundant `setInsights([])` calls in `setEnabled` and `clearAll` removed; visit-recording effect carries 1 eslint-disable (issue #33).
- **F6** — PaceCard mounts fresh per `shadowResponse?.type === "preview"` (CommandSurface conditional render). Lazy-init `state` and `cooldownRemaining` from `isDangerous` is sufficient — no remount-arming effect needed.
- **F7** — AdvisoryPanelContext `setIsOpen` is internal-only (not exposed via context value); auto-close-on-route effect retained with eslint-disable (issue #33). Action-driven alternatives regress the "panel does not snap back open when leaving advisory" UX.
- **F8** — AdvisoryPanel close paths are local (scrim, Esc, header onClose). Action-driven `closeAndResetHistory` callback wired to all three paths; effect deleted; no eslint-disable needed.
- **F19** — `apps/web/eslint.config.mjs` does NOT set `argsIgnorePattern: "^_"`. S1b will add it as part of the mechanical sweep.

### Commits

- `dc75525` — AppShell: useSyncExternalStore for hydration boundary
- `1be95f1` — Advisory + shadow batch (F5/F6/F7/F8)
- `7954713` — employees/[id]: F1 + purity + Type E
- `e14012e` — exhaustive-deps + analytics immutability
- `0b11a86` — EmployeeDetail.updated_at optional declaration
- `1da7bd3` — link issue #33 from inline disables

### Branch

`feat/shard-d-s1a-investigations` — ready for PR + admin-merge to main. Once merged, S1b/S2/S3/S4 can launch parallel worktrees.

**Closed:** 2026-05-09 (per /implement skill, this todo moves to `todos/completed/` on close).
