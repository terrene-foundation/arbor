/**
 * v0.4.1 authenticated verification — run once against live production to
 * prove the AI settings fix works end-to-end for a user with company_id=null.
 *
 * Registers a fresh throwaway user on arbor.aitelab.net (public
 * registration always returns company_id=null), injects the access/refresh
 * tokens into localStorage, loads /settings/ai in a real browser, and
 * asserts:
 *   1. The "Loading AI settings..." spinner does NOT persist.
 *   2. The "No company yet" empty state is visible.
 *   3. The "Set up company" button is present.
 *   4. The backend /api/llm-config/* endpoints were NOT called (correct
 *      because the fix skips the fetch when there is no company).
 *
 * Re-runnable: each run creates a new throwaway user with a timestamped
 * email. Leaves behind a single e2e test user per run.
 *
 * Run via:
 *   cd apps/web && npx playwright test tests/e2e/11-v041-authenticated-verify.spec.ts \
 *     --project=chromium --reporter=list
 */

import { test, expect, type APIResponse } from "@playwright/test";

const PROD_URL = "https://arbor.aitelab.net";

interface RegisterResponse {
  user: { id: number; email: string; company_id: number | null };
  access_token: string;
  refresh_token: string;
}

test.describe("v0.4.1 authenticated verification (production)", () => {
  test.use({ baseURL: PROD_URL });

  test("user with company_id=null sees the No company yet empty state on /settings/ai", async ({
    page,
    request,
  }) => {
    // 1. Register a throwaway user against the live production backend.
    const email = `e2e-v041-verify-${Date.now()}@playwright.test`;
    const password = "PlaywrightVerify1!";

    const resp: APIResponse = await request.post(
      `${PROD_URL}/api/auth/register`,
      {
        headers: {
          "Content-Type": "application/json",
          Origin: PROD_URL,
          Referer: `${PROD_URL}/signup`,
        },
        data: {
          email,
          password,
          name: "E2E v0.4.1 Verifier",
        },
      },
    );

    expect(resp.status(), `registration failed: ${await resp.text()}`).toBe(
      200,
    );
    const body = (await resp.json()) as RegisterResponse;

    // Critical precondition: the user MUST have company_id=null. This is
    // what triggers the original bug.
    expect(body.user.company_id).toBeNull();

    // 2. Track API calls so we can assert llm-config endpoints were NOT hit.
    const llmConfigCalls: string[] = [];
    page.on("request", (req) => {
      const url = req.url();
      if (url.includes("/api/llm-config") || url.includes("/api/llm_config")) {
        llmConfigCalls.push(url);
      }
    });

    // 3. Open the app, then inject the tokens into localStorage before the
    //    AuthContext mounts. We navigate to /login first so the origin is
    //    set correctly, then set the tokens and navigate to the target page.
    await page.goto("/login");
    await page.evaluate(
      ({ at, rt }) => {
        localStorage.setItem("access_token", at);
        localStorage.setItem("refresh_token", rt);
      },
      { at: body.access_token, rt: body.refresh_token },
    );

    // 4. Navigate to /settings/ai. The AuthContext will hit /auth/me with
    //    our injected token, populate `user` (with company_id=null), and
    //    render the page.
    await page.goto("/settings/ai");
    await page.waitForLoadState("domcontentloaded");

    // 5. Give the client time to finish the auth → loadConfig flow. Before
    //    the fix, the page would still be on "Loading AI settings..." here.
    //    After the fix, we should see "No company yet".
    await expect(page.getByText(/No company yet/i)).toBeVisible({
      timeout: 10000,
    });

    // 6. The loading spinner must NOT be visible.
    await expect(page.getByText(/Loading AI settings/i)).not.toBeVisible();

    // 7. The "Set up company" CTA button must be present.
    await expect(
      page.getByRole("button", { name: /Set up company/i }),
    ).toBeVisible();

    // 8. CRITICAL: the llm-config endpoints must NOT have been called.
    //    The fix skips the fetch when companyId is missing — otherwise we
    //    would see failed requests in the network tab.
    expect(
      llmConfigCalls,
      `unexpected llm-config calls: ${llmConfigCalls.join(", ")}`,
    ).toHaveLength(0);

    // 9. Capture a screenshot as ship evidence.
    await page.screenshot({
      path: `test-results/v041-no-company-empty-state.png`,
      fullPage: true,
    });

    // Log the user id so we can delete from prod DB later if needed.
    console.log(
      `[v0.4.1 verify] Test user: id=${body.user.id} email=${body.user.email}`,
    );
  });
});
