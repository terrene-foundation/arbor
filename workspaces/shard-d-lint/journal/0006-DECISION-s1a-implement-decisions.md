---
type: DECISION
date: 2026-05-09
created_at: 2026-05-09T00:00:00Z
author: agent
session_id: shard-d-implement-s1a
session_turn: 12
project: shard-d-lint
topic: S1a implementation decisions — react-hooks fixes across 9 files
phase: implement
tags:
  [shard-d, implement, react-hooks, set-state-in-effect, useSyncExternalStore]
---

# S1a /implement decisions — load-bearing react-hooks fixes

## What

S1a implemented across 6 commits on branch `feat/shard-d-s1a-investigations`. Lint delta: 31→19 errors (-12), 52→48 warnings (-4). All S1a-owned violations resolved per matrix; remaining 19 errors belong to S1b/S2/S3.

## Five decisions made during implementation

### 1. AppShell hydration: `useSyncExternalStore` for the mounted boundary

The pre-existing pattern was `useState(false)` + `useEffect(() => setMounted(true), [])` to gate the skeleton flash. Both `setCollapsed(stored)` AND `setMounted(true)` triggered the lint rule. Tried multiple alternatives:

- Lazy-init `collapsed` with SSR guard — handled the localStorage read; lint clean for that line.
- Keep `setMounted(true)` effect — STILL triggered the rule on a literal-true setter.
- Add eslint-disable — would consume the structurally-inapplicable budget.

Picked `useSyncExternalStore` with `getServerSnapshot=()=>false`, `getClientSnapshot=()=>true`. React's canonical SSR-safe primitive that does NOT require a setState-in-effect. UX preserved (skeleton on SSR + first client render, full UI post-hydration).

### 2. AdvisoryPanelContext F7: structurally-inapplicable disable + tracking issue

The auto-close-on-route-change effect was retained as-is with an eslint-disable on the inner `setIsOpen(false)`. Action-driven alternatives (deriving `isOpen = rawIsOpen && !isAdvisoryPage`) were verified to regress the "panel does not snap back open when leaving advisory" UX per redteam F7. The route-sync effect is the rule's documented "subscribe to external system" exception. Tracking issue filed at [terrene-foundation/arbor#33](https://github.com/terrene-foundation/arbor/issues/33).

### 3. AdvisoryPanel F8: action-driven `closeAndResetHistory` callback

All three close paths (scrim click, Escape key, header onClose button) are local to AdvisoryPanel. Wrapped in a single `closeAndResetHistory` useCallback that does `setHistoryOpen(false); close();`. No effect needed; no eslint-disable.

### 4. PaceCard F6: lazy-init based on isDangerous, no remount-arming effect

Verified PaceCard mounts fresh per shadow response via CommandSurface line 550 (`{shadowResponse?.type === "preview" && ... && <PaceCard />}`). Each new response causes a remount, so `isDangerous` is stable per mount. Lazy-init `state` and `cooldownRemaining` from `isDangerous` is sufficient; no need for the additional `useEffect(() => { /* re-arm */ }, [isDangerous])` the redteam mentioned as a contingency.

### 5. employees/[id] F1: `key={employee.updated_at ?? employee.id}`

Confirmed via grep: `employee` is `useState<EmployeeDetail | null>(null)` with `setEmployee(data)` after each `fetchEmployee()`. After save, `onSaved={fetchEmployee}` produces a new employee reference. `key={employee.id}` would NOT remount (id unchanged across saves); `key={employee.updated_at}` does (DataFlow auto-managed timestamp). Required adding optional `updated_at?: string` to the EmployeeDetail interface — backend already returns it, frontend type just hadn't declared it. Fallback to `employee.id` for theoretical undefined case.

## Surprising discovery: `react-hooks/purity` fires inside `useMemo`

Initial purity-fix attempt for the `Date.now()` call at line 308 of employees/[id]/page.tsx was to wrap in `useMemo([employee.work_pass_expiry])`. The lint rule fired anyway — it tracks impure operations in `useMemo`/`useEffect`/`useCallback` bodies, not just render bodies. Pivoted to `useState(() => Date.now())` which captures time once at mount; the captured value is treated as pure for the component lifetime. Trade-off: minute-level staleness across long sessions, acceptable for an HR "days remaining" badge.

## Why this matters

The `react-hooks/set-state-in-effect` rule (React 19 experimental) is more aggressive than the analysis doc anticipated. Not every Cat B/Cat F pattern has a clean lint-free fix; some require structurally-inapplicable disables. This is documented in S5's spec landing (react-hooks-correctness.md addenda) and the issue #33 tracker.

## Consequences

- S1a PR ready for admin-merge to main.
- S1b/S2/S3/S4 can launch parallel worktrees once S1a merges.
- Issue #33 tracks 2 disable sites for future investigation.
- The spec at S5 (react-hooks-correctness.md) needs an antipattern entry for "lint-rule-exception use cases" so future agents know which patterns need disables vs which have clean fixes.

## For Discussion

1. The `useSyncExternalStore` AppShell pattern is one of multiple valid SSR-safe lazy-hydration approaches (alongside `next/dynamic({ ssr: false })`, `<Suspense>`, and cookie-based SSR). Should the spec landing in S5 codify ONE canonical pattern for project-wide consistency, or document each with use-case guidance?
2. Counterfactual: if `react-hooks/purity` had NOT flagged `Date.now()` inside `useMemo`, the wraps would have been the canonical fix and the spec would have documented `useMemo([dep])` as the impurity-isolation pattern. The actual decision (`useState(() => Date.now())`) is mount-stable, not dep-stable. Are there other pure-but-impure-input cases (`Math.random()`, `crypto.randomUUID()`, performance.now()) where the same pattern applies, or does each case need bespoke handling?
3. The 2 structurally-inapplicable eslint-disables (issue #33) both involve `pathname` as the external system. The `react-hooks/set-state-in-effect` rule docs explicitly support "subscribe to external system" — yet the rule fires on these patterns. Is this a rule-implementation gap (the rule's regex doesn't recognize `usePathname()` as an external subscription) that upstream should fix, or is the documentation aspirational and the rule is intentionally strict? Worth investigating before S5 codifies the workaround.

## Origin

S1a /implement session 2026-05-09. Branch `feat/shard-d-s1a-investigations`. Commits: dc75525, 1be95f1, 7954713, e14012e, 0b11a86, 1da7bd3.
