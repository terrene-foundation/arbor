# S5 — Shard 5: Final verification + spec landing + CI gate + codify

**Status**: ACTIVE
**Shard**: 5 of 5 (final, after S1+S2+S3+S4 merge)
**Plan**: `workspaces/shard-d-lint/02-plans/02-implementation-plan-v2.md` § Shard 5
**Implements**: all four brief criteria (0/0 lint, no eslint-disable, canonical pattern documented, no regression) — structurally enforced
**Dependencies**: S1, S2, S3, S4 merged
**Estimated effort**: <0.5 autonomous session

## What to do

Verify the lint-clean state across the full repo, land the workspace specs with redteam-derived addenda (F11/F13/F15/F16/F17/F23/F24), prove the CI gate (F25) prevents future regressions, codify the canonical pattern into project skills (`.claude/skills/project/`).

## Acceptance Criteria

### 5.1 Final lint check (brief criterion 1)

- [ ] `cd apps/web && npx eslint . 2>&1 | tail -3` — exits 0 with `0 errors, 0 warnings`.
- [ ] `grep -rn "eslint-disable" apps/web/src/` — count delta from pre-shard baseline is ≤ 0 (brief criterion 2: no NEW disables; existing acceptable disables that the shards intentionally removed are reflected in the count).

### 5.2 Build + tests (brief criterion 4 final pass)

- [ ] `npx tsc --noEmit` clean.
- [ ] `npm run test -- --run` green (Vitest unit + the regression suite added in S2).
- [ ] `npx playwright test tests/` green (Tier-3 incl. any Playwright-tier migration regression specs).
- [ ] `npm run build` green.
- [ ] **Live-staging smoke (FT6)**: load each of the 6 migrated pages against `arbor.aitelab.net` (production = staging — single env per project memory). For each page, observe DevTools network panel: confirm one fresh fetch on first navigation, then one cache-hit on back-navigation within the staleTime window (or fresh fetch if `staleTime: 0`). This independently exercises real backend behavior NOT covered by S2's stubbed regression suite.

### 5.3 CI gate verification (F25)

- [ ] Identify the existing GitHub Actions workflow that runs `npx eslint .` on `apps/web` (likely `.github/workflows/lint-web.yml` or equivalent). Confirm it FAILS the job on non-zero eslint exit.
- [ ] If absent, ADD the gate. The workflow MUST run on `pull_request` against `main` AND on `push` to `main`.
- [ ] Test the gate by intentionally introducing a lint error on a throwaway branch, pushing, observing CI red. Revert. Document in commit body.

### 5.4 Spec landing (brief criterion 3)

Per `rules/specs-authority.md` Rule 1, the canonical home for project specs is **project-root `specs/`** (which exists with `_index.md`, `k8s-staging-resilience.md`, `load-testing.md`, `production-hardening.md`). Workspace specs at `workspaces/shard-d-lint/specs/` were the working draft during /analyze; S5 promotes them to the project-root canonical home (FT3).

- [ ] Promote `workspaces/shard-d-lint/specs/frontend-data-fetching.md` → **`specs/frontend-data-fetching.md`** (project root). Replace the generic staleTime table with the per-hook decisions from S2 § 2.3 (F11). Resolve the `useDashboard.ts` ambiguity per F23 (specify "create new" or "extend `<existing-file>`").
- [ ] Promote `workspaces/shard-d-lint/specs/react-hooks-correctness.md` → **`specs/react-hooks-correctness.md`** (project root). Append:
  - Antipattern 7 (cascading setState in updater, F15): the `useObservation:230` pattern.
  - Antipattern 5b (closure mutation in `.map()`, F16): the `accumulated += pct` pattern → `reduce` rewrite.
  - Exhaustive-deps TanStack Query gotcha (F17): `data?.X ?? []` instability during loading; `useMemo([data?.X])` wrap.
  - Antipattern 4 addendum on `key=<field>` choice (F24): use `<updated_at>` not `<id>` for refetch-driven flows; include the F1 worked example.
- [ ] Update **`specs/_index.md`** (project root) to register both new spec files with one-line descriptions.
- [ ] Workspace specs at `workspaces/shard-d-lint/specs/` remain in place as the historical working draft (do NOT delete — they are the trail per `rules/specs-authority.md`).

### 5.5 Codify

- [ ] Create `.claude/skills/project/frontend-data-fetching.md` — project-level skill derived from the workspace spec. The workspace spec is the source; the project skill is the agent-facing reference (loaded via `/sdk` or specialist delegation).
- [ ] Update `.claude/skills/project/SKILL.md` index to reference the new skill.
- [ ] Optional: append the "key= choice for refetch flows" lesson to an existing project skill if a more specific home exists.

### 5.6 Acceptance gates

- [ ] All five sub-tasks (5.1–5.5) green.
- [ ] Workspace journal entry: `journal/NNNN-CONNECTION-shard-d-completion.md` summarizing the 4-criterion contract closure.
- [ ] Final commit on `main` (or merge PR) updates `.session-notes` to reflect Shard D closed.

## Files

- `apps/web/.github/workflows/lint-web.yml` (verify or create).
- `specs/frontend-data-fetching.md` (project root — promoted + finalized).
- `specs/react-hooks-correctness.md` (project root — promoted + finalized with 4 redteam addenda).
- `specs/_index.md` (project root — index entries added).
- `workspaces/shard-d-lint/specs/*.md` (workspace draft retained as trail).
- `.claude/skills/project/frontend-data-fetching.md` (new — codified).
- `.claude/skills/project/SKILL.md` (index update).

## Definition of Done

`npx eslint .` green-on-CI as a structural gate; specs landed with redteam addenda; project skill codified; brief criteria 1+2+3+4 all closed against the contract. Shard D workstream closed.
