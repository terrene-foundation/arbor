---
name: frontend-data-fetching
description: Canonical TanStack Query patterns for apps/web. Use when adding/migrating fetch logic — per-hook staleTime decisions, key= for refetch flows, when useEffect+setState is wrong.
---

# Frontend Data Fetching (Arbor apps/web)

The canonical fetch-state-render pattern is **TanStack Query** (`@tanstack/react-query`). Hand-rolled `useEffect+fetch+setState` is the failure mode this skill prevents.

**Source of truth**: `specs/frontend-data-fetching.md` + `specs/react-hooks-correctness.md`. This skill is a project-facing pointer; read the specs for full contract.

## Pattern selection decision tree

```
Need to fetch data on mount?
├── Yes → useQuery (with per-hook staleTime per below)
├── User-triggered mutation? → useMutation + queryClient.invalidateQueries
└── Subscribe to external event (route, storage)? → useSyncExternalStore (NOT useEffect+setState)
```

## Hook location convention

- All hooks live at `apps/web/src/hooks/api/use<Domain>.ts`
- One file per domain (existing examples: `useAdvisory.ts`, `useDocuments.ts`, `useAlerts.ts`).
- Export `<domain>Keys` object with `all` + scoped keys (e.g., `documents.all`, `documents.template(id)`).
- Service layer at `apps/web/src/services/api/<domain>.ts` is the data-access boundary; hooks call services, NOT raw `fetch`.

## Per-hook staleTime decision protocol

Per-hook decision per `specs/frontend-data-fetching.md` § "Per-hook staleTime decisions" (mandatory; no generic defaults):

| Use case                                    | staleTime | refetchOnWindowFocus | retry | Rationale                                                            |
| ------------------------------------------- | --------- | -------------------- | ----- | -------------------------------------------------------------------- |
| External-mutator-prone (admin can delete)   | 0         | true                 | def   | User-clickable items must reflect server truth on every nav          |
| Aggregate dashboards / summaries            | 30_000    | true                 | def   | Staleness window acceptable                                          |
| Profile data, config (rarely changes)       | 60_000    | true                 | def   | Session-stable                                                       |
| Computed/expensive server-side reports      | 300_000   | false                | def   | Refresh-on-focus would be costly                                     |
| Single-use tokens (invite, reset, etc.)     | 0         | false                | false | Token rotation is real; `Infinity` is unsafe; don't retry on 4xx    |

**Document the staleTime rationale as a 1-line comment in the hook file.**

## `key=<field>` for refetch-driven form remount

When a form syncs to server state via post-save refetch (TanStack Query refetch produces a NEW reference), use the **field that changes per save** — not `id`:

```tsx
// DO — remounts on save
<PersonalTab key={employee.updated_at ?? employee.id} employee={employee} ... />

// DO NOT — id is stable across saves; remount never fires
<PersonalTab key={employee.id} employee={employee} ... />
```

DataFlow auto-managed timestamps (`updated_at`) are the canonical refetch-key field. See `specs/react-hooks-correctness.md` antipattern 4.

## When `useEffect` IS the right tool

The lint rule `react-hooks/set-state-in-effect` aggressively flags setState-in-effect. Acceptable cases:

- **Lazy-init from storage** (Cat B): use `useState(() => readFromStorage())` initializer, NOT post-mount effect.
- **Hydration boundary**: use `useSyncExternalStore` with `getServerSnapshot=()=>false`, `getClientSnapshot=()=>true`. Avoid `useEffect(() => setMounted(true), [])`.
- **Subscribe to external system** (route, storage event, websocket): the rule's documented exception. Add `// eslint-disable-next-line react-hooks/set-state-in-effect` with justification + tracking issue.

## Mutations with cache invalidation

```tsx
const queryClient = useQueryClient();

useMutation({
  mutationFn: (data) => api.create(data),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: domainKeys.all });
  },
});
```

DO NOT `setState` in `onSuccess` to update local cache; let the query refetch via invalidation.

## Common antipatterns (see `specs/react-hooks-correctness.md` for the full 7)

1. **Fetch-on-mount with `useEffect+setState`** → use `useQuery` (Cat A migration).
2. **`data?.X ?? []` in `useMemo` deps** allocates fresh `[]` per render → wrap in own `useMemo([data?.X])`.
3. **Cascading `setState` inside an updater** → derive via `useMemo`, drop the inner setter.
4. **`Date.now()` in render** → `useState(() => Date.now())` mount-capture (lint rule `react-hooks/purity`).
5. **Closure mutation in `.map()`** (`accumulated += pct`) → `reduce` accumulator pattern.

## Tracking

Issue [terrene-foundation/arbor#33](https://github.com/terrene-foundation/arbor/issues/33) — 2 structurally-inapplicable `react-hooks/set-state-in-effect` disables for pathname-as-external-system pattern.

## Origin

Codified from Shard D lint cleanup workstream (S5, 2026-05-09). Cumulative S1a–S5: 31 errors / 52 warnings → 0 / 0. Workspace: `workspaces/shard-d-lint/`.
