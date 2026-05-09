/* ── Analytics — migration regression (Tier 2) ────────────────
   Pins behavioral parity for the TanStack Query migration of
   `analytics/page.tsx` per F9 + F12.

   Test tier: Tier 2 (Vitest + Testing Library + service-layer mock).
   The 6-fetch rewrite eliminates the dangling `reportLoading` /
   `metricsError` / `feedbackError` / `reportError` state hooks AND
   their setter calls — this test pins that the page still renders
   the correct sections in the absence of those state hooks.
   ────────────────────────────────────────────────────────────── */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithQueryClient, neverResolves } from "./_helpers";

/* ── Mocks ────────────────────────────────────────────────── */

const useAuthMock = vi.fn();
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

const workforce = vi.fn();
vi.mock("@/services/api/profile", () => ({
  profileApi: {
    workforce: (...args: unknown[]) => workforce(...args),
  },
}));

const status = vi.fn();
vi.mock("@/services/api/compliance", () => ({
  complianceApi: {
    status: (...args: unknown[]) => status(...args),
  },
}));

const adminMetrics = vi.fn();
const queryPatterns = vi.fn();
const feedbackSummary = vi.fn();
const monthlyReport = vi.fn();
vi.mock("@/services/api/admin", () => ({
  adminApi: {
    metrics: (...args: unknown[]) => adminMetrics(...args),
    queryPatterns: (...args: unknown[]) => queryPatterns(...args),
    feedbackSummary: (...args: unknown[]) => feedbackSummary(...args),
    monthlyReport: (...args: unknown[]) => monthlyReport(...args),
  },
}));

import AnalyticsPage from "@/app/(dashboard)/analytics/page";

const FIXTURE_WORKFORCE = {
  total: 88,
  local_ratio: 0.8,
  workforce: { local: 50, pr: 18, ep: 9, sp: 6, wp: 5 },
};

const FIXTURE_COMPLIANCE = {
  overall_status: "compliant",
  domains: {
    employment_act: { status: "covered", provisions_count: 8 },
    cpf: { status: "sparse", provisions_count: 2 },
  },
};

const FIXTURE_METRICS = {
  queries_tracked: 250,
  kb_provisions: 100,
  kb_domains: 5,
  kb_acts: 6,
  risk_distribution: { green: 200, amber: 30, red: 20 },
};

const FIXTURE_PATTERNS = {
  patterns: [
    { description: "CPF rates 2026", frequency: 12, domains: ["cpf"] },
    {
      description: "Notice period FAQ",
      frequency: 8,
      domains: ["employment_act"],
    },
  ],
};

