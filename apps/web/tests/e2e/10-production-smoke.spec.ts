/**
 * Production smoke test — verifies https://arbor.aitelab.net is serving
 * the current release correctly after deploy. Run via:
 *   cd apps/web && npx playwright test tests/e2e/10-production-smoke.spec.ts \
 *     --project=chromium --reporter=list
 */

import { test, expect } from "@playwright/test";

const PROD_URL = "https://arbor.aitelab.net";

/** Every top-level route a user can hit, protected or not. Protected routes
 *  should redirect an unauthenticated visitor to /login (HTTP 200 from the
 *  login page after redirect). None should 500 or 404.
 *
 *  This list mirrors apps/web/src/app/(auth)/ and apps/web/src/app/(dashboard)/
 *  top-level directories — keep them in sync when new pages are added. */
const TOP_LEVEL_ROUTES = [
  // Public
  "/",
  "/login",
  "/signup",
  "/forgot-password",
  "/onboarding",
  // Dashboard — core
  "/dashboard",
  "/advisory",
  "/alerts",
  "/compliance",
  "/documents",
  "/calculators",
  "/help",
  "/profile",
  // Dashboard — HRIS modules
  "/employees",
  "/leave",
  "/claims",
  "/payroll",
  "/attendance",
  "/shifts",
  "/appraisals",
  "/approvals",
  "/projects",
  "/inventory",
  "/recruitment",
  "/reports",
  "/training/skillsfuture",
  "/policies",
  "/analytics",
  "/clients",
  "/admin",
  // Dashboard — self-service
  "/my-dashboard",
  "/my-leave",
  "/my-payslips",
  "/my-timesheets",
  "/my-profile",
  "/my-inventory",
  // Settings
  "/settings",
  "/settings/ai",
  "/settings/notifications",
  "/settings/integrations",
] as const;

test.describe("Production smoke", () => {
  test.use({ baseURL: PROD_URL });

  test("backend /api/health returns healthy", async ({ request }) => {
    const resp = await request.get(`${PROD_URL}/api/health`);
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body.status).toBe("healthy");
    // Advisory workflow should be healthy post-Ollama-provider ship
    if (body.workflows) {
      expect(body.workflows.search_kb).toBe("healthy");
    }
  });

  test("frontend landing page returns 200 + serves HTML", async ({ page }) => {
    const resp = await page.goto(PROD_URL);
    expect(resp?.status()).toBe(200);
    // Page should have a title (any title — just proving the HTML shell rendered)
    await expect(page).toHaveTitle(/arbor/i);
  });

  test("landing page shows a login affordance", async ({ page }) => {
    await page.goto(PROD_URL);
    // There should be at least one element that looks like login — button, link, or form
    const loginCandidates = page.getByRole("link", {
      name: /sign in|log in|login/i,
    });
    const buttonCandidates = page.getByRole("button", {
      name: /sign in|log in|login/i,
    });
    const total =
      (await loginCandidates.count()) + (await buttonCandidates.count());
    expect(total).toBeGreaterThan(0);
  });

  test("security headers present (HSTS, X-Content-Type-Options)", async ({
    request,
  }) => {
    const resp = await request.get(PROD_URL);
    const headers = resp.headers();
    // HSTS + nosniff terminated at Cloudflare in front of the cluster ingress.
    expect(headers["strict-transport-security"]).toBeTruthy();
    expect(headers["strict-transport-security"]).toMatch(/max-age=\d+/);
    expect(headers["x-content-type-options"]).toBe("nosniff");
  });

  test("frontend redirects HTTP to HTTPS", async ({ request }) => {
    const resp = await request.get("http://arbor.aitelab.net/", {
      maxRedirects: 0,
      failOnStatusCode: false,
    });
    // 301 or 308 redirect to https (Cloudflare "Always Use HTTPS").
    expect([301, 308]).toContain(resp.status());
  });

  /** Per-route smoke: every top-level URL the app exposes must either serve a
   *  200 (public routes) or redirect to /login (protected routes). No 500s,
   *  no 404s, no hangs. Catches broken routing, missing bundles, and server-
   *  render crashes across all pages at once. */
  for (const route of TOP_LEVEL_ROUTES) {
    test(`route ${route} reaches a non-error page`, async ({ page }) => {
      const resp = await page.goto(`${PROD_URL}${route}`, {
        waitUntil: "domcontentloaded",
      });
      // The final rendered URL is either the original route (public) or /login
      // (protected, after redirect). Either is fine.
      const status = resp?.status() ?? 0;
      expect(status, `route ${route} returned HTTP ${status}`).toBeLessThan(
        400,
      );

      // No unhandled-error shell text
      await expect(page.locator("body")).not.toContainText(
        /application error|internal server error|500|502|503|504/i,
      );

      // Page must have rendered SOMETHING — the Next.js app shell at minimum
      await expect(page).toHaveTitle(/arbor/i);
    });
  }

  /** Regression pin for the v0.4.1 fix: /settings/ai must NOT get stuck on the
   *  "Loading AI settings..." spinner. Unauthenticated → app redirects to
   *  /login (because dashboard routes are protected). The spinner is a
   *  client-side-only state of the AI page, so after the redirect the login
   *  page should render normally and NOT show any loading-forever text. */
  test("v0.4.1 regression: /settings/ai does not hang on loading spinner", async ({
    page,
  }) => {
    await page.goto(`${PROD_URL}/settings/ai`, {
      waitUntil: "domcontentloaded",
    });
    // Give the client a chance to mount and either:
    //   (a) redirect to /login (unauthenticated), or
    //   (b) show the "No company yet" empty state (authenticated, no company)
    // Either outcome is correct. What must NOT happen: the spinner stays visible.
    await page.waitForTimeout(3000);
    // "Loading AI settings..." only appears as a transient state. If it's
    // still on screen 3s in, the deadlock regressed.
    const stillLoading = await page
      .getByText(/Loading AI settings/i)
      .isVisible()
      .catch(() => false);
    expect(stillLoading, "AI settings page is stuck on loading spinner").toBe(
      false,
    );
  });
});
