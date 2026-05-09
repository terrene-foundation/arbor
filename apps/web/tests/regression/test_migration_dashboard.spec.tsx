/* ── Dashboard — migration regression (Tier 2) ─────────────────
   Pins behavioral parity for the TanStack Query migration of
   `dashboard/page.tsx` per F9.

   Test tier: Tier 2 (Vitest + Testing Library + service-layer mock).
   We mock useAuth, useShadowContext, and the service layer; we do
   not need full router context because dashboard's consumer of
   useRouter is only used in handlers, not in render.
   ────────────────────────────────────────────────────────────── */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithQueryClient, neverResolves } from "./_helpers";

/* ── Mocks ────────────────────────────────────────────────── */

const useAuthMock = vi.fn();
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const status = vi.fn();
vi.mock("@/services/api/compliance", () => ({
  complianceApi: {
    status: (...args: unknown[]) => status(...args),
  },
}));

const adminMetrics = vi.fn();
vi.mock("@/services/api/admin", () => ({
  adminApi: {
    metrics: (...args: unknown[]) => adminMetrics(...args),
  },
}));

vi.mock("@/components/shadow-agent", () => ({
  ShadowBriefingCard: ({ userName }: { userName?: string | null }) => (
    <div data-testid="briefing">briefing for {userName ?? "anon"}</div>
  ),
  useShadowContext: () => ({
    insights: [],
    isLoading: false,
  }),
}));

vi.mock("@/components/management/HRISModuleGrid", () => ({
  HRISModuleGrid: ({ hasCompany }: { hasCompany: boolean }) => (
    <div data-testid="hris-grid">hasCompany={String(hasCompany)}</div>
  ),
}));

vi.mock("@/components/company/CompanySetupModal", () => ({
  CompanySetupModal: () => null,
}));

import DashboardPage from "@/app/(dashboard)/dashboard/page";

const FIXTURE_COMPLIANCE = {
  overall_status: "compliant",
  domains: {
    employment_act: {
      status: "covered",
      provisions_count: 8,
    },
    cpf: {
      status: "sparse",
      provisions_count: 2,
    },
  },
};

const FIXTURE_METRICS = {
  queries_tracked: 42,
  kb_provisions: 137,
  kb_domains: 5,
  kb_acts: 6,
  risk_distribution: { green: 30, amber: 8, red: 4 },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("dashboard page — migration regression", () => {
  it("renders the no-company onboarding state when user has no company_id", async () => {
    useAuthMock.mockReturnValue({
      user: { name: "Alice", company_id: null },
    });

    renderWithQueryClient(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText("Welcome, Alice")).toBeInTheDocument();
    });
    expect(screen.getByText("Getting Started")).toBeInTheDocument();
    /* Compliance and metrics requests MUST NOT fire when there is no
       company_id (enabled-gating is the regression-pin here). */
    expect(status).not.toHaveBeenCalled();
  });

  it("renders the metrics skeleton while compliance + metrics are in flight", async () => {
    useAuthMock.mockReturnValue({
      user: { name: "Alice", company_id: 5 },
    });
    status.mockReturnValue(neverResolves());
    adminMetrics.mockReturnValue(neverResolves());

    renderWithQueryClient(<DashboardPage />);

    /* Briefing renders unconditionally. */
    expect(await screen.findByTestId("briefing")).toBeInTheDocument();
    /* Metric values shouldn't appear yet (data is undefined). */
    expect(screen.queryByText("42")).not.toBeInTheDocument();
  });

  it("renders compliance score + advisory queries when data resolves", async () => {
    useAuthMock.mockReturnValue({
      user: { name: "Alice", company_id: 5 },
    });
    status.mockResolvedValueOnce(FIXTURE_COMPLIANCE);
    adminMetrics.mockResolvedValueOnce(FIXTURE_METRICS);

    renderWithQueryClient(<DashboardPage />);

    await waitFor(() => {
      /* Score = 1 covered out of 2 domains = 50% → "50/100". */
      expect(screen.getByText("50/100")).toBeInTheDocument();
    });
    expect(screen.getByText("42")).toBeInTheDocument(); // advisory queries
    expect(screen.getByText(/137 provisions in KB/)).toBeInTheDocument();
  });

  it("renders the error message when both compliance and metrics requests fail", async () => {
    useAuthMock.mockReturnValue({
      user: { name: "Alice", company_id: 5 },
    });
    status.mockRejectedValueOnce(new Error("compliance down"));
    adminMetrics.mockRejectedValueOnce(new Error("metrics down"));

    renderWithQueryClient(<DashboardPage />);

    await waitFor(() => {
      expect(
        screen.getByText(/Unable to load dashboard data/),
      ).toBeInTheDocument();
    });
  });

  it("renders an empty pending-actions panel when no domains need attention", async () => {
    useAuthMock.mockReturnValue({
      user: { name: "Alice", company_id: 5 },
    });
    status.mockResolvedValueOnce({
      overall_status: "compliant",
      domains: {
        employment_act: { status: "covered", provisions_count: 5 },
      },
    });
    adminMetrics.mockResolvedValueOnce(FIXTURE_METRICS);

    renderWithQueryClient(<DashboardPage />);

    await waitFor(() => {
      expect(
        screen.getByText(
          /No pending actions\. All compliance domains are covered\./,
        ),
      ).toBeInTheDocument();
    });
  });
});
