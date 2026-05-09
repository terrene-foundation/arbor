# React Hooks Pattern Classification (20 errors)

Ground-truth classification of every `react-hooks/*` violation in `apps/web/src/`.
Source: `01-violation-inventory.md`. Lines re-read from the actual files (±20 lines).

## Categories

- **A. Fetch-on-mount** — `useEffect(() => { api.fetch().then(setState) }, [...])`. Migration target: TanStack Query (`useQuery`/`useMutation`).
- **B. Storage-hydration** — `useEffect(() => { setState(localStorage/sessionStorage.get(K)) }, [])`. Fix: lazy-initializer in `useState(() => …)` (SSR-safe via `typeof window`) or `useSyncExternalStore`.
- **C. Route/state-driven sync** — `useEffect(() => { if (cond) setOther(…) }, [cond])`. Fix: derive during render OR move the side effect into the action that mutated `cond`.
- **D. Derived state from props** — `useEffect(() => { setState(reset|deriveFrom(props)) }, [props])`. Fix: `useMemo` / compute inline / `key=` remount.
- **E. External-event subscription** — generally OK. Lint flags only when initial setState fires inside the same effect.
- **F. Other** — full file-specific description.

## Summary table

| File:line                                            | Rule                 | Category                                                                                         | Proposed fix                                                                                                                  |
| ---------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `app/(auth)/signup/page.tsx:534`                     | set-state-in-effect  | A (fetch-on-mount, conditional on token)                                                         | TanStack `useQuery({ enabled: !!token })` over `validateInvite`                                                               |
| `app/(dashboard)/analytics/page.tsx:122`             | immutability         | F (mutating `let accumulated` during render — ok semantically but fails lint's pure-render rule) | Convert imperative loop to `reduce` returning `{accumulated, segments}` array                                                 |
| `app/(dashboard)/analytics/page.tsx:400`             | set-state-in-effect  | A (5 parallel fetch-on-mount)                                                                    | 5 × `useQuery` (workforce, compliance, metrics, queryPatterns, feedbackSummary, monthlyReport)                                |
| `app/(dashboard)/dashboard/page.tsx:368`             | set-state-in-effect  | A (2 parallel fetch-on-mount)                                                                    | 2 × `useQuery` (compliance.status, admin.metrics)                                                                             |
| `app/(dashboard)/documents/[id]/preview/page.tsx:20` | set-state-in-effect  | A (fetch-on-mount keyed by URL param)                                                            | `useQuery({ queryKey: ['template', id], queryFn: () => documentsApi.getTemplate(id), enabled: !!id })`                        |
| `app/(dashboard)/documents/page.tsx:72`              | set-state-in-effect  | A (fetch-on-mount with manual refetch wrapper)                                                   | `useQuery` + `refetch` from query result instead of `fetchTemplates()` closure                                                |
| `app/(dashboard)/employees/[id]/page.tsx:302`        | purity               | F (`Date.now()` called during render)                                                            | Lift to `useMemo([employee.work_pass_expiry])` OR compute from a ref captured in `useEffect`                                  |
| `app/(dashboard)/employees/[id]/page.tsx:516`        | set-state-in-effect  | D (form reset on prop change) — PersonalTab                                                      | Use `key={employee.id}` on tab to remount, drop the effect                                                                    |
| `app/(dashboard)/employees/[id]/page.tsx:1334`       | set-state-in-effect  | D (form reset on prop change) — EmploymentTab                                                    | Same: `key={employee.id}` remount                                                                                             |
| `app/(dashboard)/employees/[id]/page.tsx:1885`       | set-state-in-effect  | D (form reset on prop change) — StatutoryTab                                                     | Same: `key={employee.id}` remount                                                                                             |
| `components/advisory-panel/AdvisoryPanel.tsx:88`     | set-state-in-effect  | C (close-history when panel closes)                                                              | Move `setHistoryOpen(false)` into the `close()` callback in `AdvisoryPanelContext` (action-driven, not effect-driven)         |
| `components/design-system/EmployeePicker.tsx:42`     | set-state-in-effect  | A (fetch-on-mount + select-by-value)                                                             | `useQuery({ queryKey: ['employees'], queryFn: () => employeesApi.list() })` + derive `selected` via `useMemo` from value+data |
| `components/shadow-agent/PaceCard.tsx:76`            | set-state-in-effect  | F (timer init: setting state to start a cooldown that the same effect drives)                    | Initialise `cooldownRemaining` lazily in `useState`; drop the in-effect `setState` and just run the interval                  |
| `components/shadow-agent/useObservation.ts:217`      | set-state-in-effect  | B (sessionStorage hydration on mount)                                                            | `useState(() => getStoredVisits())` + `useState(() => getEnabledState())` lazy initializers                                   |
| `components/shadow-agent/useObservation.ts:230`      | set-state-in-effect  | F (cascading setState: visit append + insight regeneration in the same path)                     | Compute insights via `useMemo([visits])`; effect only appends + persists                                                      |
| `components/shell/AppShell.tsx:23`                   | set-state-in-effect  | B (localStorage hydration on mount)                                                              | Lazy-init pattern; `useState(() => readCollapsedFromStorage())` guarded by `typeof window`                                    |
| `contexts/AdvisoryPanelContext.tsx:68`               | set-state-in-effect  | B (sessionStorage hydration on mount)                                                            | Lazy-init `useState(() => readActiveConvFromStorage())`                                                                       |
| `contexts/AdvisoryPanelContext.tsx:85`               | set-state-in-effect  | C (auto-close on advisory route)                                                                 | Set in `usePathname`-keyed `useMemo` for `isOpen` calc OR move into the `setActiveConversation` action when route changes     |
| `app/(dashboard)/advisory/history/page.tsx:230`      | exhaustive-deps      | F (`conversations = data?.conversations ?? []` reallocates each render)                          | Wrap `conversations` in a stable `useMemo([data])` OR inline `data?.conversations ?? []` inside the consuming `useMemo`       |
| `app/(dashboard)/alerts/page.tsx:156`                | exhaustive-deps (×2) | F (same `alerts = data?.alerts ?? []` pattern)                                                   | Wrap `alerts` in `useMemo([data])` so the two downstream `useMemo`s have stable deps                                          |

---

## Detailed analysis per file

### `apps/web/src/app/(auth)/signup/page.tsx:534`

**Code excerpt** (532-573):

```tsx
useEffect(() => {
  if (!token) {
    setInviteState({ status: "idle" });
    return;
  }

  let cancelled = false;

  async function validate() {
    try {
      const data = await validateInvite(token as string);
      if (!cancelled) setInviteState({ status: "valid", data });
    } catch (error: unknown) {
      /* … */
    }
  }

  validate();
  return () => {
    cancelled = true;
  };
}, [token]);
```

**Pattern**: A (Fetch-on-mount, conditional on `token` query-param). Plus a discriminated-union state machine with multiple error subtypes (`expired`, `already_used`, `invalid`, `network_error`).

**Why current code is wrong**: The effect both fires the fetch AND parses the error string client-side; the cancelled-flag pattern is a manual race-condition guard that TanStack Query already provides via its `AbortController`-aware `queryFn` and the `isFetching`/`status` machinery.

**Proposed fix**: Add an `useInviteValidation(token)` hook in `apps/web/src/hooks/api/useAuth.ts` (new file) following the `useAlerts.ts` pattern:

```ts
export const inviteKeys = {
  validate: (token: string) => ["invite", "validate", token] as const,
};

export function useInviteValidation(token: string | null) {
  return useQuery<InviteValidation, ApiRequestError>({
    queryKey: inviteKeys.validate(token ?? ""),
    queryFn: () => validateInvite(token!),
    enabled: !!token,
    retry: false, // 4xx errors are deterministic; do not retry
  });
}
```

The page maps `query.error?.status` + `query.error?.message` to the existing `InviteState` discriminated union via `useMemo([query.error, query.data, token])` — pure, no `setState`. The error-message keyword sniffing (`expired` / `already been used`) stays in the mapping function.

**Effort**: moderate. New hook file + 1-page rewrite. The error-mapping logic survives unchanged; only the wiring to `useState`/`useEffect` is replaced. ~30 LOC delta.

---

### `apps/web/src/app/(dashboard)/analytics/page.tsx:122` (immutability)

**Code excerpt** (117-125):

```tsx
// Build conic-gradient segments
let accumulated = 0;
const segments = items.map((item) => {
  const start = accumulated;
  const pct = (item.value / total) * 100;
  accumulated += pct; // ← mutates `let` after render commits
  return `${item.color} ${start}% ${accumulated}%`;
});
```

**Pattern**: F (mutation of a `let` variable inside a `.map()` callback during render). This is functionally pure (no observable side-effect outside the render) but the React compiler's static analysis correctly flags it because the mutation pattern is indistinguishable from genuine impurity.

**Why current code is wrong**: React 19's compiler / `react-hooks` plugin assumes render is referentially transparent. `accumulated += pct` mutates a closure variable across iterations; if React were ever to memoise the inner closure independently, the order of accumulation would break. The lint rule is structural — refactor to `reduce` makes the data flow explicit and survives any future memoisation.

**Proposed fix**:

```tsx
const { segments } = items.reduce<{ accumulated: number; segments: string[] }>(
  (acc, item) => {
    const start = acc.accumulated;
    const next = acc.accumulated + (item.value / total) * 100;
    return {
      accumulated: next,
      segments: [...acc.segments, `${item.color} ${start}% ${next}%`],
    };
  },
  { accumulated: 0, segments: [] },
);
```

**Effort**: trivial. Single 8-line refactor inside `DonutChart`.

---

### `apps/web/src/app/(dashboard)/analytics/page.tsx:400`

**Code excerpt** (380-419):

```tsx
useEffect(() => {
  const companyId = user?.company_id;

  if (companyId) {
    profileApi.workforce(companyId)
      .then((data) => setWorkforce(data))
      .catch(() => setWorkforceError("Unable to load workforce data right now."))
      .finally(() => setWorkforceLoading(false));

    complianceApi.status(companyId)
      .then((data) => setCompliance(data))
      .catch(() => setComplianceError("Unable to load compliance data right now."))
      .finally(() => setComplianceLoading(false));
  } else {
    setWorkforceLoading(false);
    setComplianceLoading(false);
  }

  adminApi.metrics().then((data) => setMetrics(data)).catch(...).finally(...);
  adminApi.queryPatterns().then(...).catch(...).finally(...);
  adminApi.feedbackSummary().then(...).catch(...).finally(...);
  adminApi.monthlyReport().then(...).catch(...).finally(...);
}, [user?.company_id]);
```

**Pattern**: A (six parallel fetch-on-mount calls). The component owns 6 × `data`, 6 × `loading`, 6 × `error` state — 18 useState hooks driven by one effect.

**Why current code is wrong**: Six independent network requests serialized through a single effect's lifecycle. No retry, no cache-sharing across pages, no automatic refetch on window focus, and 18 redundant `useState` declarations. Returning to the page within seconds re-fires every call.

**Proposed fix**: Six `useQuery` calls. Two of them (`workforce`, `compliance`) are gated by `companyId`; four are unconditional. Add to `apps/web/src/hooks/api/useAnalytics.ts` (new file) following the `useAlerts.ts` shape exactly:

```ts
export const analyticsKeys = {
  all: ["analytics"] as const,
  workforce: (companyId: number) =>
    [...analyticsKeys.all, "workforce", companyId] as const,
  compliance: (companyId: number) =>
    [...analyticsKeys.all, "compliance", companyId] as const,
  metrics: [...analyticsKeys.all, "metrics"] as const,
  queryPatterns: [...analyticsKeys.all, "queryPatterns"] as const,
  feedbackSummary: [...analyticsKeys.all, "feedbackSummary"] as const,
  monthlyReport: [...analyticsKeys.all, "monthlyReport"] as const,
};

export function useWorkforce(companyId: number | undefined) {
  return useQuery({
    queryKey: analyticsKeys.workforce(companyId ?? 0),
    queryFn: () => profileApi.workforce(companyId!),
    enabled: !!companyId,
  });
}

// …same shape for the other five
```

Page consumes them via `const workforceQ = useWorkforce(user?.company_id);` and reads `.data`, `.isLoading`, `.error` directly — eliminating 18 useState calls.

**Effort**: moderate. New hook file (~80 LOC) + page rewrite (deletes ~40 LOC of state, reshapes the JSX `loading`/`error` props). The endpoints already exist in `services/api/{profile,compliance,admin}.ts` — no backend work.

---

### `apps/web/src/app/(dashboard)/dashboard/page.tsx:368`

**Code excerpt** (366-388):

```tsx
useEffect(() => {
  if (!user?.company_id) {
    setComplianceLoading(false);
    setMetricsLoading(false);
    return;
  }

  complianceApi
    .status(user.company_id)
    .then((data) => setComplianceData(data))
    .catch(() =>
      setComplianceError("Unable to load compliance data right now."),
    )
    .finally(() => setComplianceLoading(false));

  adminApi
    .metrics()
    .then((data) => setMetricsData(data))
    .catch(() => setMetricsError("Unable to load platform metrics right now."))
    .finally(() => setMetricsLoading(false));
}, [user?.company_id]);
```

**Pattern**: A (two parallel fetch-on-mount). Subset of the analytics pattern.

**Why current code is wrong**: Same as analytics — uncached, no refetch-on-focus, redundant `useState` triplets.

**Proposed fix**: Reuse the `useWorkforce`/`useCompliance`/`useMetrics` hooks defined for analytics (above). Dashboard imports `useComplianceStatus(user?.company_id)` and `usePlatformMetrics()` from `hooks/api/useAnalytics.ts`. Cache-shared with analytics page — switching between them is instant.

**Effort**: trivial once the analytics hook file exists. ~10 LOC delta on the page.

---

### `apps/web/src/app/(dashboard)/documents/[id]/preview/page.tsx:20`

**Code excerpt** (18-35):

```tsx
useEffect(() => {
  if (!templateId || isNaN(templateId)) {
    setError("Invalid template ID");
    setLoading(false);
    return;
  }

  documentsApi
    .getTemplate(templateId)
    .then((t) => {
      setTemplate(t);
      setLoading(false);
    })
    .catch((err) => {
      setError(err.detail || "Failed to load template");
      setLoading(false);
    });
}, [templateId]);
```

**Pattern**: A (fetch-on-mount keyed by URL param).

**Proposed fix**: Add `useTemplate(id)` to `apps/web/src/hooks/api/useDocuments.ts` (extend the existing file):

```ts
export const documentKeys = {
  templates: { all: ["documents", "templates"] as const },
  template: (id: number) => ["documents", "template", id] as const,
};

export function useTemplate(templateId: number | undefined) {
  return useQuery<DocumentTemplate, Error>({
    queryKey: documentKeys.template(templateId ?? 0),
    queryFn: () => documentsApi.getTemplate(templateId!),
    enabled: !!templateId && !isNaN(templateId),
  });
}
```

Page becomes 3 lines: `const { data: template, isLoading, error } = useTemplate(templateId);`.

**Effort**: trivial. ~15 LOC hook + page rewrite.

---

### `apps/web/src/app/(dashboard)/documents/page.tsx:72`

**Code excerpt** (50-73):

```tsx
const fetchTemplates = () => {
  setLoading(true);
  setError(null);
  documentsApi
    .listTemplates()
    .then((data) => {
      setTemplates(data.templates);
    })
    .catch((err) => {
      setError(err instanceof Error ? err.message : "Failed to load templates");
    })
    .finally(() => {
      setLoading(false);
    });
};

useEffect(() => {
  fetchTemplates();
}, []);
```

**Pattern**: A (fetch-on-mount with manual refetch wrapper). The `fetchTemplates` closure exists so the user can re-fetch after creating/deleting a template.

**Proposed fix**: `useQuery` exposes `refetch()` natively. Add `useTemplates(category?)` to `useDocuments.ts`:

```ts
export function useTemplates(category?: string) {
  return useQuery<DocumentTemplateListResponse, Error>({
    queryKey: ["documents", "templates", { category }],
    queryFn: () => documentsApi.listTemplates(category),
  });
}
```

Page replaces `fetchTemplates()` callsites with `query.refetch()`. Mutation hooks (`useCreateTemplate`, `useDeleteTemplate`) call `queryClient.invalidateQueries({ queryKey: ["documents","templates"] })` — automatic refresh, no manual closure.

**Effort**: trivial-to-moderate (depends on whether create/delete mutations are also being migrated; if just the lint fix, trivial).

---

### `apps/web/src/app/(dashboard)/employees/[id]/page.tsx:302` (purity)

**Code excerpt** (299-304):

```tsx
const workPassExpiry = getExpiryBadge(employee.work_pass_expiry);
const workPassDaysLeft = employee.work_pass_expiry
  ? Math.ceil(
      (new Date(employee.work_pass_expiry).getTime() - Date.now()) / 86400000,
    )
  : null;
```

**Pattern**: F (impure call — `Date.now()` during render).

**Why current code is wrong**: `Date.now()` returns a different value every millisecond. React's compiler treats render as pure; calling `Date.now()` makes the render's output time-dependent, breaking memoisation and snapshot-test stability.

**Proposed fix**: Two viable options:

1. **`useMemo` with a stable input** — capture "now" once per mount via `const nowMs = useMemo(() => Date.now(), [])` (technically still impure but lint-acceptable because `useMemo` is the documented escape hatch for this pattern). Then `workPassDaysLeft = useMemo(() => calc(employee.work_pass_expiry, nowMs), [employee.work_pass_expiry, nowMs])`.
2. **Move to a derived helper invoked only at format-time** — render the date label, not the days-left number, and let CSS/JSX format it via `<RelativeTime value={employee.work_pass_expiry} />` that internally uses `useEffect` for ticking updates.

**Recommended**: Option 1 — minimal change, matches existing pattern in the codebase.

**Effort**: trivial.

---

### `apps/web/src/app/(dashboard)/employees/[id]/page.tsx:516` / `:1334` / `:1885`

**Code excerpt** (representative — same pattern in all three tabs):

```tsx
function PersonalTab({ employee, isAdmin, onSave, isSaving }: { … }) {
  const [form, setForm] = useState<Partial<EmployeeDetail>>({});
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    setForm({});
    setHasChanges(false);
  }, [employee]);
  // …
}
```

**Pattern**: D (Derived state from props — form reset on prop change). Three identical occurrences in `PersonalTab`, `EmploymentTab`, `StatutoryTab`.

**Why current code is wrong**: Resetting state when a prop changes is the textbook React anti-pattern. The `key` prop is the canonical fix: change the key, the component remounts, all `useState` defaults fire. No `useEffect` needed; no double-render.

**Proposed fix**: At the parent component (the page that renders the tabs), pass `key={employee.id}` to each tab:

```tsx
<PersonalTab key={employee.id} employee={employee} … />
<EmploymentTab key={employee.id} employee={employee} … />
<StatutoryTab key={employee.id} employee={employee} … />
```

Then delete the three `useEffect(() => { setForm({}); setHasChanges(false); }, [employee])` blocks. The remount semantics are identical to what the effect simulates, but cheaper and lint-clean.

**Effort**: trivial. 3 effects deleted, 3 `key=` props added at the call sites.

---

### `apps/web/src/components/advisory-panel/AdvisoryPanel.tsx:88`

**Code excerpt** (85-90):

```tsx
/* Close history when panel closes */
useEffect(() => {
  if (!isOpen) {
    setHistoryOpen(false);
  }
}, [isOpen]);
```

**Pattern**: C (Route/state-driven sync — close `historyOpen` when `isOpen` becomes false).

**Why current code is wrong**: `setHistoryOpen` is being driven by an upstream state change (`isOpen` from context). The action that flipped `isOpen` to `false` (the `close()` method on the context) should own this side effect. Effects driven by props are render-cycle-coupled and cascade.

**Proposed fix**: Two options:

1. **Action-driven**: Move `setHistoryOpen(false)` into the `close()` callback. But `historyOpen` lives in `AdvisoryPanel` not the context, so this requires lifting `historyOpen` to the context OR exposing a callback. Heavier refactor.
2. **Derive during render**: `const showHistory = isOpen && historyOpen;` — never render history when panel is closed; reset is implicit. The user's `setHistoryOpen(true)` call survives across panel-close/reopen but never displays while closed. If "reset on close" is genuinely desired, a `useRef` + action callback is cleaner than `useEffect`.

**Recommended**: Derive during render — `showHistory = isOpen && historyOpen`. If product wants the toggle to reset, attach the reset to the `handleScrimClick` / `close()` callsite within the same component instead of an effect.

**Effort**: trivial.

---

### `apps/web/src/components/design-system/EmployeePicker.tsx:42`

**Code excerpt** (39-64):

```tsx
useEffect(() => {
  let cancelled = false;
  setIsLoading(true);
  employeesApi
    .list()
    .then((data) => {
      if (!cancelled) {
        setEmployees(data.employees || []);
        if (value) {
          const match = (data.employees || []).find(
            (e: Employee) => e.id === value,
          );
          if (match) setSelected(match);
        }
        setIsLoading(false);
      }
    })
    .catch(() => {
      if (!cancelled) setIsLoading(false);
    });
  return () => {
    cancelled = true;
  };
}, [value]);
```

**Pattern**: A (fetch-on-mount + initial-selection sync). Two concerns conflated: fetching the list AND deriving the selected row from `value`.

**Why current code is wrong**: Effect re-fires every time `value` changes — re-fetching the entire employee list to look up the new selection in already-loaded data. Pure waste.

**Proposed fix**: Add `useEmployeeList()` to `apps/web/src/hooks/api/useEmployees.ts` (new file):

```ts
export function useEmployeeList() {
  return useQuery<EmployeeListResponse, Error>({
    queryKey: ["employees", "list"],
    queryFn: () => employeesApi.list(),
    staleTime: 5 * 60_000, // employee roster rarely changes
  });
}
```

Component then derives `selected` from `value` + `data` via `useMemo`:

```tsx
const { data, isLoading } = useEmployeeList();
const employees = data?.employees ?? [];
const selected = useMemo(
  () => employees.find((e) => e.id === value) ?? null,
  [employees, value],
);
```

The `selected` state hook is deleted entirely — it's pure derived data.

**Effort**: moderate. New hook file + EmployeePicker rewrite. ~20 LOC delta.

---

### `apps/web/src/components/shadow-agent/PaceCard.tsx:76`

**Code excerpt** (72-91):

```tsx
useEffect(() => {
  if (!isDangerous || state !== "preview") return;

  setState("cooldown");
  setCooldownRemaining(COOLDOWN_MS / 1000);

  const interval = setInterval(() => {
    setCooldownRemaining((prev) => {
      if (prev <= 1) {
        clearInterval(interval);
        setState("preview");
        return 0;
      }
      return prev - 1;
    });
  }, 1000);

  return () => clearInterval(interval);
}, [isDangerous]); // eslint-disable-line react-hooks/exhaustive-deps
```

**Pattern**: F (compound: state-machine init via `setState` + interval-driven `setState`). Already uses an `eslint-disable` for `exhaustive-deps` (which is a separate rule violation we should remove per Rule 4).

**Why current code is wrong**: The effect both fires the transition into `cooldown` AND ticks down the timer. The first two `setState` calls inside the effect are render-cascading; only the interval callback is genuinely async. Plus the `eslint-disable` masks the `state` dependency.

**Proposed fix**: Initialise the cooldown state shape via lazy `useState`, then run only the interval in the effect:

```tsx
const [state, setState] = useState<CardState>(
  isDangerous ? "cooldown" : "preview",
);
const [cooldownRemaining, setCooldownRemaining] = useState(
  isDangerous ? COOLDOWN_MS / 1000 : 0,
);

useEffect(() => {
  if (state !== "cooldown") return;
  const interval = setInterval(() => {
    setCooldownRemaining((prev) => {
      if (prev <= 1) {
        clearInterval(interval);
        setState("preview");
        return 0;
      }
      return prev - 1;
    });
  }, 1000);
  return () => clearInterval(interval);
}, [state]);
```

Now the effect's deps are honest (`[state]`), no `setState` fires inside the effect outside the timer callback (timer callbacks are async — exempt from the lint rule), and the `eslint-disable` is removed. Per Rule 4 (no workarounds), removing the disable is the goal.

**Effort**: trivial.

---

### `apps/web/src/components/shadow-agent/useObservation.ts:217`

**Code excerpt** (211-219):

```tsx
const [visits, setVisits] = useState<PageVisit[]>([]);
const [isEnabled, setIsEnabledState] = useState(true);
const [insights, setInsights] = useState<ObservationInsight[]>([]);

// Load initial state
useEffect(() => {
  setVisits(getStoredVisits());
  setIsEnabledState(getEnabledState());
}, []);
```

**Pattern**: B (sessionStorage hydration on mount). Canonical SSR-safe-hydration anti-pattern.

**Why current code is wrong**: Renders once with empty state, then re-renders with hydrated state — visible flicker on first paint. Lazy initializers solve this in one line each.

**Proposed fix**:

```tsx
const [visits, setVisits] = useState<PageVisit[]>(() => getStoredVisits());
const [isEnabled, setIsEnabledState] = useState<boolean>(() =>
  getEnabledState(),
);
const [insights, setInsights] = useState<ObservationInsight[]>([]);
```

Both helpers already guard `typeof window === "undefined"` — SSR-safe. Effect at line 216 is deleted.

**Effort**: trivial.

---

### `apps/web/src/components/shadow-agent/useObservation.ts:230`

**Code excerpt** (222-244):

```tsx
useEffect(() => {
  if (!isEnabled) return;

  const newVisit: PageVisit = { page: pathname, timestamp: Date.now() };

  setVisits((prev) => {
    const updated = [...prev, newVisit];
    storeVisits(updated);
    if (updated.length >= 5) {
      setInsights(generateInsights(updated)); // ← cascading setState
    }
    return updated;
  });

  reportObservation(pathname);
}, [pathname, isEnabled]);
```

**Pattern**: F (cascading setState — `setInsights` fires inside `setVisits` updater). The visits append is legitimate (it's an event-driven side effect) but the insights derivation is pure derived data and shouldn't live inside the visits updater.

**Why current code is wrong**: `insights` is a function of `visits`; storing it as separate state means two sources of truth. Lint correctly flags the nested `setInsights` because it's a render-cascading state mutation.

**Proposed fix**: Derive `insights` via `useMemo`, drop the `insights` state:

```tsx
const insights = useMemo<ObservationInsight[]>(
  () => (visits.length >= 5 ? generateInsights(visits) : []),
  [visits],
);

useEffect(() => {
  if (!isEnabled) return;
  const newVisit: PageVisit = { page: pathname, timestamp: Date.now() };
  setVisits((prev) => {
    const updated = [...prev, newVisit];
    storeVisits(updated);
    return updated;
  });
  reportObservation(pathname);
}, [pathname, isEnabled]);
```

**Effort**: trivial. `setInsights` callsites removed; `insights` becomes `useMemo`.

---

### `apps/web/src/components/shell/AppShell.tsx:23`

**Code excerpt** (14-30):

```tsx
const [collapsed, setCollapsed] = useState(false);
const [mobileOpen, setMobileOpen] = useState(false);
const [mounted, setMounted] = useState(false);

useEffect(() => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored !== null) {
    setCollapsed(stored === "true");
  } else {
    const isTablet = window.innerWidth >= 768 && window.innerWidth < 1024;
    setCollapsed(isTablet);
  }
  setMounted(true);
}, []);
```

**Pattern**: B (localStorage hydration on mount). Plus a `mounted` flag that exists solely to suppress hydration mismatch.

**Why current code is wrong**: Same as observation hook — visible flicker. The `mounted` flag is a code-smell signalling that the hydration isn't actually safe.

**Proposed fix**: Lazy initializer with SSR guard:

```tsx
function readInitialCollapsed(): boolean {
  if (typeof window === "undefined") return false; // SSR default
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored !== null) return stored === "true";
  return window.innerWidth >= 768 && window.innerWidth < 1024;
}

const [collapsed, setCollapsed] = useState<boolean>(readInitialCollapsed);
const [mobileOpen, setMobileOpen] = useState(false);
const [mounted, setMounted] = useState(typeof window !== "undefined");
```

For Next.js App Router with hydration mismatch concern: keep `mounted` state but drive the storage read from the lazy initializer. The mismatch is genuine (server has no localStorage), so the `mounted` boolean controls when persistence-aware classes apply — render-time only — without needing a `useEffect` to set initial state.

**Effort**: trivial.

---

### `apps/web/src/contexts/AdvisoryPanelContext.tsx:68`

**Code excerpt** (62-71):

```tsx
useEffect(() => {
  const stored = sessionStorage.getItem(ACTIVE_CONV_KEY);
  if (stored !== null) {
    const parsed = parseInt(stored, 10);
    if (!Number.isNaN(parsed)) {
      setActiveConversationId(parsed);
    }
  }
}, []);
```

**Pattern**: B (sessionStorage hydration on mount).

**Proposed fix**: Lazy initializer:

```tsx
function readInitialActiveConv(): number | null {
  if (typeof window === "undefined") return null;
  const stored = sessionStorage.getItem(ACTIVE_CONV_KEY);
  if (stored === null) return null;
  const parsed = parseInt(stored, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

const [activeConversationId, setActiveConversationId] = useState<number | null>(
  readInitialActiveConv,
);
```

Drop the effect.

**Effort**: trivial.

---

### `apps/web/src/contexts/AdvisoryPanelContext.tsx:85`

**Code excerpt** (82-87):

```tsx
useEffect(() => {
  if (isAdvisoryPage && isOpen) {
    setIsOpen(false);
  }
}, [isAdvisoryPage, isOpen]);
```

**Pattern**: C (Route-driven sync — close panel when navigating to /advisory).

**Why current code is wrong**: `isOpen` should never be `true` when `isAdvisoryPage` is `true`. This is a state invariant, not a synchronization. Encoding it as an effect means there's a render where `isOpen=true && isAdvisoryPage=true` before the effect runs.

**Proposed fix**: Compute the effective `isOpen` from both inputs:

```tsx
const [rawIsOpen, setRawIsOpen] = useState(false);
const isOpen = rawIsOpen && !isAdvisoryPage;
```

OR fold the constraint into `setIsOpen`:

```tsx
const setIsOpen = useCallback(
  (next: boolean) => {
    setRawIsOpen(isAdvisoryPage ? false : next);
  },
  [isAdvisoryPage],
);
```

Recommended: derived `isOpen` (line 1) — invariant holds in same render, no race window.

**Effort**: trivial.

---

### `apps/web/src/app/(dashboard)/advisory/history/page.tsx:230`

**Code excerpt** (226-260):

```tsx
const { data, isLoading, error, refetch } = useConversationList();
const [search, setSearch] = useState("");
const [riskFilter, setRiskFilter] = useState<RiskFilter>("all");

const conversations = data?.conversations ?? []; // ← line 230, fresh reference each render

const filtered = useMemo(() => {
  let items = [...conversations];
  // …
  return items;
}, [conversations, search, riskFilter]);
```

**Pattern**: F (unstable derived value used as `useMemo` dep). `data?.conversations ?? []` allocates a NEW empty array each render when `data` is undefined; `useMemo` re-runs every render.

**Why current code is wrong**: When `data === undefined`, `conversations` is a fresh `[]` per render — `useMemo([conversations, …])` never hits its cache. When `data?.conversations` is defined, the array is a stable reference from TanStack Query cache, so the memo IS cached — but the inconsistent behavior masks the problem.

**Proposed fix**: Two options:

1. Wrap the fallback in its own memo:

```tsx
const conversations = useMemo(
  () => data?.conversations ?? [],
  [data?.conversations],
);
```

2. Inline the fallback inside the consuming `useMemo`:

```tsx
const filtered = useMemo(() => {
  let items = [...(data?.conversations ?? [])];
  // …
  return items;
}, [data?.conversations, search, riskFilter]);
```

**Recommended**: Option 2 — fewer hooks, single source of truth.

**Effort**: trivial.

---

### `apps/web/src/app/(dashboard)/alerts/page.tsx:156` (×2)

**Code excerpt** (146-227):

```tsx
const [activeTab, setActiveTab] = useState<TabFilter>("all");
// …
const alerts = data?.alerts ?? [];   // ← line 156, fresh ref each render

const filtered = useMemo(() => { /* uses alerts */ }, [alerts, activeTab, ...]);
// …
const calendarAlerts = useMemo(() => { /* uses alerts */ }, [alerts, calendarMonth, calendarYear]);
```

**Pattern**: F (same `data?.X ?? []` instability as advisory/history). Two consuming `useMemo`s mean two warning instances.

**Proposed fix**: Same as above — wrap once:

```tsx
const alerts = useMemo(() => data?.alerts ?? [], [data?.alerts]);
```

**Effort**: trivial.

---

## Cross-file patterns

### Pattern A — fetch-on-mount → TanStack Query (6 files, 9 effect occurrences)

`signup`, `analytics` (×6 sub-fetches), `dashboard`, `documents/[id]/preview`, `documents`, `EmployeePicker`. ALL six have the same structural shape:

```tsx
const [data, setData] = useState(null);
const [loading, setLoading] = useState(true);
const [error, setError] = useState(null);
useEffect(() => {
  api
    .fetch()
    .then(setData)
    .catch(setError)
    .finally(() => setLoading(false));
}, [deps]);
```

This is the canonical TanStack Query migration target. Replacement is mechanical: `useQuery({ queryKey, queryFn, enabled })` returns `{ data, isLoading, error }` covering all three useState hooks. Pattern is already in the codebase (`useAdvisoryHistory.ts`, `useAlerts.ts`).

### Pattern B — storage-hydration → lazy initializer (3 effects across 3 files)

`AppShell.tsx`, `AdvisoryPanelContext.tsx:68`, `useObservation.ts:217`. ALL three read `localStorage`/`sessionStorage` in `useEffect(() => …, [])` and `setState` to the result. Lazy initializer is the React-canonical replacement:

```tsx
const [s, setS] = useState(() => readFromStorageOrDefault());
```

SSR-safe via `if (typeof window === "undefined") return DEFAULT;` inside the reader.

### Pattern D — derived state from props → `key=` remount (3 effects in 1 file)

`employees/[id]/page.tsx` lines 516, 1334, 1885 — three identical `setForm({}); setHasChanges(false)` resets driven by `[employee]`. Single-line fix at parent: `<Tab key={employee.id} … />`. Demonstrates "if you find it once in a file, grep for it" — three duplicated effects that share one root cause.

### Pattern F — unstable `data?.X ?? []` derived value → wrap in `useMemo` (3 lint findings, 2 files)

`advisory/history/page.tsx:230` and `alerts/page.tsx:156` (twice). Both pages use TanStack Query's `data?.alerts ?? []` / `data?.conversations ?? []` as a `useMemo` dep. This is a TanStack-Query-specific gotcha: the cached array IS stable across renders, but the `?? []` fallback allocates fresh during loading. One-line fix: `const xs = useMemo(() => data?.X ?? [], [data?.X])`.

### Pattern C/F — context-action-driven sync (2 effects across 2 files)

`AdvisoryPanel.tsx:88` (close history when panel closes) and `AdvisoryPanelContext.tsx:85` (close panel when navigating to advisory). Both are state-invariant violations dressed as effects. Both fix to "compute during render" or "fold into the action that mutated the upstream state." A useful generalisation for the project: any `useEffect(() => { if (a) setB(false) }, [a])` where `b` is owned by the same component is almost always a derived-state bug.

---

## TanStack Query migration plan

For the 6 fetch-on-mount sites (Pattern A), here is the file-level plan.

### New hook files

| File                                                       | Hooks                                                                                                                     |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/hooks/api/useAuth.ts` (new)                  | `useInviteValidation(token)`                                                                                              |
| `apps/web/src/hooks/api/useAnalytics.ts` (new)             | `useWorkforce`, `useComplianceStatus`, `usePlatformMetrics`, `useQueryPatterns`, `useFeedbackSummary`, `useMonthlyReport` |
| `apps/web/src/hooks/api/useDocuments.ts` (extend existing) | `useTemplates(category?)`, `useTemplate(id)`                                                                              |
| `apps/web/src/hooks/api/useEmployees.ts` (new)             | `useEmployeeList()`, `useEmployee(id)` (latter useful for `employees/[id]/page.tsx`)                                      |

### Query key conventions

Match the existing `useAlerts.ts` shape exactly:

```ts
export const xxxKeys = {
  all: ["xxx"] as const,
  list: (params?) => [...xxxKeys.all, "list", params] as const,
  detail: (id: number) => [...xxxKeys.all, "detail", id] as const,
};
```

### Endpoint inventory

All endpoints already exist (verified via `grep -E "(workforce|status|metrics|queryPatterns|feedbackSummary|monthlyReport|listTemplates|getTemplate|validateInvite)" services/api/`). No backend work required. The fix is pure frontend wiring.

### Cache invalidation considerations

| Hook                                                                                               | Mutations that invalidate                                                                                                         |
| -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `useEmployeeList`                                                                                  | `useCreateEmployee`, `useUpdateEmployee`, `useDeactivateEmployee` (all in `useEmployees.ts`) — invalidate `["employees", "list"]` |
| `useTemplates`                                                                                     | `useCreateTemplate`, `useDeleteTemplate` — invalidate `["documents", "templates"]`                                                |
| `useComplianceStatus(companyId)`                                                                   | After running a compliance check (router needs auditing for this; add invalidation on mutation success)                           |
| `useInviteValidation`                                                                              | No mutations — invite is read-only from the page's perspective                                                                    |
| `useWorkforce`, `usePlatformMetrics`, `useQueryPatterns`, `useFeedbackSummary`, `useMonthlyReport` | Refetch policy: `refetchOnWindowFocus: true` (default), `staleTime: 60_000` (analytics dashboards tolerate 1-min stale data)      |

### `staleTime` recommendations

| Data                  | staleTime  | Reason                                                      |
| --------------------- | ---------- | ----------------------------------------------------------- |
| `useEmployeeList`     | 5 min      | Roster rarely changes during a session                      |
| `useTemplate(id)`     | 30 min     | Templates are versioned static documents                    |
| `useTemplates`        | 5 min      | Catalog of templates                                        |
| `useInviteValidation` | `Infinity` | Token is single-use; never revalidate while page is mounted |
| Analytics hooks       | 1 min      | Dashboard data; refresh on window focus is enough           |

### Migration sequence (suggested shard order)

1. **Trivial pure-frontend fixes first** (no new hook files): `analytics:122` (immutability), `employees/[id]:302` (purity), `employees/[id]:516,1334,1885` (D, key remount), `useObservation:217,230` (B + F), `AppShell:23` (B), `AdvisoryPanelContext:68,85` (B + C), `AdvisoryPanel:88` (C), `PaceCard:76` (F), `advisory/history:230` (F), `alerts:156` (F). 12 errors knocked out without writing a new hook file.
2. **Extend `useDocuments.ts`**: add `useTemplate(id)` and `useTemplates`. Fixes `documents/[id]/preview:20` and `documents:72`. 2 errors.
3. **New `useAuth.ts`**: add `useInviteValidation`. Fixes `signup:534`. 1 error.
4. **New `useEmployees.ts`**: add `useEmployeeList`. Fixes `EmployeePicker:42`. 1 error.
5. **New `useAnalytics.ts`**: add 6 hooks. Fixes `analytics:400` and `dashboard:368`. 2 errors via shared cache.

Total: 20 errors closed across 5 shards. Steps 2-5 are independent — can run in parallel agents per `rules/agents.md` § Parallel Execution.

---

## Notes on Rule 4 / Rule 1 compliance

- Per `rules/zero-tolerance.md` Rule 1: the existing `eslint-disable-next-line react-hooks/exhaustive-deps` at `PaceCard.tsx:91` is itself a workaround that masks a real dep violation; the proposed fix removes it (no `eslint-disable` survives).
- Per Rule 4: NO `eslint-disable` comments anywhere in proposed fixes. NO post-mount `useEffect` with `setState` in any proposed code. Every fix changes the data-flow shape, not the lint configuration.
- The `mounted` flag in `AppShell` is preserved (it's a legitimate hydration guard for browser-only classes), but its `setMounted(true)` no longer lives in a state-init effect — initialised via `useState(typeof window !== "undefined")`.
