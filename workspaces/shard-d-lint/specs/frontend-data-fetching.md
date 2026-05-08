# Frontend Data Fetching — Canonical Pattern

## Authority

This spec is the canonical pattern for fetching, caching, and mutating server state in `apps/web/`. Every page, component, or hook that reads from or writes to the backend MUST follow this pattern. Workarounds (raw `fetch` in `useEffect`, hand-rolled `loading/error/data` triplets) are BLOCKED — they are the exact antipattern Shard D was opened to remove.

## TL;DR

- **Read server state**: `useQuery` from `@tanstack/react-query`
- **Write server state**: `useMutation` from `@tanstack/react-query`
- **Hooks live at**: `apps/web/src/hooks/api/<domain>.ts`
- **Reference implementations**: `useAdvisoryHistory.ts`, `useAlerts.ts`

## Pattern selection decision tree

```
Are you reading from or writing to the backend?
├─ NO  → Don't use TanStack Query. Use:
│        - `useState` for local UI state (open/closed, hover, form fields before submit)
│        - `useReducer` for complex local state machines
│        - `useSyncExternalStore` for non-React subscriptions (window resize, etc.)
│        - Lazy `useState` initializer for one-time localStorage hydration
│
└─ YES → Use TanStack Query.
    ├─ Reading        → useQuery
    ├─ Writing        → useMutation (+ invalidate affected queries on success)
    ├─ Pagination     → useInfiniteQuery
    └─ Optimistic UI  → useMutation with onMutate / onSuccess / onError
```

## Where hooks live

```
apps/web/src/
├── hooks/
│   ├── useAdvisoryHistory.ts        ← legacy location (single-file pattern)
│   └── api/                          ← canonical location (one file per domain)
│       ├── useAlerts.ts              ← reference: read + invalidate-on-mutate
│       ├── useDocuments.ts           ← extend here for documents domain
│       ├── useEmployees.ts           ← NEW
│       ├── useAnalytics.ts           ← NEW
│       ├── useDashboard.ts           ← VERIFY via `find apps/web/src -name "useDashboard*"` BEFORE creating; if not found, create new
│       ├── useAuth.ts                ← NEW (signup-specific lookups)
│       ├── useProfile.ts             ← exists
│       └── ...
└── services/
    └── api/
        ├── alerts.ts                 ← raw fetch wrappers — used BY hooks, never directly by components
        ├── documents.ts
        └── ...
```

**Rule**: components import from `hooks/api/`, never from `services/api/`. The `services/` layer is the wire-format adapter; the `hooks/` layer is the React-aware cache + lifecycle.

## queryKey conventions

```typescript
// Single resource
queryKey: ["employee", employeeId];

// List with filters
queryKey: ["employees", { active: true, department: "engineering" }];

// Nested resource
queryKey: ["employee", employeeId, "documents"];

// Domain root (used for blanket invalidation)
queryKey: ["employees"];
```

Conventions:

- First element is the domain noun, lowercase, plural for lists, singular for single-item.
- Filters / params come as a single object element (TanStack Query stable-stringifies it for cache keying).
- Nested resources extend the parent key to enable selective invalidation (`queryClient.invalidateQueries({ queryKey: ["employee", id] })` invalidates the resource AND all nested children).

## staleTime decisions — per-hook, not generic

`staleTime` is the cache duration during which the data is treated as "fresh" — within this window, no background refetch happens on mount or window focus. **The right value depends on whether the data has external mutators** (other admin sessions, scheduled jobs, webhooks). If yes, any non-zero `staleTime` introduces a window where the user sees stale data. The decision is per-hook, not generic.

### Decision protocol

