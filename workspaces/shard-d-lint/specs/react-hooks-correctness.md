# React Hooks Correctness — Patterns and Antipatterns

## Authority

This spec defines when each React hook is appropriate. Lint rules `react-hooks/*` enforce these structurally; this spec explains the WHY so future agents pick the right pattern instead of suppressing the rule.

## Pattern selection (the 6 antipatterns + their fixes)

For each antipattern below, the rule that catches it is in parentheses, followed by the canonical replacement.

### 1. Fetch-on-mount with setState (`react-hooks/set-state-in-effect`)

`useEffect(() => { fetch().then(setState) }, [])` is the most common offender. Causes cascading renders + does not handle race conditions on remount.

**Fix**: Use TanStack Query — see `frontend-data-fetching.md`.

### 2. localStorage hydration with setState (`react-hooks/set-state-in-effect`)

```typescript
const [open, setOpen] = useState(false);
useEffect(() => {
  setOpen(localStorage.getItem(K) === "true");
}, []);
```

**Fix**: Lazy `useState` initializer — runs once, no extra render:

```typescript
const [open, setOpen] = useState(
  () => typeof window !== "undefined" && localStorage.getItem(K) === "true",
);
```

### 3. Derived-state setState (`react-hooks/set-state-in-effect`)

```typescript
const [filtered, setFiltered] = useState<T[]>([]);
useEffect(() => { setFiltered(items.filter(...)); }, [items]);
```

**Fix**: Compute in render. If expensive, wrap in `useMemo`:

```typescript
const filtered = useMemo(() => items.filter(...), [items]);
```

### 4. Form-reset on prop change (`react-hooks/set-state-in-effect`)

```typescript
useEffect(() => {
  setName(employee.name);
  setEmail(employee.email);
  setPhone(employee.phone);
  // ... 12 more setState calls
}, [employee.id]);
```

This is "I want fresh state when the resource changes." The React-idiomatic fix is **key remounting**:

```tsx
// Parent
<EmployeeForm key={employee.id} employee={employee} />;

// EmployeeForm
const [name, setName] = useState(employee.name); // initialized once per mount
```

When `employee.id` changes, React unmounts + remounts the form, giving you fresh local state automatically.

**Pitfall — `key={resource.id}` vs `key={resource.updated_at}` (F24).** If the parent refetches the SAME resource (e.g., after save, via TanStack Query invalidation), the `id` does NOT change — so `key={resource.id}` does NOT remount. The component continues to see the new `resource` object with stale local state. If the original effect's intent was "reset form on refetch" (common after save), use a field that DOES change per refetch:

```tsx
<EmployeeForm
  key={`${employee.id}-${employee.updated_at}`}
  employee={employee}
/>
```

Pick `key=` based on what you want to remount on. `id` alone = remount on navigation between resources. `updated_at` (or version, etag) = remount on every server change. Combine them when both apply.

### 5. Direct mutation in render (`react-hooks/immutability`)

#### 5a. Mutation of a state/prop array

```typescript
function MyChart({ data }) {
  data.sort();  // mutates the parent's array
  return <Chart values={data} />;
}
```

**Fix**: Copy before mutating:

```typescript
const sorted = useMemo(() => [...data].sort(), [data]);
```

#### 5b. Mutation of a closure variable inside a render-time iteration (F16)

```tsx
let accumulated = 0;
const segments = items.map((item) => {
  accumulated += pct;   // ← mutation across iterations
  return { offset: accumulated, ... };
});
```

**Fix**: Rewrite as `reduce` returning the accumulator:

```tsx
const { segments } = items.reduce<{ accumulated: number; segments: Segment[] }>(
  (acc, item) => ({
    accumulated: acc.accumulated + pct,
    segments: [...acc.segments, { offset: acc.accumulated + pct, ... }],
  }),
  { accumulated: 0, segments: [] },
);
```

The lint rule fires because the closure variable is captured by render and mutated across iterations — a structural impurity. `reduce` makes the accumulation explicit and pure.

### 6. Impure render (`react-hooks/purity`)

```typescript
function Header() {
  return <span>Last seen: {Date.now()}</span>;  // re-renders inconsistently
}
```

**Fix**: Move impurity into an effect, ref, or pass as prop:

```typescript
const [now, setNow] = useState(() => Date.now());
useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
return <span>Last seen: {now}</span>;
```

### 7. Cascading setState inside an updater callback (`react-hooks/set-state-in-effect`) — F15

```tsx
setVisits((prev) => {
  const updated = [...prev, newVisit];
  setInsights(generateInsights(updated)); // ← cascading setState
  return updated;
});
```

**Why wrong**: Two sources of truth. `insights` is a function of `visits`; storing it as separate state means a render where one exists without the other (the "torn" state). The lint rule treats the inner `setInsights` as a synchronous setState during the outer setter, which IS structurally a setState during render-phase work.

