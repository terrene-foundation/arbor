/* ── My Profile — Shard D S4 (b) restoration regression ──
   Pins the `payrollRequired` wiring restored by Shard D S4. The
   array was declared in commit 0e717c7 ("M39+T316 — employee profile
   models, self-service page, PUT /me") but never consumed; the
   downstream comment said "Track which fields are required for
   payroll" yet no banner ever surfaced WHICH payroll fields the user
   was missing.

   Now the page renders a "Payroll cannot be processed yet" banner
   listing the missing payroll-critical fields when any of them are
   blank.

   Test tier: Tier 2 (Vitest + RTL). apiClient is mocked.
   ────────────────────────────────────────────────────────────── */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithQueryClient } from "./_helpers";

/* ── Mocks ────────────────────────────────────────────────── */

const apiGet = vi.fn();
const apiPut = vi.fn();
vi.mock("@/services/api/client", () => ({
  apiClient: {
    get: (...args: unknown[]) => apiGet(...args),
    put: (...args: unknown[]) => apiPut(...args),
  },
}));

import MyProfilePage from "@/app/(dashboard)/my-profile/page";

const COMPLETE_PROFILE = {
  name: "Alice Tan",
  alias: "Ali",
  date_of_birth: "1990-05-15",
  gender: "female",
  race: "chinese",
  nationality: "Singaporean",
  religion: "",
  marital_status: "single",
  phone: "+65 9123 4567",
  email: "alice@example.com",
  nric_fin: "S1234567A",
  nric_fin_last4: "567A",
  residential_address: "1 Orchard Rd",
  bank_name: "DBS",
  bank_account_number: "0123456789",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("My Profile — missing-payroll banner (S4 b-restoration)", () => {
  it("does NOT render the banner when all payroll-critical fields are filled", async () => {
    apiGet.mockResolvedValueOnce(COMPLETE_PROFILE);

    renderWithQueryClient(<MyProfilePage />);

    await waitFor(() => {
      /* Wait for the page to leave the loading skeleton. */
      expect(apiGet).toHaveBeenCalledWith("/employees/me");
    });

    expect(
      screen.queryByTestId("missing-payroll-banner"),
    ).not.toBeInTheDocument();
  });

  it("renders the banner with each missing payroll field labelled", async () => {
    apiGet.mockResolvedValueOnce({
      ...COMPLETE_PROFILE,
      date_of_birth: "",
      bank_account_number: "",
    });

    renderWithQueryClient(<MyProfilePage />);

    const banner = await screen.findByTestId("missing-payroll-banner");
    expect(banner).toBeInTheDocument();
    expect(banner.textContent).toMatch(/Date of birth/);
    expect(banner.textContent).toMatch(/Bank account number/);
    /* NRIC and Bank name are filled — should NOT appear in the chip list. */
    const chips = banner.querySelectorAll("li");
    const chipTexts = Array.from(chips).map((c) => c.textContent);
    expect(chipTexts).toEqual(["Date of birth", "Bank account number"]);
  });
});
