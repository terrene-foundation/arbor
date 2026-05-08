# Shard D Plan — Red Team Round 1

Adversarial review of `02-plans/01-implementation-plan.md` against the
two analysis documents and the workspace specs. Read-only analysis.

Findings classified:

- **CRIT** — blocks Shard 1 from starting
- **HIGH** — must fix before the named shard starts
- **MED** — fix-as-you-go during implementation
- **LOW** — note for `/codify`

---

## Summary

| #   | Severity | Title                                                                                                                                                                                                                | Affects        |
| --- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| F1  | HIGH     | `key={employee.id}` remount drops unsaved form changes                                                                                                                                                               | Shard 1        |
| F2  | HIGH     | `documents/page.tsx` migration breaks `onRetry={fetchTemplates}` callsite                                                                                                                                            | Shard 2        |
| F3  | HIGH     | Shard 2 ↔ Shard 3 page-file collision is real, plan's R4 mitigation is wrong                                                                                                                                         | Shard 2/3      |
| F4  | HIGH     | `analytics/page.tsx` is in BOTH Shard 1 (immutability) AND Shard 2 (fetch-on-mount) AND Shard 3 (Type D analytics quartet) — three-way collision not in R4                                                           | Shard 1/2/3    |
| F5  | HIGH     | `useObservation.ts` lazy-init claim is wrong — `getEnabledState` reads `localStorage`, not `sessionStorage`, and `clearAll` writes through stale closure                                                             | Shard 1        |
| F6  | HIGH     | Cooldown timer rewrite changes user-visible semantics: cooldown now fires on every remount with `isDangerous=true`, not just first preview entry                                                                     | Shard 1        |
| F7  | HIGH     | `AdvisoryPanelContext:85` derived-isOpen fix breaks the persist-to-sessionStorage effect at line 74                                                                                                                  | Shard 1        |
| F8  | HIGH     | `AdvisoryPanel:88` "derive `showHistory`" fix changes semantics: history toggle no longer auto-resets across panel close/reopen                                                                                      | Shard 1        |
| F9  | HIGH     | No regression test (E2E or otherwise) gates the 6 fetch-on-mount migrations against production-equivalent behavior                                                                                                   | Shard 2        |
| F10 | HIGH     | Type E "lost wiring" investigations require product judgment outside the lint workstream's brief — Shard 4 has no escape hatch                                                                                       | Shard 4        |
| F11 | HIGH     | `staleTime` defaults are not grounded — `useTemplates` at 30s creates a UX regression on the create→navigate-back path                                                                                               | Shard 2 + spec |
| F12 | HIGH     | Plan misses the `setReportLoading(...)` calls in the analytics effect — dropping the unused state hooks alone leaves dangling setter calls                                                                           | Shard 3        |
| F13 | HIGH     | `useInviteValidation` `staleTime: Infinity` is unsafe across React StrictMode + token-rotation flows                                                                                                                 | Shard 2        |
| F14 | MED      | Plan's "Files touched ~16 files" undercount — Shard 1 actually touches >20 files when including the `useState` lazy-initializers and the eslint config                                                               | Shard 1        |
| F15 | MED      | Spec antipattern coverage gap — spec's 6 antipatterns don't enumerate the "cascading setState in updater" pattern used at `useObservation:230`                                                                       | Spec           |
| F16 | MED      | Spec antipattern coverage gap — `react-hooks/immutability` (`accumulated += pct` in `.map()`) is not a documented antipattern; classified as F (other) by the analysis                                               | Spec           |
| F17 | MED      | Spec antipattern coverage gap — the `data?.X ?? []` instability at `useMemo` deps (3 lint findings) has no spec entry                                                                                                | Spec           |
| F18 | MED      | Brief success criterion 4 ("no regression in production behavior") has no concrete acceptance test — the plan offloads it to "manual playwright check OR existing E2E run" with no enumeration                       | Brief→Plan     |
| F19 | MED      | Eslint config tweak (`argsIgnorePattern: "^_"`) is bundled into Shard 1 but the plan never verifies the config currently lacks it — could be a no-op                                                                 | Shard 1        |
| F20 | MED      | `react-hooks/exhaustive-deps` (3 findings) bundled into Shard 1 but two of them sit on `analytics/page.tsx` whose surrounding code is being rewritten by Shard 2                                                     | Shard 1/2      |
| F21 | MED      | Plan's `useInviteValidation` design preserves "error-message keyword sniffing" inside a `useMemo` — that is not a stub but it is the same anti-pattern in a different location                                       | Shard 2        |
| F22 | MED      | Plan's "Tests green" acceptance is underspecified — Tier 1 only? Tier 2? E2E? `apps/web` has Vitest + Playwright; the command `npm run test -- --run` covers Vitest only                                             | All shards     |
| F23 | LOW      | Spec `frontend-data-fetching.md` references `useDashboard.ts` as "(NEW or reuse if exists)" — ambiguity invites two parallel files                                                                                   | Spec           |
| F24 | LOW      | Plan does not codify the `key={employee.id}` Pattern D fix into a workspace-local skill / spec — the lesson is at risk of being lost                                                                                 | /codify        |
| F25 | LOW      | Brief traceability table in `specs/_index.md` claims success criterion 1 ("0/0 lint") "is not a spec" — but the plan's acceptance criteria ARE the contract; they belong in a spec section, not orphaned in the plan | Spec           |

---

## Detailed Findings

### F1 — HIGH — `key={employee.id}` remount drops unsaved form changes

**Where:** Shard 1 (mechanical sweep), three sites in
`apps/web/src/app/(dashboard)/employees/[id]/page.tsx` lines 516, 1334,
1885 (`PersonalTab`, `EmploymentTab`, `StatutoryTab`).

**Claim under test:** The plan claims the `useEffect(() => { setForm({});
setHasChanges(false); }, [employee])` reset is "textbook React
anti-pattern" and the `key={employee.id}` fix is "trivial. 3 effects
deleted, 3 `key=` props added".

**Failure mode:** The CURRENT effect fires on EVERY change to the
`employee` reference — not just on `employee.id` change. That's the
silent semantic difference. Look at `PersonalTab` at line 510-518:

```tsx
const [form, setForm] = useState<Partial<EmployeeDetail>>({});
const [hasChanges, setHasChanges] = useState(false);

useEffect(() => {
  setForm({});
  setHasChanges(false);
}, [employee]); // ← fires when employee REFERENCE changes
```

After a save (`onSave(form)` at line 534), the parent likely refetches
the employee, producing a NEW `employee` object reference with the SAME
`id`. The current code resets `form` and `hasChanges` on that refetch
— intentional behavior so the form re-syncs to canonical server state
after save.