const FIXTURE_FEEDBACK = {
  total_feedback: 50,
  positive_count: 40,
  negative_count: 10,
  positive_rate: 0.8,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("analytics page — migration regression", () => {
  it("renders summary skeletons while the 6 queries are in flight", () => {
    useAuthMock.mockReturnValue({ user: { company_id: 5 } });
    workforce.mockReturnValue(neverResolves());
    status.mockReturnValue(neverResolves());
    adminMetrics.mockReturnValue(neverResolves());
    queryPatterns.mockReturnValue(neverResolves());
    feedbackSummary.mockReturnValue(neverResolves());
    monthlyReport.mockReturnValue(neverResolves());

    renderWithQueryClient(<AnalyticsPage />);

    /* Header still renders during loading. */
    expect(screen.getByText("Analytics")).toBeInTheDocument();
    /* Summary card values shouldn't be visible yet. */
    expect(screen.queryByText("100")).not.toBeInTheDocument();
  });

  it("renders the four summary cards when all queries resolve", async () => {
    useAuthMock.mockReturnValue({ user: { company_id: 5 } });
    workforce.mockResolvedValueOnce(FIXTURE_WORKFORCE);
    status.mockResolvedValueOnce(FIXTURE_COMPLIANCE);
    /* Make KB provisions distinct from Total Employees so "100" is not
       ambiguous. */
    adminMetrics.mockResolvedValueOnce({
      ...FIXTURE_METRICS,
      kb_provisions: 137,
    });
    queryPatterns.mockResolvedValueOnce(FIXTURE_PATTERNS);
    feedbackSummary.mockResolvedValueOnce(FIXTURE_FEEDBACK);
    monthlyReport.mockResolvedValueOnce({ empty: true });

    renderWithQueryClient(<AnalyticsPage />);

    /* Total Employees = FIXTURE_WORKFORCE.total = 88. The DonutChart's
       inner circle ALSO renders 88, so use getAllByText. The summary
       card layout is the surface we're pinning here. */
    await waitFor(() => {
      expect(screen.getAllByText("88").length).toBeGreaterThanOrEqual(1);
    });
    /* Compliance score = 1 covered / 2 domains = 50 → "50/100". */
    expect(screen.getByText("50/100")).toBeInTheDocument();
    /* Advisory Queries cell from FIXTURE_METRICS.queries_tracked. */
    expect(screen.getByText("250")).toBeInTheDocument();
    /* KB Provisions = 137. */
    expect(screen.getByText("137")).toBeInTheDocument();
    /* The summary card labels confirm we have all 4 cards rendered. */
    expect(screen.getByText("Total Employees")).toBeInTheDocument();
    expect(screen.getByText("Compliance Score")).toBeInTheDocument();
    expect(screen.getByText("Advisory Queries")).toBeInTheDocument();
    expect(screen.getByText("KB Provisions")).toBeInTheDocument();
  });

  it("renders the no-workforce-data empty state when companyId is missing", async () => {
    useAuthMock.mockReturnValue({ user: { company_id: null } });
    /* Even with no company, metrics/patterns/feedback/report still fire. */
    adminMetrics.mockResolvedValueOnce(FIXTURE_METRICS);
    queryPatterns.mockResolvedValueOnce(FIXTURE_PATTERNS);
    feedbackSummary.mockResolvedValueOnce(FIXTURE_FEEDBACK);
    monthlyReport.mockResolvedValueOnce({ empty: true });

    renderWithQueryClient(<AnalyticsPage />);

    await waitFor(() => {
      expect(
        screen.getByText(
          /No workforce data available\. Update your company profile to see workforce analytics\./,
        ),
      ).toBeInTheDocument();
    });
    /* Workforce-scoped query did NOT fire (enabled:false). */
    expect(workforce).not.toHaveBeenCalled();
  });

  it("renders error message in workforce section when its query fails", async () => {
    useAuthMock.mockReturnValue({ user: { company_id: 5 } });
    workforce.mockRejectedValueOnce(new Error("workforce-down"));
    status.mockResolvedValueOnce(FIXTURE_COMPLIANCE);
    adminMetrics.mockResolvedValueOnce(FIXTURE_METRICS);
    queryPatterns.mockResolvedValueOnce(FIXTURE_PATTERNS);
    feedbackSummary.mockResolvedValueOnce(FIXTURE_FEEDBACK);
    monthlyReport.mockResolvedValueOnce({ empty: true });

    renderWithQueryClient(<AnalyticsPage />);

    await waitFor(() => {
      expect(
        screen.getByText("Unable to load workforce data right now."),
      ).toBeInTheDocument();
    });
  });

  it("renders the no-query-patterns empty state when patterns is []", async () => {
    useAuthMock.mockReturnValue({ user: { company_id: 5 } });
    workforce.mockResolvedValueOnce(FIXTURE_WORKFORCE);
    status.mockResolvedValueOnce(FIXTURE_COMPLIANCE);
    adminMetrics.mockResolvedValueOnce(FIXTURE_METRICS);
    queryPatterns.mockResolvedValueOnce({ patterns: [] });
    feedbackSummary.mockResolvedValueOnce({
      total_feedback: 0,
      positive_count: 0,
      negative_count: 0,
      positive_rate: 0,
    });
    monthlyReport.mockResolvedValueOnce({ empty: true });

    renderWithQueryClient(<AnalyticsPage />);

    /* Switch to advisory tab to see the patterns surface. */
    await waitFor(() => {
      expect(screen.getByText("Analytics")).toBeInTheDocument();
    });

    /* Click the Advisory tab. */
    const advisoryTab = screen.getByRole("button", { name: "Advisory" });
    advisoryTab.click();

    await waitFor(() => {
      expect(
        screen.getByText(/No query patterns recorded yet\./),
      ).toBeInTheDocument();
    });
  });
});
