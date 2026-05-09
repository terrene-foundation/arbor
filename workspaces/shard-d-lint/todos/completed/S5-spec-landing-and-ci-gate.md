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

## Verification

### Final lint state

| Stage             | Errors | Warnings |
|-------------------|--------|----------|
| Pre-S5 (post-S4)  | 0      | 1        |
| **S5 final**      | **0**  | **0**    |

Brief criterion 1 met: `npx eslint .` exits 0/0.

### Cumulative Shard D delta

| Shard | Errors removed | Warnings removed | Status |
|-------|---------------|------------------|--------|
| S1a   | 12            | 4                | ✅ Merged (PR #34) |
| S1b   | 1             | 26               | ✅ Merged (PR #35) |
| S2    | 6             | 6                | ✅ Merged (PR #37) |
| S3    | 12            | 3                | ✅ Merged (PR #38) |
| S4    | 0             | 12               | ✅ Merged (PR #41) |
| S5    | 0             | 1                | This PR |
| **Total** | **31** | **52** | 31→0 errors, 52→0 warnings |

### Acceptance gates

- [x] `npx eslint .` → 0 errors / 0 warnings (brief criterion 1)
- [x] `npx tsc --noEmit` clean
- [x] `npm run test -- --run` → 17 files / 84 tests passing
- [x] `npm run build` → Compiled successfully in 2.5s
- [x] CI gate added: `.github/workflows/lint-web.yml` runs `npx eslint . --max-warnings 0` + `npx tsc --noEmit` on every PR + push-to-main (brief criterion 1 structurally enforced — F25)

### Spec landing (brief criterion 3)

Workspace specs promoted to project-root `specs/`:
- `specs/frontend-data-fetching.md` (241 lines) — canonical TanStack Query patterns + per-hook staleTime decisions
- `specs/react-hooks-correctness.md` (261 lines) — 7 antipatterns + when useEffect IS the right tool
- `specs/_index.md` updated with both entries

Workspace drafts at `workspaces/shard-d-lint/specs/` retained as historical trail per `rules/specs-authority.md`.

### Codify

- `.claude/skills/project/frontend-data-fetching.md` (~140 lines) — agent-facing project skill pointing to specs
- `.claude/skills/project/SKILL.md` updated with new "Frontend (apps/web)" section

### Brief criteria — all 4 closed

| # | Criterion | Status | Reference |
|---|-----------|--------|-----------|
| 1 | `npx eslint .` exits 0/0 | ✅ | S5.1 + CI gate (F25) |
| 2 | No `// eslint-disable-*` added EXCEPT structurally inapplicable + tracking issue | ✅ | 2 disables (issue #33), all other shards 0 disables |
| 3 | `specs/frontend-data-fetching.md` exists | ✅ | Promoted to project root in S5.4 |
| 4 | No regression in production behavior | ✅ | S2 regression suite (6 specs / 30 tests) + S4 restored-UI tests (6 specs / 11 tests) + S3 type cascade tsc-verified |

### Tracking issues filed across Shard D

- [#33](https://github.com/terrene-foundation/arbor/issues/33) — 2 structurally-inapplicable react-hooks disables (S1a)
- [#36](https://github.com/terrene-foundation/arbor/issues/36) — Backend structured `error.code` for invite-validation (S2 F21)
- [#39](https://github.com/terrene-foundation/arbor/issues/39) — `ReportDef.adminOnly` field (S4)
- [#40](https://github.com/terrene-foundation/arbor/issues/40) — `messageId` backend schema (S4)

**Closed:** 2026-05-09. Shard D workstream complete.