The proposed `key={employee.id}` fix only remounts when the **id
changes** (i.e., navigating between employees), NOT on refetch. Result:
after the user clicks Save, `form` retains the just-submitted draft
overlay and `hasChanges` retains `false`, but on the NEXT edit
`updateField` calls `setForm((prev) => ({...prev, [key]: value}))` —
which prepends the value into the STALE `form` object, possibly leaking
fields the user already saved to the next save attempt.

The analysis doc does NOT verify "is `[employee]` a reference-change
trigger or an identity-change trigger?" by checking the parent's
refetch shape. The classification "Pattern D — derived state from
props" is structurally right, but the fix is wrong without first
verifying that re-mount-on-refetch is acceptable to the user's flow.

**Fix:**

1. Read the parent component (the page-level component above line 510)
   and identify how `employee` is delivered to the tabs — is it from a
   `useState`/`useQuery`/refetch?
2. If post-save refetch is intentional, the canonical fix is NOT
   `key={employee.id}` — it's `key={employee.updated_at}` (or any field
   that DOES change on save). That preserves the post-save reset.
3. Document the choice in the spec (`react-hooks-correctness.md`
   antipattern 4) — the current spec says `<EmployeeForm
key={employee.id} ... />` without flagging the refetch pitfall.

**Lands in:** Shard 1 (revise the fix); spec gets an addendum.

---

### F2 — HIGH — `documents/page.tsx` migration breaks `onRetry={fetchTemplates}` callsite

**Where:** Shard 2, `apps/web/src/app/(dashboard)/documents/page.tsx`
line 176.

**Claim under test:** Plan section "Shard 2" says: "Page replaces
`fetchTemplates()` callsites with `query.refetch()`. Mutation hooks
... call `queryClient.invalidateQueries(...)` — automatic refresh, no
manual closure. Effort: trivial-to-moderate".

**Failure mode:** The page already exposes `fetchTemplates` to the
`<ErrorState onRetry={fetchTemplates} />` at line 176. After
migration, `query.refetch` returns `Promise<QueryObserverResult>`,
NOT `void`. The `ErrorState` `onRetry` prop type may be `() => void`
or `() => Promise<void>` — verify before the swap. If it's strictly
`() => void`, you must wrap: `onRetry={() => { void
query.refetch(); }}`. If it's lenient, the awaited result-shape change
may surface in error-handling assumptions.

The plan's "trivial" rating is wrong; the `onRetry` callsite is one of
the load-bearing user-flow behaviors (this IS the failed-load retry
path) and the `query.refetch` shim must preserve it identically.

Same concern at `documents/[id]/preview/page.tsx`. Look at lines
24–34: the existing code does `setError(...)` from a `.catch`. With
TanStack Query, `query.error` is exposed but the `templateId` validity
check (`if (!templateId || isNaN(templateId))`) currently sets `error`
to `"Invalid template ID"` BEFORE any fetch — that path produces a
non-network error. With `useQuery({ enabled: !!templateId && !isNaN }
)`, the invalid-id case yields `isLoading: false, error: undefined,
data: undefined`. The page must explicitly render an "Invalid template
ID" branch when `!templateId || isNaN(templateId)` — `query.error`
alone is insufficient.

**Fix:** In Shard 2, add to the migration checklist: "every callsite
of the existing `fetchTemplates` / setError closure must be enumerated
via `grep -n 'fetchTemplates\\|setError("Invalid' apps/web/src/app/...`
BEFORE the swap. Each becomes either `query.refetch` (with shape
adapter if needed) or a separately-rendered branch."

**Lands in:** Shard 2.

---

### F3 — HIGH — Shard 2 ↔ Shard 3 file collision is real, plan's R4 mitigation is wrong

**Where:** Plan's risk register R4: "Shards 2 + 3 + 4 may both edit
`apps/web/src/types/api.ts`. Designate Shard 3 as the type-file owner;
Shards 2 + 4 must rebase on Shard 3's merged HEAD before opening their
PR."

**Claim under test:** The plan says only `types/api.ts` is at risk,
and the mitigation is "Shard 3 first, Shards 2/4 rebase".

**Failure mode:** The collision is BROADER than `types/api.ts`. Cross-
referencing the per-file lists:

- **Shard 2 edits** (page rewrites at the call site, per Cat A list):
  `signup/page.tsx`, `analytics/page.tsx`, `dashboard/page.tsx`,
  `documents/[id]/preview/page.tsx`, `documents/page.tsx`,
  `EmployeePicker.tsx`.

- **Shard 3 edits** (call sites consuming new field types, per
  03-type-safety doc): `onboarding/page.tsx`, `appraisals/page.tsx`,
  `employees/page.tsx`, `leave/page.tsx`, `projects/page.tsx`,
  `recruitment/page.tsx`, `CompanySetupModal.tsx`, AND service files
  `services/api/{leave,projects,appraisals,employees}.ts`,
  `types/api.ts`.

These DON'T overlap on first read, but:

- **Shard 1** edits `signup/page.tsx` (line 534 fix is in Shard 2 only —
  but `signup` also has the `} catch (err: any)` Type B fix which is
  Shard 1 mechanical sweep). So `signup/page.tsx` is in BOTH Shard 1
  AND Shard 2.
- **Shard 1** edits `EmployeePicker.tsx` is NOT a hit — but the
  `useObservation.ts` (Shard 1) shares import surface with the
  shadow-agent module that Shard 4 may touch via Type E `messageId`
  /`onOpenHistory` — same package directory.
- **Shard 2** edits `analytics/page.tsx` (the 6-fetch migration). Shard
  3's Type D analytics quartet sits in the SAME file (lines 369, 374,
  376, 377). See F4 — three-way collision.

**Fix:** Replace R4 with: "Designate one shard per FILE, not per
abstraction layer. Build a file→owner matrix at start of phase.
Files touching multiple concerns are sequenced (one shard at a time),
not parallelized. Specifically:

| File                              | Shards that want to edit                                       | Owner                          |
| --------------------------------- | -------------------------------------------------------------- | ------------------------------ |
| `signup/page.tsx`                 | 1 (Type B), 2 (Cat A)                                          | 2 (after 1)                    |
| `analytics/page.tsx`              | 1 (immutability), 2 (Cat A), 3 (Type D quartet)                | sequential 1 → 3 → 2           |
| `dashboard/page.tsx`              | 1 (Type A AlertBanner), 2 (Cat A)                              | 2 (after 1)                    |
| `employees/[id]/page.tsx`         | 1 (×3 form-reset, ×1 purity, ×1 employeeId Type E), 4 (Type E) | 1 (after Type E investigation) |
| `documents/[id]/preview/page.tsx` | 1 (Type A Download), 2 (Cat A)                                 | 2 (after 1)                    |
| etc.                              |