**Fix**: Derive via `useMemo`:

```tsx
const insights = useMemo(() => generateInsights(visits), [visits]);

setVisits((prev) => [...prev, newVisit]); // single source of truth
```

If the derivation depends on a flag (e.g., `isEnabled`), include it in the deps AND short-circuit on `false`:

```tsx
const insights = useMemo(
  () => (isEnabled && visits.length >= 5 ? generateInsights(visits) : []),
  [visits, isEnabled],
);
```

After this change, audit ALL callsites that previously called the cascading `setInsights(...)` directly — they're now dead code (the memo recomputes from `[visits, isEnabled]`). Delete them.

## Subscriptions — when `useEffect` IS the right tool

`useEffect` is for synchronizing with external (non-React) systems. Examples that are correct:

```typescript
// External event source
useEffect(() => {
  const sub = source.subscribe(setData);
  return () => sub.unsubscribe();
}, [source]);

// Browser API
useEffect(() => {
  const handler = () => setSize(window.innerWidth);
  window.addEventListener("resize", handler);
  return () => window.removeEventListener("resize", handler);
}, []);

// Imperative DOM manipulation that refs can't express
useEffect(() => {
  containerRef.current?.scrollIntoView({ behavior: "smooth" });
}, [activeId]);
```

For window/document subscriptions in particular, prefer `useSyncExternalStore` when the subscription drives state used during render — it's safer for concurrent rendering.

## Exhaustive deps (`react-hooks/exhaustive-deps`)

This rule catches `useEffect(() => { ... }, [])` blocks that close over values from outside the dep array. The canonical fix is: **add the missing dep**.

If adding the dep causes an infinite loop, the deeper issue is usually:

- The dep is a new object/array on every render → wrap in `useMemo` or hoist out of component
- The dep is a function defined in render → wrap in `useCallback` or hoist out
- The effect shouldn't be running at all → reconsider whether it's the right pattern (see antipatterns above)

**Never** suppress with `// eslint-disable-next-line react-hooks/exhaustive-deps`. The rule is structurally checking for stale closures, which produce silent bugs at runtime.

**TanStack-Query specific gotcha (F17)**: `data?.X ?? []` is unstable during the loading phase (`data === undefined`) because the `?? []` fallback allocates a fresh `[]` on every render. Wrap the access once before passing it to dependent hooks:

```tsx
// DO — stable across loading + loaded states
const items = useMemo(() => data?.items ?? [], [data?.items]);
const filtered = useMemo(() => items.filter(...), [items]);

// DO NOT — fresh array each render → exhaustive-deps lint + cache thrash
const filtered = useMemo(() => (data?.items ?? []).filter(...), [data?.items]);
//                                ^^^^^^^^^^^^^^^^^ allocates new [] when data === undefined
```

The same gotcha applies to `useEffect`, `useCallback`, and any other hook that depends on the array. Wrap-once-at-the-source eliminates the entire class of finding.

## When `// eslint-disable` IS acceptable

Per `rules/zero-tolerance.md` Rule 3, suppression is permitted ONLY when:

1. The rule is structurally inapplicable (e.g., `// eslint-disable-next-line react-hooks/rules-of-hooks` inside a story-only `decorator` that satisfies React conventions but the lint rule can't see it)
2. AND a tracking issue is filed for the underlying API/tooling gap
3. AND the comment includes the issue URL

Acceptable example:

```typescript
// eslint-disable-next-line react-hooks/exhaustive-deps -- ref pattern; tracking #NNN
useEffect(() => {
  setupRef(ref);
}, []);
```

BLOCKED examples (and what to do instead):

- "I'll fix it later" → fix it now
- "The dep would cause an infinite loop" → see § Exhaustive deps above; the loop is a symptom, not the cause
- "It works in practice" → fragile to refactor; hold the invariant structurally

## Detection grep for /redteam

```bash
# Antipattern 1+2+3+4: setState inside useEffect
grep -rE "useEffect\([^)]*\{[^}]*set[A-Z]" apps/web/src/

# Antipattern 5: array mutation in render
grep -rnE "\.(sort|push|pop|shift|unshift|splice|reverse)\(" apps/web/src/ \
  | grep -v "useEffect\|useCallback\|useMemo\|onClick\|onSubmit"

# Antipattern 6: impure during render
grep -rE "(Date\.now|Math\.random)\(\)" apps/web/src/ | grep -v "useEffect\|useState\|useMemo\|useCallback"

# Eslint-disables sneaking in
grep -rn "eslint-disable.*react-hooks" apps/web/src/
```

Hits should be reviewed against this spec; legitimate cases get a comment + tracking issue, illegitimate cases get refactored.
