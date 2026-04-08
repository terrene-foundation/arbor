/**
 * Production smoke test — verifies https://arbor.terrene.foundation is serving v0.4.0
 * correctly after deploy. Run via:
 *   cd apps/web && npx playwright test tests/e2e/10-production-smoke.spec.ts \
 *     --project=chromium --reporter=list
 */

import { test, expect } from "@playwright/test";

const PROD_URL = "https://arbor.terrene.foundation";

test.describe("Production smoke (v0.4.0)", () => {
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
    // Per deploy/deployment-config.md, these are enforced by Caddy
    expect(headers["strict-transport-security"]).toBeTruthy();
    expect(headers["strict-transport-security"]).toMatch(/max-age=\d+/);
    expect(headers["x-content-type-options"]).toBe("nosniff");
  });

  test("frontend redirects HTTP to HTTPS", async ({ request }) => {
    const resp = await request.get("http://arbor.terrene.foundation/", {
      maxRedirects: 0,
      failOnStatusCode: false,
    });
    // 301 or 308 redirect to https (depending on Caddy config)
    expect([301, 308]).toContain(resp.status());
  });
});