Sequencing — Shard 1 first, then for any file edited by 1 + (2/3/4),
the later shard must rebase. Parallel-worktree only for files that
appear in EXACTLY ONE shard's list."

**Lands in:** Plan revision (replace R4 with a file→owner matrix).

---

### F4 — HIGH — `analytics/page.tsx` is in three shards simultaneously

**Where:** `apps/web/src/app/(dashboard)/analytics/page.tsx`.

**Claim under test:** Plan claims Shards 2/3/4 are independent.

**Failure mode:** This single file appears in:

- Shard 1: `react-hooks/immutability` at line 122 (the conic-gradient
  reduce refactor) AND the `react-hooks/exhaustive-deps` line is on
  alerts/page, not analytics — but it's still in Shard 1 because the
  set-state-in-effect at line 400 is Cat A → Shard 2.
- Shard 2: line 400, the 6-fetch-on-mount migration (the LARGEST single
  rewrite in the plan — 18 useState → 6 useQuery, ~80 LOC delta).
- Shard 3: Type D dead vars at lines 369, 374, 376, 377
  (`reportLoading`, `metricsError`, `feedbackError`, `reportError`),
  AND the analysis flagged these as Type E "investigation needed"
  because they're the matching loading/error to the rendered cards
  whose UI was lost.

If Shard 2 rewrites the fetch effect with 6 `useQuery` calls, the
local `reportLoading`/`metricsError`/etc. STATE HOOKS DISAPPEAR
ENTIRELY — so Shard 3 has nothing to delete (Type D resolves
implicitly). But if Shard 3 runs first or in parallel, it deletes
state hooks that Shard 2 was about to rewrite the fetch path through;
merge conflicts AND a potentially mistaken deletion that creates a
gap (e.g., the `monthlyReportError` rendering was lost; deleting the
state hook closes that loop without restoring the UI).

**Fix:** Shard 2's analytics rewrite supersedes Shards 1+3 work on
this file. Sequence: Shard 1 (just the immutability fix at line 122)
→ Shard 2 (the full 6-fetch rewrite which deletes the dangling state)
→ no Shard 3 work needed on this file. Add a note that the Type E
"missing rendering" investigation for analytics is REDUNDANT once
Shard 2 lands — verify after Shard 2 merges.

**Lands in:** Plan revision (sequence note); analysis doc 03 should
flag the analytics quartet as "resolved by Shard 2, do not separately
delete".

---

### F5 — HIGH — `useObservation.ts` lazy-init claim is partially wrong

**Where:** Shard 1, `apps/web/src/components/shadow-agent/useObservation.ts`
lines 211-219.

**Claim under test:** Plan says "Both helpers already guard `typeof
window === "undefined"` — SSR-safe. Effect at line 216 is deleted."

**Failure modes (two):**

1. **Storage type mismatch.** `getStoredVisits()` reads
   `sessionStorage`; `getEnabledState()` reads `localStorage`. Both are
   guarded for SSR, fine. The lazy-init refactor preserves both. ✓ The
   plan got this right.

2. **`setEnabled` writes to `localStorage` (line 249), but the lazy
   init reads from `localStorage` only ONCE per mount.** This already
   matches the current behavior (the original effect also runs once),
   so the refactor is behaviorally equivalent — fine.

3. **`clearAll` (line 256-) clears sessionStorage but the LOCAL state
   `visits` and `insights`** — under the lazy-init refactor, this
   continues to work because `clearAll` calls `setVisits([])` directly.
   Fine.

4. \*\*HOWEVER: `setVisits((prev) => { … if (updated.length >= 5) {
setInsights(generateInsights(updated)); } })` (line 230, the OTHER
   set-state-in-effect violation) is fixed by the plan via "compute
   insights via useMemo([visits])". This is sound — but the
   `setEnabled(false)` callback at line 252 currently does
   `setInsights([])` to immediately clear insights when the user
   disables observation. With insights as a `useMemo`, that line stops
   working — `useMemo` recomputes from `visits` (which is unchanged),
   so insights stay populated even after `isEnabled = false`.

   The fix in the analysis is ONLY half-complete. The `useMemo` must
   gate on `isEnabled`:

   ```tsx
   const insights = useMemo<ObservationInsight[]>(
     () => (isEnabled && visits.length >= 5 ? generateInsights(visits) : []),
     [visits, isEnabled],
   );
   ```

   And the `setInsights([])` line in `setEnabled` becomes redundant
   (delete it). The plan does NOT call this out — it claims `setInsights`
   callsites are removed but does not show that the dependent
   `setEnabled` callback also needs editing.

**Fix:** Add to Shard 1 task list: "in `useObservation.ts`, when
deriving `insights` via useMemo, gate on `isEnabled`. Remove the
`setInsights([])` call inside `setEnabled` (now dead code). Verify
`clearAll` still produces the empty-insights state — it does, because
clearing visits triggers the memo to return `[]`."

**Lands in:** Shard 1.

---

### F6 — HIGH — Cooldown timer rewrite changes user-visible semantics

**Where:** Shard 1, `apps/web/src/components/shadow-agent/PaceCard.tsx`
line 76.

**Claim under test:** Plan proposes lazy-init `state` and
`cooldownRemaining`, then runs only the interval in the effect, with
deps `[state]`.

**Failure modes:**

1. **Loss of `isDangerous` change handling.** The current code's
   trigger is `[isDangerous]` — if the parent re-renders with
   `isDangerous = true` after initially `false` (e.g., user toggled
   action confirmation mode mid-session), the effect re-runs and
   starts a fresh cooldown. The proposed code's deps are `[state]` —
   it never observes `isDangerous` flipping after first mount. If
   `isDangerous` is stable per render, fine; if it derives from
   `response.intent.trust_level` which may change (e.g., re-querying),
   the cooldown WOULD have re-armed under old code but does NOT under
   new code.

   Verify: is `isDangerous` derived from props that change after
   mount? Looking at line 60-61: `const trustLevel = response.intent?.trust_level
?? "propose"; const isDangerous = trustLevel === "always_propose";`.
   If `response` is stable per `PaceCard` mount (which it likely is —
   each command response gets its own `PaceCard`), the new behavior
   matches. If a `PaceCard` is reused across responses without
   remount, the cooldown silently stops re-arming.

2. **Initial-mount cooldown.** The new lazy init sets `state =
isDangerous ? "cooldown" : "preview"` and `cooldownRemaining =
isDangerous ? COOLDOWN_MS / 1000 : 0`. The interval fires on
   `state === "cooldown"`. So far so good. BUT: the existing eslint-
   disable hides the fact that `state` changes from `cooldown` →
   `preview` inside the interval (line 84). After the cooldown
   completes, the next render computes `state = "preview"` (the
   actual stored state) — fine. But on remount with `isDangerous =