1. **Identify external mutators** for the data:
   - YES (admin tabs, scheduled jobs, webhooks, other users in the same tenant) → start at `staleTime: 0`. The cache only de-dupes in-flight requests; users see fresh data on every navigation.
   - NO (data only changes via the current user's actions) → pick from the rate-of-change table below.

2. **Identify mutation hooks** for the same domain. Every mutation (create/update/delete) MUST `queryClient.invalidateQueries({ queryKey: [domain] })` on success. Without invalidation, even `staleTime: 0` won't refresh the list view until the next mount.

3. **Identify token-rotated / revocable resources** (OAuth tokens, invite tokens, signed URLs). NEVER use `staleTime: Infinity` here — the validity of the cached result decays independently of your render lifecycle. Use `staleTime: 0, refetchOnWindowFocus: false, retry: false` (a failed validation is a real failure, not a transient).

### Reference values when external mutators are absent

```typescript
// User-edit-driven (changes when user acts; mutation hooks invalidate)
staleTime: 30 * 1000; // 30s — alerts feed, notifications

// Profile-shape (changes rarely; rarely externally mutated)
staleTime: 60 * 1000; // 60s — current-user profile

// Analytics / aggregates (computed server-side, expensive; refetch-on-focus disabled)
staleTime: 5 * 60 * 1000; // 5min, refetchOnWindowFocus: false

// Effectively static (lookup tables, enums; per-session population)
staleTime: Infinity; // ONLY for data that cannot change within a session
// NEVER for tokens, signed URLs, or anything revocable
```

### Anti-defaults (Shard D-discovered failure modes)

- **`staleTime: 30_000` for shared lists** (documents the user can navigate to, click on, and see 404 if another admin deleted it). Use `staleTime: 0` for any list whose items are user-clickable and can be externally deleted. Origin: redteam Round 1 finding F11.
- **`staleTime: Infinity` for anything revocable** — invite tokens, OAuth grants, signed URLs. The token can be invalidated server-side independently of your render lifecycle. Origin: redteam Round 1 finding F13.

## Mutation pattern

```typescript
export function useDeleteDocument() {
  const queryClient = useQueryClient();
  return useMutation<DeleteResponse, Error, number>({
    mutationFn: (id) => documentsApi.delete(id),
    onSuccess: (_data, id) => {
      // Invalidate list views
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      // Optimistically remove from any single-document caches
      queryClient.removeQueries({ queryKey: ["document", id] });
    },
  });
}
```

## What MUST NOT be done

### Antipattern A: fetch-on-mount with hand-rolled state

```typescript
// BLOCKED — this is exactly the lint error react-hooks/set-state-in-effect catches
const [data, setData] = useState<Foo[]>([]);
const [loading, setLoading] = useState(true);
const [error, setError] = useState<Error | null>(null);

useEffect(() => {
  fetch("/api/foo")
    .then((r) => r.json())
    .then((d) => {
      setData(d);
      setLoading(false);
    })
    .catch((e) => {
      setError(e);
      setLoading(false);
    });
}, []);
```

**Replacement**:

```typescript
const { data = [], isLoading, error } = useFoo();
```

### Antipattern B: useEffect + setState for derived data

```typescript
// BLOCKED — derived state should be computed in render, not effect
const [filtered, setFiltered] = useState<Foo[]>([]);
useEffect(() => {
  setFiltered(items.filter((i) => i.active));
}, [items]);
```

**Replacement**:

```typescript
const filtered = useMemo(() => items.filter((i) => i.active), [items]);
// Or, if cheap, just inline the filter in JSX
```

### Antipattern C: useEffect + setState for localStorage hydration

```typescript
// BLOCKED — runs on every mount, triggers extra render
const [open, setOpen] = useState(false);
useEffect(() => {
  const stored = localStorage.getItem(KEY);
  if (stored !== null) setOpen(stored === "true");
}, []);
```

**Replacement (lazy initializer)**:

```typescript
const [open, setOpen] = useState(() => {
  if (typeof window === "undefined") return false; // SSR-safe
  return localStorage.getItem(KEY) === "true";
});
```

### Antipattern D: useMutation without invalidation

```typescript
// BLOCKED — list view stays stale after mutation
const mutation = useMutation({ mutationFn: createFoo });
// No onSuccess → next time user views the list, they see old data
```

**Replacement**:

```typescript
const queryClient = useQueryClient();
const mutation = useMutation({
  mutationFn: createFoo,
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ["foos"] }),
});
```

## When `useEffect` IS appropriate

Per [React docs](https://react.dev/learn/you-might-not-need-an-effect), `useEffect` is for **synchronizing with external systems**:

- Subscribing to a non-React event source (WebSocket, EventSource, `window.addEventListener`)
- Returning a cleanup function that the runtime guarantees will fire on unmount
- Imperative DOM manipulation (focus, scroll into view) when refs aren't sufficient
- Logging / analytics on mount (call once, no setState)

If your effect calls `setState`, ask: "could this be computed in render, in a query hook, in an event handler, or in a lazy initializer?" If yes, it's an antipattern; refactor.

## Migration checklist (when converting an existing fetch-on-mount)

1. Identify the endpoint in `services/api/<domain>.ts` (or add it).
2. Add a hook to `hooks/api/<domain>.ts` with `useQuery({ queryKey, queryFn })`.
3. Pick `staleTime` per the defaults table above.
4. In the component, replace the `useState + useEffect + fetch` block with `const { data, isLoading, error } = useDomain()`.
5. Adjust render: `if (isLoading)` / `if (error)` branches still apply (`isLoading` and `error` are now `query.isLoading` and `query.error`).
6. Verify the page renders identically against `arbor.aitelab.net`.
7. Run `npx eslint .` — the `react-hooks/set-state-in-effect` error for that file should be gone.

## Cross-references

- `apps/web/src/hooks/useAdvisoryHistory.ts` — reference: read pattern with `useQuery`
- `apps/web/src/hooks/api/useAlerts.ts` — reference: read + invalidate-on-mutate
- `rules/zero-tolerance.md` Rule 4 — no workarounds; fix root cause not symptom
- `rules/agent-reasoning.md` — frontend reasoning belongs in framework patterns, not hand-rolled
