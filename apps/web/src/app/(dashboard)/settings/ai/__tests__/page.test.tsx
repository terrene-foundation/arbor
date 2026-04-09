/* ── AIConfigPage Regression Tests ─────────────────────────

   Bug: users without a company_id saw an infinite "Loading AI settings..."
   spinner because loadConfig() returned early without clearing the loading
   flag. loadConfig's guard is:

       if (!companyId) return;   // ← never called setLoading(false)

   Since loading starts as `true`, the spinner was permanent for any user
   that registered publicly and had not joined or created a company yet.

   These tests pin:
     1. No infinite spinner when companyId is missing (reproduces the bug).
     2. Loading resolves to the config view when companyId is present.
     3. Auth still loading → spinner stays (do not prematurely show empty
        state before we know whether a company_id will arrive).

   ──────────────────────────────────────────────────────── */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

/* ── Mocks ────────────────────────────────────────────────── */

const mockUseAuth = vi.fn();
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

const mockGet = vi.fn();
const mockGetUsage = vi.fn();
vi.mock("@/services/api/llm-config", () => ({
  llmConfigApi: {
    get: (...args: unknown[]) => mockGet(...args),
    getUsage: (...args: unknown[]) => mockGetUsage(...args),
    save: vi.fn(),
    validate: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/services/api/client", () => ({
  ApiRequestError: class ApiRequestError extends Error {
    status: number;
    detail: string;
    constructor(status: number, detail: string) {
      super(detail);
      this.status = status;
      this.detail = detail;
    }
  },
}));

// Design-system stubs — the tests don't care about their internals, only
// that children render and onClick handlers fire.
vi.mock("@/components/design-system", () => ({
  AppCard: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="app-card">{children}</div>
  ),
  AppButton: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
  }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import AIConfigPage from "../page";

/* ── Tests ────────────────────────────────────────────────── */

beforeEach(() => {
  vi.clearAllMocks();
  mockGet.mockResolvedValue(null);
  mockGetUsage.mockResolvedValue(null);
});

describe("AIConfigPage — regression: loading deadlock", () => {
  it("shows the no-company empty state (not an infinite spinner) when user has no company_id", async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 2, email: "nocompany@example.com", company_id: null },
      isLoading: false,
    });

    render(<AIConfigPage />);

    // The empty state must render — NOT the "Loading AI settings..." spinner.
    await waitFor(() => {
      expect(screen.getByText("No company yet")).toBeInTheDocument();
    });

    expect(screen.queryByText(/Loading AI settings/i)).not.toBeInTheDocument();

    // llmConfigApi MUST NOT be called when there's no company.
    expect(mockGet).not.toHaveBeenCalled();
    expect(mockGetUsage).not.toHaveBeenCalled();
  });

  it("fetches config and renders the status card when the user has a company_id", async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 2, email: "hascompany@example.com", company_id: 42 },
      isLoading: false,
    });
    mockGet.mockResolvedValue(null);
    mockGetUsage.mockResolvedValue(null);

    render(<AIConfigPage />);

    await waitFor(() => {
      expect(screen.getByText("Current Status")).toBeInTheDocument();
    });

    expect(mockGet).toHaveBeenCalledWith(42);
    expect(mockGetUsage).toHaveBeenCalledWith(42);
    expect(screen.queryByText("No company yet")).not.toBeInTheDocument();
  });

  it("shows the spinner (not the empty state) while auth is still loading", () => {
    mockUseAuth.mockReturnValue({
      user: null,
      isLoading: true,
    });

    render(<AIConfigPage />);

    expect(screen.getByText(/Loading AI settings/i)).toBeInTheDocument();
    expect(screen.queryByText("No company yet")).not.toBeInTheDocument();

    // Must not fire API calls before auth resolves.
    expect(mockGet).not.toHaveBeenCalled();
  });
});