true`, lazy init re-fires cooldown — fine. Behavioral parity
   probably holds, but it's NOT obvious; the analysis says "trivial"
   without showing the timing diagram.

3. **The eslint-disable is REMOVED, but the new exhaustive-deps
   surface includes `setCooldownRemaining` (stable) and
   `setState` (stable) — those don't need to be deps. The only real
   non-effect dep is `COOLDOWN_MS / 1000`, a module constant. So
   `[state]` is correct. Fine.**

**Fix:** Verify whether `PaceCard` instances are remounted per
response or reused. If reused, the cooldown re-arming on
`isDangerous` change must be preserved — add `isDangerous` to the
useMemo for the lazy-init OR add a separate effect that explicitly
watches `[isDangerous]` and resets the state machine.

**Lands in:** Shard 1.

---

### F7 — HIGH — `AdvisoryPanelContext:85` derived-isOpen breaks the persist-effect

**Where:** Shard 1,
`apps/web/src/contexts/AdvisoryPanelContext.tsx` lines 73-87.

**Claim under test:** Plan recommends "Compute the effective `isOpen`
from both inputs: `const isOpen = rawIsOpen && !isAdvisoryPage;`".

**Failure mode:** Lines 73-80 contain the OTHER effect:

```tsx
useEffect(() => {
  if (activeConversationId !== null) {
    sessionStorage.setItem(ACTIVE_CONV_KEY, String(activeConversationId));
  } else {
    sessionStorage.removeItem(ACTIVE_CONV_KEY);
  }
}, [activeConversationId]);
```

This effect is independent of the `isOpen` fix — but if the
`AdvisoryPanelContext` is re-rendered repeatedly when route flips
(`isAdvisoryPage` changes), the derived `isOpen` recomputes every
render and the persist-effect remains correct. ✓ Fine.

But:

The CURRENT line 84-85 effect FIRES `setIsOpen(false)` when
navigating to `/advisory`. Other `setIsOpen(true)` callsites (the
rest of the context's exposed `setIsOpen`) might be elsewhere — the
context exposes `setIsOpen` via `value`. If those callers do
`setIsOpen(true)` on a route that's `isAdvisoryPage`, the derived-
value approach silently treats it as `false`, which is the intent.
But the underlying `rawIsOpen` IS now `true` — meaning when the user
navigates AWAY from advisory, the panel snaps OPEN. That's a
behavioral change from "panel stays closed when route leaves
advisory".

The current code resets `setIsOpen(false)` once on entry to advisory
AND lets the user manually open the panel after leaving advisory.
The derived-value approach stores `rawIsOpen=true` while on advisory
(if the user clicked "open panel" on the advisory page somehow), then
displays the panel as soon as they leave advisory — contradicting the
"panel auto-closes when navigating to advisory" UX intent.

**Fix:** The right pattern is the SECOND option in the analysis —
fold the constraint into `setIsOpen`:

```tsx
const setIsOpen = useCallback(
  (next: boolean) => {
    setRawIsOpen(isAdvisoryPage ? false : next);
  },
  [isAdvisoryPage],
);
```

Add an effect (or `useEffect` semantically equivalent) that also
clamps `rawIsOpen` to `false` on route change to advisory (which
remains a synchronization, not invariant — set-state-in-effect lint
WILL fire). The cleanest fix is the action-driven one: every place
that calls `setIsOpen` becomes route-aware. That requires reading
EVERY consumer of `setIsOpen` from the grep, not just the context
file.

**Lands in:** Shard 1 (revise fix); abstraction-consumers.md applies
— grep all `setIsOpen` callers in `apps/web/src/`.

---

### F8 — HIGH — `AdvisoryPanel:88` `showHistory` derive-during-render changes UX

**Where:** Shard 1,
`apps/web/src/components/advisory-panel/AdvisoryPanel.tsx` line 88.

**Claim under test:** Analysis says "Recommended: Derive during
render — `showHistory = isOpen && historyOpen`. If product wants the
toggle to reset, attach the reset to the `handleScrimClick` /
`close()` callsite within the same component instead of an effect."

**Failure mode:** Currently, `historyOpen` is forcibly `false` when
`isOpen` flips false. With derive-during-render, `historyOpen`
**stays true** internally — only the displayed state is `false`.
When the user reopens the panel, `historyOpen` is still `true`, so
the panel shows the history list immediately. The current behavior
RESETS history when the panel closes — user reopens to a fresh
state.

This is a real UX semantic difference. Whichever is intended, it must
be documented. If the current "reset on close" is intentional, the
fix MUST be the action-driven version — wire the reset into
`handleScrimClick` and the `Esc` key handler and any other path that
flips `isOpen` to false.

**Fix:** Treat as a Category C "fold into action" not "derive in
render". Read all `isOpen=false` callers (likely 2-3:
`handleScrimClick`, an `Esc` handler, the context's `close()`),
attach `setHistoryOpen(false)` to each. Verify that NO future caller
of `setIsOpen(false)` gets added without resetting history — file a
spec entry to document.

**Lands in:** Shard 1; spec needs a new antipattern entry (see F15).

---

### F9 — HIGH — No regression test gates the 6 fetch-on-mount migrations

**Where:** Shard 2 acceptance.

**Claim under test:** Plan says "Each migrated page renders
identically against `arbor.aitelab.net` API (manual playwright check
OR existing E2E run)".

**Failure mode:** Per the brief's success criterion 4 ("No regression
in production behavior") AND the project-level rule
`testing.md` § "End-to-End Pipeline Regression Above Unit +
Integration", every migrated user-visible flow MUST have an E2E
regression that exercises the doc-canonical path with real infra.

The current E2E suite at `apps/web/tests/e2e/` (per file inventory in
03-type-safety) has at least: `00-route-intercept-verify`,
`04-advisory-chat`, `05-calculators`, plus auth helpers. NONE of
these enumerated cover:

- analytics/page.tsx (6 fetches)
- dashboard/page.tsx (2 fetches)
- documents list + preview (2 fetches)
- signup invite-validation flow
- EmployeePicker as embedded in any larger flow

"Manual playwright check" is not a verification mechanism that
survives session boundaries. "Existing E2E run" is an empty set
relative to the migrated paths.

This is **release-blocking under brief criterion 4**, even though
the brief itself says "production at v0.4.9 is stable; this work is
not user-facing or release-blocking" — that phrasing applies to the
LINT cleanup BUT the migration is a behavioral change (cache layer
introduced), not a syntactic one.

**Fix:** Add to Shard 2 acceptance: "For each of the 6 migrated
pages, add a Tier-2 or Tier-3 regression test (Playwright spec OR a
Vitest+MSW component test) that:

1. Stubs the API endpoint to return canned fixture data
2. Mounts the page (or the relevant component)
3. Asserts the rendered output matches a stable snapshot OR contains
   the expected user-visible text

These tests live at `apps/web/tests/regression/test_migration_*.spec.ts`.
They are net-new — and yes, that expands the workspace beyond
'just lint cleanup'. Brief criterion 4 demands it; if the user
disagrees, file an explicit deferral with the user's ack."

**Lands in:** Shard 2 acceptance + (if user accepts deferral) journal
the override per `zero-tolerance.md` Rule 1 exception protocol.

---

### F10 — HIGH — Type E "lost wiring" investigations need product judgment outside this workstream

**Where:** Shard 4, 9 Type E violations.

**Claim under test:** Plan says "(c) genuinely planned-but-not-yet-
built → leave with `// eslint-disable-next-line` + tracking issue".

