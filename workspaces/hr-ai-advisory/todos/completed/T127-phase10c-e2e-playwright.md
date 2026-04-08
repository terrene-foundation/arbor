# T127 — Phase 10C: E2E tests (Tier 3) — Playwright Ollama settings + advisory

**Status**: ACTIVE
**Phase**: 10C (Tests — Tier 3)
**Plan ref**: `02-plans/06-ollama-provider-plan.md` lines 504-516
**Depends on**: T126 (Tier 2 must pass first; the E2E suite reuses the docker-compose Ollama service)
**Specialist**: testing-specialist

## Goal

Verify the entire user-facing flow end-to-end: a real browser, a real backend, a real database, a real Ollama container, and the actual web UI. Per `rules/testing.md`, Tier-3 has zero abstractions — anything mocked here defeats the purpose.

## Tests to add — `tests/e2e/`

### Scenario 1: Save Ollama config and run an advisory query

- [ ] `test_e2e_ollama_settings_save_and_query`

User flow (must execute exactly these steps):

1. Navigate to the login page; log in as a seeded company-admin user
2. Navigate to `/settings/ai`
3. Locate the "Local AI" / Ollama card; click "Configure Endpoint"
4. Enter `http://ollama:11434` in the base URL field
5. Enter `llama3.1:8b` in the model field
6. Click "Test & Save"
7. Wait for and assert a success toast confirming the save
8. Navigate to the advisory chat page
9. Send the message "How many days of paternity leave do I get in Singapore?"
10. Wait for the streamed response
11. Assert response text contains "28 days" (or "28") and at least one citation link
12. **State persistence verification per `rules/testing.md`**: navigate AWAY from `/settings/ai`, then back, and assert the Ollama config is still populated with the same base URL and model

### Scenario 2: Save Ollama config with non-allowlisted model

- [ ] `test_e2e_ollama_save_phi3_rejected`

1. Log in as company admin
2. Navigate to `/settings/ai` → Ollama card → Configure Endpoint
3. Enter `http://ollama:11434`
4. Enter `phi3:14b`
5. Click "Test & Save"
6. Assert an inline error appears under the model field, naming the allowlist (e.g. "Ollama model 'phi3:14b' is not tool-capable. Choose from: command-r, command-r-plus, firefunction-v2, llama3.1, llama3.2, mistral-nemo, qwen2.5")
7. Reload the page; assert the config was NOT saved (state persistence: empty model field still)

### Scenario 3 (optional, if time permits): Streaming verification

- [ ] `test_e2e_ollama_advisory_streaming_token_by_token`

1. Same setup as Scenario 1
2. Send a longer query like "Give me a summary of the Employment Act on annual leave"
3. Use Playwright's network/SSE inspection to verify the response arrives as multiple chunks (token streaming) rather than a single payload
4. Assert at least 5 SSE events were received

## Acceptance criteria

- [ ] All 2 (or 3) E2E tests above pass against the docker-compose stack
- [ ] No mocking of network, database, or browser
- [ ] State persistence verification step is present in Scenario 1 and 2
- [ ] Test names follow `tests/e2e/<feature>/test_<scenario>.spec.ts` (or .py if pytest-playwright)
- [ ] CI runs these tests in the E2E job; document the `OLLAMA_INTEGRATION=1` gate if applicable
- [ ] Test screenshots/videos saved on failure for diagnosis (Playwright default)

## Traps

- **`http://ollama:11434` vs `http://localhost:11434`** — inside the docker-compose network, the Ollama service is reachable at `http://ollama:11434`. If the test runner is INSIDE the network, use that. If OUTSIDE (e.g. running pytest from the host), use `http://localhost:11434`. Confirm by reading the existing Tier-2 tests.
- **Login flow brittleness** — the login step is the most likely source of flakes. Use a robust selector (`data-testid` or stable ARIA labels) and wait for navigation explicitly.
- **Streaming SSE in Playwright** — Playwright's SSE support is finicky. Use `page.waitForResponse(url, response => response.url().includes('/advisory/query/stream'))` and inspect the response body. Don't rely on DOM updates alone; the chat UI may batch tokens.
- **Test data isolation** — each test must use a fresh seeded company so saving an Ollama config in one test doesn't pollute another. Use a per-test fixture that creates and deletes the test company.
- **Screenshots in CI** — Playwright takes screenshots on failure by default. Make sure CI uploads them as artifacts so debugging is possible.
- **i18next default locale** — assertions must match the default locale (English) or the test must force `en` as the URL/cookie. Don't assert "28 days" against a locale that translates the number.

## Red team round 1 revisions (M20, M21, L8)

### M20 — Add E2E tenant-isolation scenario for C1

C1 has zero Tier-3 coverage as written. Add Scenario 4 (REQUIRED, not optional):

- [ ] `test_e2e_tenant_isolation_c1`

User flow:

1. Log in as Company A admin
2. Save Ollama BYOK at `/settings/ai` with `http://ollama:11434` and `llama3.1:8b`
3. Run an advisory query → assert response model is `llama3.1:8b` (Ollama path)
4. Log out
5. Log in as Company B admin (different seeded company, no BYOK config)
6. Run an advisory query → assert response model is `gpt-5-mini` or whatever the server-default is (NOT `llama3.1:8b`)
7. Verify Company B's request did NOT pass through Company A's adapter (cross-check via the response's `model_used` field)

This is the user-visible C1 manifestation. Without it, the bug is only pinned at unit and integration levels.

### M21 — Mark streaming SSE scenario REQUIRED

Scenario 3 (`test_e2e_ollama_advisory_streaming_token_by_token`) was marked optional. Per `rules/testing.md` Tier-3 zero-abstraction principle, streaming is a core feature and must be E2E-tested. Promote to REQUIRED.

Strengthen the multi-chunk verification: don't rely on `waitForResponse` (single-event). Use `page.on('response')` with streaming body read or CDP `Network.responseReceivedExtraInfo` to capture multiple SSE events:

```typescript
const sseEvents: string[] = [];
page.on("response", async (response) => {
  if (response.url().includes("/advisory/query/stream")) {
    const body = await response.text();
    sseEvents.push(...body.split("\ndata:").filter(Boolean));
  }
});

await page.click('[data-testid="send-message"]');
await page.waitForTimeout(5000); // give the stream time to complete
expect(sseEvents.length).toBeGreaterThan(5);
```

### L8 — Verify backend was never called in Scenario 2

When phi3 is rejected client-side, the test should confirm no POST hit the backend (a regression where client validation passes but backend still accepts could otherwise slip through):

```typescript
let saveAttempts = 0;
page.on("request", (req) => {
  if (req.method() === "POST" && req.url().includes("/api/llm-config")) {
    saveAttempts++;
  }
});

await fillFormWith({ provider: "ollama", model: "phi3:14b" });
await page.click('[data-testid="save-config"]');

expect(saveAttempts).toBe(0); // Client blocked before any POST
```

### Updated acceptance criteria

- [ ] Scenario 4 (tenant isolation) exists and is REQUIRED
- [ ] Scenario 3 (streaming SSE) promoted to REQUIRED
- [ ] Scenario 3 captures multiple SSE chunks via `page.on('response')`, not single `waitForResponse`
- [ ] Scenario 2 verifies zero POST attempts when client validation rejects
