# Shard D Specs Index

Workspace-local domain specifications for the Shard D lint cleanup.

| File                         | Domain   | Description                                                                                                                                                           |
| ---------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `frontend-data-fetching.md`  | Frontend | Canonical TanStack Query pattern: hook location, queryKey conventions, per-hook staleTime decision protocol (no generic defaults), when `useEffect+setState` is wrong |
| `react-hooks-correctness.md` | Frontend | 7 antipatterns + when `useEffect` IS the right tool; `key=` choice for refetch flows; TanStack-Query `data?.X ?? []` exhaustive-deps gotcha                           |

## Brief traceability

Brief at `briefs/01-shard-d-brief.md`:

| Brief requirement                                                           | Spec section / contract                                                                                                                                                         |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npx eslint .` exits 0/0                                                    | Plan v2 § Shard 5 acceptance + § 5.3 CI gate (F25) — the lint-clean state is structurally enforced in CI, not just a one-shot check                                             |
| No `// eslint-disable-*` added                                              | `react-hooks-correctness.md` § "When eslint-disable IS acceptable" + plan v2 § Shard 4 (F10 — Type E triage produces tracking issues + deletions, never silent suppression)     |
| Canonical fetch-state-render pattern documented                             | `frontend-data-fetching.md` (full) + project-level codify at `.claude/skills/project/frontend-data-fetching.md` (Shard 5 § 5.5)                                                 |
| TanStack Query is the canonical pattern, not raw `useEffect+fetch+setState` | `frontend-data-fetching.md` § "Pattern selection decision tree" + `react-hooks-correctness.md` antipattern 1                                                                    |
| No production behavior regression                                           | Plan v2 § Shard 2.5 mandates Tier-2 + Tier-3 regression tests at `apps/web/tests/regression/test_migration_<page>.spec.ts` per migrated page (F9, F18) — no "manual check" gate |