**Failure mode:** The brief explicitly states (constraint 16): "the
canonical pattern for data fetching ... is TanStack Query, not
workaround-suppressed". Adding `// eslint-disable` here for "planned
but not built" features is exactly the workaround the brief forbids.
Worse: 9 Type E cases include real product gaps (`URGENCY_TIMEFRAMES`
not rendered, `messageId` not threaded to feedback callback,
`onOpenHistory` button never wired). Each is a feature that was
half-built and shipped with the variable defined but the UI gone.

Restoring the wiring is a PRODUCT DECISION that lives outside the
lint workstream's scope. The plan offers (a) delete or (b) restore,
but no escape hatch for "this is a real product gap that needs
discovery."

**Fix:** Treat Shard 4 as a triage step that PRODUCES a list of
real product gaps, not a step that resolves them. Each Type E case
with "lost wiring" gets:

- Filed as a separate GitHub issue against the project
- Tracking-issue link recorded
- The variable is DELETED in this workstream (with a comment
  pointing to the tracking issue) — that closes the lint
  warning without doing the product work.

The workstream's success criterion adapts to: "all 9 Type E warnings
resolved by either deletion-with-tracking-issue OR restore-wiring,
human-approved". Get the user's approval at end of Shard 1 (before
Shard 4 begins) on the triage list.

**Lands in:** Shard 4 spec; brief addendum (or workspace journal
note that the user accepts the trade-off).

---

### F11 — HIGH — `staleTime` defaults are not grounded; `useTemplates` at 30s creates UX regression

**Where:** Shard 2, `useTemplates` hook;
`apps/web/src/app/(dashboard)/documents/page.tsx`.

**Claim under test:** Plan picks `staleTime: 30s` for documents list.

**Failure mode (concrete user flow):**

1. User on documents page, sees template list (cache: 30s stale time).
2. User uploads new template (mutation).
3. The proposed `useCreateTemplate` mutation calls
   `queryClient.invalidateQueries({queryKey: ["documents",
"templates"]})` on success → list refetches. ✓ Fine.

But:

1. User on documents page, sees template list.
2. User navigates to `/documents/[id]/preview/...` to look at template detail.
3. User goes back to documents list within 30s.
4. List displays from cache — fine, expected behavior.

But:

1. User on a DIFFERENT page (say, `/dashboard`).
2. Admin in another tab uploads a template via API.
3. User navigates to `/documents`. `useTemplates` was either
   never-mounted OR mounted-then-unmounted, so it has no cached data
   — refetches fresh. ✓ Fine.

Now consider the NEGATIVE scenario the plan's `staleTime` enables but
doesn't flag:

1. User on documents page, sees template list with 5 items.
2. Admin (different session) DELETES a template.
3. User-still-on-page within 30s — template list still shows 5
   items, including the deleted one.
4. User clicks deleted template → preview page renders → API returns
   404 → preview page error.

This is "graceful failure" but it's strictly worse than the current
behavior (current code refetches on every mount, so the user sees a
fresh list every time they navigate to /documents).

This is the **first concrete UX regression** caused by Shard 2's
caching layer. Same concern applies to ALL 6 migrated pages, not just
documents.

**Fix:** For each of the 6 migrations:

1. Identify mutations that CHANGE the data shape (create, update,
   delete) — these MUST invalidate the query.
2. Identify external mutators (other admin sessions, scheduled jobs,
   webhooks) — for those, the fresh-on-mount property is lost.
   `staleTime: 0` (refetch on every mount) preserves current behavior;
   anything > 0 introduces some staleness.

Decision per page: pick `staleTime: 0` for documents list (preserves
current behavior, you only gain the cache benefits during in-flight
requests and on window-focus refetch); pick higher staleTime for
data that does NOT change via external mutators.

Document the per-page choice in the spec
`frontend-data-fetching.md` § staleTime defaults — currently it's a
generic table, not a per-domain decision.

**Lands in:** Shard 2 (per-hook config); spec revision.

---

### F12 — HIGH — `setReportLoading(...)` calls dangle if quartet state is naively deleted

**Where:** Shard 3 (Type D analytics dead vars).

**Claim under test:** Plan says "All 4 Type D genuine-dead variables
... if Type E investigation concludes 'drop, don't render'".

**Failure mode:** Look at lines 380-419 of `analytics/page.tsx`
(per the analysis excerpt). The effect calls `.finally(() => set...
Loading(false))` for each of the 6 fetches. Deleting
`reportLoading` state hook (line 369) without ALSO removing the
`setReportLoading(false)` call inside the `.finally(...)` produces a
TS error: `setReportLoading is not defined`. Or, if the setter is
also removed, the trailing `.finally(...)` fires nothing.

The Type D delete-the-state-hook fix is non-trivial — it requires
walking the full effect's `.then/.catch/.finally` chain and removing
the setter call from each. The plan rates this as "Real code review
per file" but does NOT explicitly enumerate the cascade.

**Fix:** F4 already proposes Shard 2's full rewrite supersedes
Shard 3's Type D work on this file. Confirm: the rewrite REPLACES
the entire effect with 6 `useQuery` calls, eliminating ALL of:
`reportLoading`, `metricsError`, `feedbackError`, `reportError`,
`setReportLoading`, `setMetricsError`, etc. — these become
`reportQ.isLoading`, `metricsQ.error`, etc. Type D fix is
instantaneous via the rewrite. Confirm this in the plan and remove
the Shard 3 line item for the analytics quartet.

