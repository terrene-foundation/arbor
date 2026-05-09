/* ── Signup invite validation — migration regression (Tier 2) ──
   Pins behavioral parity for the TanStack Query migration of
   `signup/page.tsx` per F9 + F13.

   Test tier: Tier 2 (Vitest + Testing Library + service-layer mock).
   The page uses useSearchParams from next/navigation — we mock it
   so we can drive the token query parameter from the test.

   Per F13 + the F21 keyword-sniff bridge, this test pins the four
   error states the page maps via the `error.message` keyword sniff:
     - "expired"            → InviteError ("expired")
     - "already been used"  → InviteError ("already_used") + login link
     - status 4xx           → InviteError ("invalid")
     - other                → InviteError ("network_error")
   ────────────────────────────────────────────────────────────── */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithQueryClient, neverResolves } from "./_helpers";

/* ── Mocks ────────────────────────────────────────────────── */

const searchParamsMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => ({
    get: (key: string) => searchParamsMock(key),
  }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    /* Echo the i18n key so we can assert presence without importing the
       real translation bundle. */
    t: (key: string) => key,
  }),
}));

const validateInvite = vi.fn();
vi.mock("@/services/api/employees", () => ({
  validateInvite: (...args: unknown[]) => validateInvite(...args),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ register: vi.fn() }),
}));

import SignupPage from "@/app/(auth)/signup/page";

const FIXTURE_INVITE = {
  email: "alice@example.com",
  company_name: "Acme Pte Ltd",
  role: "Engineer",
  status: "pending",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("signup invite-validation — migration regression", () => {
  it("renders the standard signup form when no token query param is present", async () => {
    searchParamsMock.mockReturnValue(null);

    renderWithQueryClient(<SignupPage />);

    /* Standard signup heading uses the `auth.signup_heading` key. */
    await waitFor(() => {
      expect(screen.getByText("auth.signup_heading")).toBeInTheDocument();
    });
    /* No fetch fires when token is null (enabled:false). */
    expect(validateInvite).not.toHaveBeenCalled();
  });

  it("renders the validating skeleton while the token is in flight", async () => {
    searchParamsMock.mockReturnValue("token-in-flight");
    validateInvite.mockReturnValue(neverResolves());

    renderWithQueryClient(<SignupPage />);

    await waitFor(() => {
      expect(screen.getByText("auth.invite_validating")).toBeInTheDocument();
    });
  });

  it("renders the invite acceptance form when the token validates successfully", async () => {
    searchParamsMock.mockReturnValue("token-valid");
    validateInvite.mockResolvedValueOnce(FIXTURE_INVITE);

    renderWithQueryClient(<SignupPage />);

    await waitFor(() => {
      expect(screen.getByText("auth.invite_heading")).toBeInTheDocument();
    });
    /* The acceptance form pre-fills the invite email read-only. */
    const emailInput = screen.getByDisplayValue("alice@example.com");
    expect(emailInput).toBeInTheDocument();
  });

  it("maps an 'expired' message to the 'expired' InviteError state (F21 bridge)", async () => {
    searchParamsMock.mockReturnValue("token-expired");
    validateInvite.mockRejectedValueOnce({
      status: 400,
      message: "This invitation has expired.",
    });

    renderWithQueryClient(<SignupPage />);

    await waitFor(() => {
      expect(screen.getByText("auth.invite_expired")).toBeInTheDocument();
    });
  });

  it("maps an 'already been used' message to the 'already_used' state with login link", async () => {
    searchParamsMock.mockReturnValue("token-used");
    validateInvite.mockRejectedValueOnce({
      status: 400,
      message: "This invitation has already been used.",
    });

    renderWithQueryClient(<SignupPage />);

    await waitFor(() => {
      expect(screen.getByText("auth.invite_already_used")).toBeInTheDocument();
    });
    expect(screen.getByText("auth.invite_go_to_login")).toBeInTheDocument();
  });

  it("maps a 404/400 with neutral message to the 'invalid' state", async () => {
    searchParamsMock.mockReturnValue("token-bogus");
    validateInvite.mockRejectedValueOnce({
      status: 404,
      message: "Invitation not found.",
    });

    renderWithQueryClient(<SignupPage />);

    await waitFor(() => {
      expect(screen.getByText("auth.invite_invalid")).toBeInTheDocument();
    });
  });

  it("maps a 5xx-shaped error to the 'network_error' state", async () => {
    searchParamsMock.mockReturnValue("token-5xx");
    validateInvite.mockRejectedValueOnce({
      status: 503,
      message: "Service unavailable",
    });

    renderWithQueryClient(<SignupPage />);

    await waitFor(() => {
      expect(screen.getByText("auth.invite_network_error")).toBeInTheDocument();
    });
  });
});
