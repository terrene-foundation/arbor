# T123 — Phase 8: Frontend Ollama settings copy + required model field

**Status**: ACTIVE
**Phase**: 8 (Frontend copy fixes)
**Plan ref**: `02-plans/06-ollama-provider-plan.md` lines 374-383
**Depends on**: T115 (the backend rejection contract that the UI surfaces)
**Specialist**: react-specialist

## Goal

Update the Ollama settings card on the AI settings page so it:

1. No longer claims the model is "auto-detected if empty" (it isn't — the backend now requires it)
2. Shows example model names from the tool-capable allowlist
3. Marks the model field as required
4. Surfaces the backend's allowlist rejection error inline if the user submits an unsupported model

## What to change — `apps/web/src/app/(dashboard)/settings/ai/page.tsx`

Lines **633-650** are the Ollama settings card per the plan.

### 1. Remove the misleading "(optional)" hint

- Find the label string `"(optional — auto-detected if empty)"` and delete the parenthetical
- The label should now read just `Model` (or whatever the unaffixed version is)

### 2. Add the example list to the help text

```
e.g. `llama3.1:70b`, `qwen2.5:32b`, `mistral-nemo:12b`. Only models that
support tool calls are allowed.
```

- Render below the input as helper text (use whatever the existing helper-text component is — likely a `<p className="text-xs text-muted-foreground">`)

### 3. Mark the input as required

- HTML5: add `required` attribute to the `<input>` element
- Client-side check: in the form submit handler, fail fast if the model field is empty before hitting the API

### 4. Surface backend allowlist errors inline

- The backend (T115) returns HTTP 400 with `{detail: "<message naming the allowlist>"}` when the user submits a non-allowlisted model
- The form's `onError` (or `useMutation` `onError` if React Query) MUST extract the `detail` field and render it as a field error below the input
- Use the same error styling as other inline form errors on the page

### 5. (Optional, if time permits) Convert input to a combobox

- The allowlist families (`llama3.1`, `llama3.2`, `qwen2.5`, `mistral-nemo`, `firefunction-v2`, `command-r`, `command-r-plus`) become suggestions
- The user can still type a free-form model name including tags (e.g. `llama3.1:70b-instruct-q4_0`) — the combobox is suggestions, not a hard dropdown
- Use whatever combobox component already exists in the design system (`shadcn/ui` Combobox or similar)

## Acceptance criteria

- [ ] "(optional — auto-detected if empty)" string is removed from the Ollama card
- [ ] Helper text shows the three example models and the tool-call constraint
- [ ] Model `<input>` has `required` attribute and client-side validation rejects empty submit before API call
- [ ] Backend 400 with allowlist `detail` is surfaced as an inline field error
- [ ] (Optional) Combobox suggestions exist for the 7 allowlisted families
- [ ] `pnpm lint` / `pnpm typecheck` clean for the changed file
- [ ] Manual smoke test:
  - Submit Ollama form without a model name → blocked client-side
  - Submit Ollama form with `phi3:14b` → backend allowlist error rendered inline below the model input
  - Submit Ollama form with `llama3.1:70b` → success

## Traps

- **Don't hardcode the allowlist on the frontend** — if the backend allowlist changes, the frontend goes stale. Either fetch the allowlist from a `/api/llm-config/ollama-allowlist` endpoint (small enhancement, can be deferred), or just use the example list as suggestions and let the backend be the source of truth.
- **Error-shape contract** — the backend returns `{detail: ...}` for FastAPI 400s. Verify the React Query error handler unwraps `error.response.data.detail` correctly.
- **i18next** — if the Ollama card uses translation keys, all new strings need to be added to `apps/web/locales/en/common.json` (and any other supported locales). Don't hardcode English strings without translation keys.
- **Testing this change** is part of T127 (Playwright E2E). No backend tests required for this todo.