**Lands in:** Plan revision (move analytics Type D quartet from
Shard 3 to Shard 2 as a side-effect of the rewrite).

---

### F13 — HIGH — `useInviteValidation` `staleTime: Infinity` is unsafe with token rotation

**Where:** Shard 2, `useInviteValidation` hook on `signup/page.tsx`.

**Claim under test:** Plan picks `staleTime: Infinity` ("Token is
single-use; never revalidate while page is mounted").

**Failure mode:** "Single-use" is a property of the SUCCESSFUL flow,
NOT the page-mount lifecycle. Consider:

1. User clicks invite link, lands on signup page → `validateInvite(token)`
   resolves with `status: "valid"`.
2. User abandons signup, leaves tab open.
3. Admin (or token-rotation policy) revokes/rotates the token within
   the same tab session.
4. User comes back, `staleTime: Infinity` means TanStack Query NEVER
   revalidates → user attempts signup with a now-invalid token →
   server returns 4xx on the actual signup mutation → user sees a
   confusing error.

The current code re-runs the effect on `[token]` change but NOT on
re-mount; so the current behavior also has this gap, technically. But
TanStack Query's `staleTime: Infinity` makes it WORSE: with default
React-Query configs, even `refetchOnWindowFocus: true` is a no-op
when `staleTime: Infinity`. Currently, no refetch on focus; previously,
also no refetch on focus. So behavior is approximately equivalent —
but the plan calls out `refetchOnWindowFocus: true` for analytics
hooks. Inconsistency.

The bigger semantic risk: React StrictMode in development double-fires
effects, including queryFn. With `staleTime: Infinity`, the second
fire has NO effect (cached); the first fire's `cancelled` flag in
the original code actively prevents the stale result. With
TanStack, the AbortController-aware queryFn handles this, but only
if the implementation passes `signal` through to `validateInvite`
(currently not — the analysis snippet shows `queryFn: () => validateInvite(token!)`).

**Fix:** Pick `staleTime: 0, gcTime: 60_000, retry: false,
refetchOnWindowFocus: false`. Token validation results are cheap to
recompute and the freshness matters. Document the rationale in the
hook file (1-line comment) and in the spec.

**Lands in:** Shard 2 (hook config); spec revision.

---

### F14 — MED — Shard 1 file count is undercounted

**Where:** Plan says "Files touched: ~16 files".

**Claim under test:** Counting from the plan's own bullets:

- 3 lazy-init (AppShell, AdvisoryPanelContext, useObservation) — 3 files
- 2 derive-or-action (AdvisoryPanelContext, AdvisoryPanel) — overlap
- 3 form-reset (employees/[id]/page.tsx) — 1 file
- 1 cooldown (PaceCard) — 1 file
- 3 exhaustive-deps (advisory/history, alerts ×2) — 2 files
- 1 eslint-disable removal (PaceCard) — overlap
- 29 Type A dead imports — 29 files (or fewer, with multi-import-per-
  file dedup)
- 2 Type B catch (my-profile, auth.helper) — 2 files
- 4 Type C required params (3 formatPeriod + 1 useProfile) — 3 files
  (formatPeriod is in 3 different files)
- 1 eslint config tweak — 1 file
- 2 unescaped entities (CompanySetupModal) — 1 file
- 1 module variable rename (ArborResult) — 1 file
- 1 a11y (TopBar + SearchResults plumbing) — 2 files

Unique file count is at least ~35-45, not 16. The "~150 LOC delta"
is plausible for total LOC but is a poor proxy for "agent attention"
(per `rules/autonomous-execution.md` § "Per-Session Capacity Budget").
Shard 1 is DESCRIBED as mechanical but the breadth of files alone
exceeds the "≤500 LOC of load-bearing logic" threshold by structural
file-count alone, even though total LOC is small.

**Why this matters:** Shard 1 is more like a stamping operation
across 35+ files. That's still tractable for one session — it's
boilerplate per `autonomous-execution.md` Rule 2 ("differentiated
sizing") — but the plan's rating "1 session" is correct only if the
agent uses a feedback loop (`pre-commit` + `npx eslint . | wc -l`)
between sub-batches.

**Fix:** Add to Shard 1 acceptance: "after every 5-file batch, run
`npx eslint . 2>&1 | tail -5` and confirm the error/warning count
moves monotonically toward zero. If a fix introduces a NEW error
(e.g., `clearAll` no longer setting insights), the lint count goes
UP — abort that file's edit, diagnose, retry."

**Lands in:** Shard 1 acceptance (process discipline note).

---

### F15 — MED — Spec antipattern coverage gap: cascading setState in updater

**Where:** `specs/react-hooks-correctness.md` § Antipatterns.

**Claim under test:** Spec lists 6 antipatterns. The
`useObservation:230` violation is classified as Category F (other) by
the analysis, with a fix ("compute insights via `useMemo`"). But the
ROOT-CAUSE pattern — `setOther(...)` called inside a `setSelf(updater
=> ...)` callback — is not in the spec's 6 antipatterns.

**Fix:** Add antipattern 7 to `react-hooks-correctness.md`:

````markdown
### 7. setState cascade inside updater (`react-hooks/set-state-in-effect`)

```tsx
setVisits((prev) => {
  const updated = [...prev, newVisit];
  setInsights(generateInsights(updated)); // ← cascading setState
  return updated;
});
```
````

**Why wrong:** Two sources of truth. `insights` is a function of
`visits`; storing it as separate state means a render where one
exists without the other.

**Fix:** Derive via `useMemo`:

```tsx
const insights = useMemo(() => generateInsights(visits), [visits]);
```

````

**Lands in:** Spec revision (Shard 5).

---

### F16 — MED — Spec antipattern coverage gap: `react-hooks/immutability`

**Where:** `specs/react-hooks-correctness.md` § 5.

**Claim under test:** Spec antipattern 5 ("Direct mutation of state")
covers `data.sort()` (mutating a prop). The
`analytics/page.tsx:122` violation is `accumulated += pct` — mutation
of a CLOSURE variable inside `.map()`, not state. Different mechanism,
same lint rule. The current spec antipattern 5 doesn't cover the
closure-mutation case.

**Fix:** Extend spec antipattern 5 to two sub-cases:

```markdown
### 5. Direct mutation in render (`react-hooks/immutability`)

#### 5a. Mutation of a state/prop array

```tsx
data.sort();   // mutates parent's array
````

**Fix:** `[...data].sort()`.

#### 5b. Mutation of a closure variable inside a render-time iteration

```tsx
let accumulated = 0;
const segments = items.map((item) => {
  accumulated += pct;   // ← mutation across iterations
  return ...;
});
```

**Fix:** Rewrite as `reduce` returning the accumulator:

```tsx
const { segments } = items.reduce<{accumulated: number; segments: string[]}>(
  (acc, item) => ({
    accumulated: acc.accumulated + pct,
    segments: [...acc.segments, ...],
  }),
  { accumulated: 0, segments: [] },
);
```

````

**Lands in:** Spec revision (Shard 5).

---

### F17 — MED — Spec antipattern coverage gap: `data?.X ?? []` instability

**Where:** `specs/react-hooks-correctness.md` § Exhaustive deps.

**Claim under test:** Three lint findings (advisory/history:230,
alerts:156 ×2) all share the same shape: `const xs = data?.X ?? []`
used as a `useMemo` dep. The current spec entry on exhaustive-deps
covers "the dep is a new object/array on every render" → "wrap in
`useMemo`", but doesn't call out the TanStack-Query-specific gotcha
that `data?.X` is stable WHEN data exists but allocates fresh during
loading.

**Fix:** Add to spec § Exhaustive deps:

```markdown
**TanStack Query specific gotcha**: `data?.X ?? []` is unstable
during the loading phase (`data === undefined`) because the `??
[]` fallback allocates fresh `[]` per render. Wrap once:

```tsx
const xs = useMemo(() => data?.X ?? [], [data?.X]);
````

OR inline the fallback in the consuming `useMemo`:

```tsx
const filtered = useMemo(() => filter(data?.X ?? []), [data?.X, ...]);
```

```

**Lands in:** Spec revision (Shard 5).

---

### F18 — MED — Brief criterion 4 has no concrete acceptance test

**Where:** Brief at `briefs/01-shard-d-brief.md` line 49: "No
regression in production behavior — every changed page/component
verified to render and behave identically."

**Claim under test:** Plan offloads verification to "manual playwright
check OR existing E2E run".

**Failure mode:** "Verified to render and behave identically" is the
strongest acceptance criterion in the brief. The plan provides no
mechanism to satisfy it — the existing E2E suite does NOT cover the
6 migrated pages (per F9). "Manual playwright check" is unreliable
across session boundaries.

**Fix:** Already covered in F9. Cross-reference the F9 fix and explicitly
mark brief criterion 4 as the contract.

**Lands in:** Brief→plan traceability table in `specs/_index.md`
should explicitly link criterion 4 to the F9-mandated regression
suite.

---

### F19 — MED — Eslint config tweak might be a no-op

**Where:** Shard 1, `apps/web/eslint.config.mjs` (or wherever).

**Claim under test:** Plan adds `argsIgnorePattern: "^_"` to the
config.

**Failure mode:** The 03-type-safety-cleanup analysis says (line
295): "verify `eslint.config.*` `argsIgnorePattern: "^_"` is set; if
so, the warning is a misconfig. If not, add it." The plan
unconditionally adds it without verifying current state. If the
config already has it, the change is a no-op AND the
`prism-advisory-adapter:85` warning persists despite the `_data`
prefix — meaning the warning is from a different rule entirely
(maybe `caughtErrorsIgnorePattern` or `varsIgnorePattern`).

**Fix:** Shard 1 step 0: read `apps/web/eslint.config.mjs`, identify
the EXACT rule firing on `_data: AdvisoryStreamStartEvent`, decide
whether `argsIgnorePattern` is the right knob. If the rule is the
default `@typescript-eslint/no-unused-vars` and the pattern IS already
present, the underlying issue is something else (line-numbering
quirk, or a different lint rule reporting via the same message).

**Lands in:** Shard 1 task list (preflight check).

---

### F20 — MED — `react-hooks/exhaustive-deps` findings sit on files Shard 2 rewrites

**Where:** Shard 1, lines on `advisory/history/page.tsx:230` and
`alerts/page.tsx:156`.

**Claim under test:** Plan puts 3 exhaustive-deps fixes in Shard 1.

**Failure mode:** Both files use `data?.X ?? []`, and the `data` is
returned from a TanStack Query hook (`useConversationList`,
`useAlerts`). Shard 2 might reshape these hook signatures (e.g.,
adding new fields to the return object, changing the cache key
shape). If Shard 1's `useMemo` wrap lands first and Shard 2 doesn't
revisit, the wrap survives unchanged — fine. If Shard 2 changes the
hook to return a transformed array directly (e.g., `data` →
`alerts`), Shard 1's wrap is now wrong.

**Fix:** Confirm Shard 2 does NOT reshape these two hooks (the lint
errors are NOT in the Cat A migration list — they're already
TanStack-Query-based). Adversarial check passes: the wrap is fine.
Document this overlap in plan to prevent future agent confusion.

**Lands in:** Plan revision (note that Shard 1 + Shard 2 do NOT
collide on these two hook files).

---

### F21 — MED — `useInviteValidation` preserves keyword-sniffing inside `useMemo`

**Where:** Shard 2, `useInviteValidation` design pattern.

**Claim under test:** Analysis says: "The page maps
`query.error?.status` + `query.error?.message` to the existing
`InviteState` discriminated union via `useMemo([query.error,
query.data, token])` — pure, no `setState`. The error-message
keyword sniffing (`expired` / `already been used`) stays in the
mapping function."

**Failure mode:** Per `agent-reasoning.md` (LLM-first rule), keyword-
sniffing on error messages is structurally a brittle pattern — but
this rule scopes to AGENT decisions, not UI error rendering. So
agent-reasoning.md doesn't apply.

What DOES apply: the brief constraint to "address root causes (not
suppress rules)". The keyword sniffing on `error.message` is a
brittle root cause — the backend should return a structured error
code, not human-readable text. Migrating to TanStack Query is a good
moment to also surface `error.code` (e.g., `INVITE_EXPIRED`,
`INVITE_USED`) and remove the keyword match.

**Fix:** Shard 2's `useInviteValidation` rewrite is an OK place to
introduce a structured error-code mapping IF the backend already
returns one. If not, file an issue against the backend; do NOT pass
this as a recurring brittle-pattern fix in the lint workstream.
Either way, document in the hook's docstring that the keyword-sniff
is a temporary bridge.

**Lands in:** Shard 2 (hook implementation note).

---

### F22 — MED — "Tests green" acceptance is underspecified

**Where:** Plan acceptance criteria of every shard.

**Claim under test:** Plan says `npm run test -- --run` for tests.

**Failure mode:** `apps/web` has Vitest (component tests) AND
Playwright (E2E). `npm run test -- --run` likely covers Vitest only.
A passing Vitest run does NOT verify E2E behavior; per F9, E2E is
where the migration regression risk lives.

**Fix:** Per shard, define which test layers must run:

- Shard 1 mechanical: Vitest unit only — fine.
- Shard 2 fetch migration: Vitest + Playwright (the migrated pages'
  flows). If Playwright spec is missing for a page, Shard 2 task
  list adds the spec FIRST (before the migration) so a baseline-
  green spec exists; THEN migrates; THEN re-runs the spec.
- Shard 3 type reconciliation: Vitest + `tsc --noEmit` (already
  noted).
- Shard 4 wiring: Vitest + Playwright for any wired UI element.
- Shard 5 final: full suite.

**Lands in:** Plan revision (per-shard test-layer matrix).

---

### F23 — LOW — Spec ambiguity on `useDashboard.ts`

**Where:** `specs/frontend-data-fetching.md` line 42: "useDashboard.ts
← NEW (or reuse if exists)".

**Claim under test:** "(or reuse if exists)" leaves discovery to the
agent.

**Fix:** Spec revision: do the discovery now. Run `find apps/web/src
-name "useDashboard*"`, document the result, prescribe one path. If
none exists, say "create new". If one exists, say "extend that file".

**Lands in:** Spec revision (Shard 5).

---

### F24 — LOW — `key={employee.id}` lesson should be codified

**Where:** Shard 5 `/codify` step.

**Claim under test:** Plan's Shard 5 says "Codify findings into
`.claude/skills/project/` as appropriate".

**Failure mode:** F1 above shows `key={employee.id}` is NOT obviously
correct for refetch-driven flows. The lesson "form-reset on prop
change → use `key=<field that changes per save>`, not just
`<id>`" is reusable knowledge.

**Fix:** Codify as a workspace-local skill (or an addendum to the
spec antipattern 4) explicitly. Add a "DO / DO NOT" example showing
the refetch pitfall.

**Lands in:** Shard 5 codify; `react-hooks-correctness.md` antipattern
4 addendum.

---

### F25 — LOW — Brief traceability claims criterion 1 "is not a spec"

**Where:** `specs/_index.md` Brief traceability table.

**Claim under test:** Table row 1: "`npx eslint .` exits 0/0 →
(Implementation plan acceptance criteria; not a spec)".

**Failure mode:** The "0/0 lint" outcome IS a contract — it's the
brief's #1 success criterion. Saying "not a spec" technically holds
under `specs-authority.md` (specs describe WHAT the system is, not
process gates), but the absence of a CI rule that enforces 0/0 means
the next agent can re-introduce a lint failure with no structural
defense.

**Fix:** Add a CI gate (`apps/web/.github/workflows/lint.yml` or the
existing one) that fails on `npx eslint .` exit-non-zero. The plan
already mentions this in Shard 5 step 5; reinforce it as a
structural defense, not just a "verify existing".

**Lands in:** Shard 5 (CI gate verification + add if missing).

---

## Coverage check — every brief criterion to plan section

| Brief criterion                                                     | Plan section / acceptance                                                                        | Gap                |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------ |
| 1. `npx eslint .` exits 0 errors + 0 warnings                       | Shard 5 step 1                                                                                   | F25 (CI gate)      |
| 2. No `// eslint-disable-*` added                                   | Shard 1 (removes one); Shard 4 has a (c) carveout                                                | F10 (Shard 4 carveout violates brief; revise) |
| 3. `specs/frontend-data-fetching.md` exists                         | `specs/frontend-data-fetching.md` written                                                        | F11/F13/F15-17/F23 |
| 4. No regression in production behavior                              | Shard 2 acceptance: "manual playwright check OR existing E2E run"                                | F9, F18            |

Three of four criteria have unresolved gaps.

---

## Risk register completeness

Plan R1-R4 covers:

- R1 — TanStack Query stale-time defaults change behavior (partial — F11/F13 expand)
- R2 — Type reconciliation cascades (covered)
- R3 — Type E lost wiring might be intentional (partial — F10 expands)
- R4 — Worktree merge conflicts on `types/api.ts` (wrong — F3/F4 show the collision is broader)

**Missing risks** (recommend adding R5-R8):

- **R5** — Behavioral regression for the 6 fetch-on-mount migrations
  has no E2E gate (F9, F18).
- **R6** — Action-driven fixes for Pattern C (F7, F8) require
  enumerating ALL upstream callers via grep, not just the file
  containing the effect. Per `abstraction-consumers.md`.
- **R7** — Lazy-init lessons interact with mutation handlers
  (`setEnabled`, `setIsOpen`, `clearAll`) in ways the plan does not
  enumerate (F5).
- **R8** — Eslint config preflight: the proposed
  `argsIgnorePattern` may already exist; the underlying lint may be
  reporting from a different rule (F19).

---

## Plan implementability from cold-start

The plan is mostly implementable from cold-start, but several
sections are vague enough that the next session would need to
re-derive the analysis:

- "(3 more — see § no-explicit-any)" in Shard 3 (line 116) — concrete
  list is in `03-type-safety-and-cleanup.md`, but the plan should
  enumerate inline OR reference by file:line. **MED**.
- "(2 more — see § Type E …)" in Shard 4 (line 140) — same issue. **MED**.
- "extend if exists" in Shard 2 (line 81) for `useAuth.ts`. **LOW**
  (covered by F23).
- "use existing dashboard hook OR new `useDashboard.ts`" in Shard 2
  (line 82). **LOW** (covered by F23).

These are not stubs in the strict zero-tolerance sense — they're
references to other documents — but they reduce the plan's standalone
implementability.

---

## Summary recommendations to the parent agent

1. **CRIT/HIGH must-fix before Shard 1 starts:**
   - F1 (`key=` choice — verify refetch path before settling on `id`)
   - F5 (lazy-init `useObservation` interacts with `setEnabled` callback)
   - F6 (`PaceCard` cooldown semantics — verify `isDangerous` stability)
   - F7/F8 (`AdvisoryPanelContext`/`AdvisoryPanel` action-driven fix
     requires consumer enumeration)
   - F19 (eslint config preflight)

2. **HIGH must-fix before Shard 2 starts:**
   - F2 (`onRetry` shape adapter)
   - F3/F4 (file-collision matrix replaces R4)
   - F9 (regression suite for migrated pages)
   - F11 (per-page `staleTime` decision)
   - F13 (`useInviteValidation` config)

3. **HIGH must-fix before Shard 4 starts:**
   - F10 (Type E triage produces tracking-issue list, not silent
     `// eslint-disable`)

4. **MED — fix-as-you-go**: F12, F14, F15-F17, F18, F20, F21, F22.

5. **LOW — defer to `/codify`**: F23, F24, F25.

After Shard 1 lands, recommend re-red-teaming with the actual
applied diff to catch any new collisions Shard 2/3/4 introduce —
this round is plan-level only.
```
