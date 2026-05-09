/* ── Document preview — migration regression (Tier 2) ────────
   Pins behavioral parity for the TanStack Query migration of
   `documents/[id]/preview/page.tsx` per F2 + F9.

   Test tier: Tier 2 (Vitest + Testing Library + service-layer mock,
   useParams mocked).

   Specifically pins F2's invalid-id branch: with
   useQuery({ enabled: !!id && !isNaN(id) }), an invalid id yields
   `isLoading: false, error: undefined, data: undefined`. The page
   MUST render the explicit "Invalid template ID" branch — this test
   pins that contract.
   ────────────────────────────────────────────────────────────── */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithQueryClient, neverResolves } from "./_helpers";

/* ── Mocks ────────────────────────────────────────────────── */

const useParamsMock = vi.fn();
vi.mock("next/navigation", () => ({
  useParams: () => useParamsMock(),
}));

const getTemplate = vi.fn();
vi.mock("@/services/api/documents", () => ({
  documentsApi: {
    listTemplates: vi.fn(),
    getTemplate: (...args: unknown[]) => getTemplate(...args),
    generate: vi.fn(),
  },
}));

import TemplatePreviewPage from "@/app/(dashboard)/documents/[id]/preview/page";

const FIXTURE_TEMPLATE = {
  id: 7,
  name: "Notice of Termination",
  description: "Termination letter aligned with EA notice periods.",
  category: "Letters",
  version: 1,
  provisions_count: 1,
  compliance_notes: ["Notice period derived from EA Part II §10."],
  linked_provisions: ["EA-Part-II-S10"],
  required_fields: ["employee_name", "termination_date"],
  optional_fields: ["reason"],
  content: "Dear {{employee_name}}, ...",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("document preview — migration regression", () => {
  it("renders the loading copy while the template is fetching", () => {
    useParamsMock.mockReturnValue({ id: "7" });
    getTemplate.mockReturnValue(neverResolves());

    renderWithQueryClient(<TemplatePreviewPage />);

    expect(screen.getByText(/Loading template\.\.\./)).toBeInTheDocument();
  });

  it("renders the fetched template with name + version + first compliance note", async () => {
    useParamsMock.mockReturnValue({ id: "7" });
    getTemplate.mockResolvedValueOnce(FIXTURE_TEMPLATE);

    renderWithQueryClient(<TemplatePreviewPage />);

    await waitFor(() => {
      expect(screen.getByText("Notice of Termination")).toBeInTheDocument();
    });
    expect(screen.getByText("Version 1")).toBeInTheDocument();
    expect(
      screen.getByText("Notice period derived from EA Part II §10."),
    ).toBeInTheDocument();
  });

  it("renders the error branch with backend-supplied detail when fetch rejects", async () => {
    useParamsMock.mockReturnValue({ id: "999" });
    const err = new Error("Template not found") as Error & { detail?: string };
    err.detail = "Template not found";
    getTemplate.mockRejectedValueOnce(err);

    renderWithQueryClient(<TemplatePreviewPage />);

    await waitFor(() => {
      expect(screen.getByText("Template not found")).toBeInTheDocument();
    });
    /* Confirm we're in the error/back-link branch. */
    expect(screen.getByText("Back to templates")).toBeInTheDocument();
  });

  it("renders the explicit 'Invalid template ID' branch when the id is non-numeric (F2)", async () => {
    useParamsMock.mockReturnValue({ id: "not-a-number" });

    renderWithQueryClient(<TemplatePreviewPage />);

    await waitFor(() => {
      expect(screen.getByText("Invalid template ID")).toBeInTheDocument();
    });
    /* The fetch must NOT fire for an invalid id (enabled:false). */
    expect(getTemplate).not.toHaveBeenCalled();
  });
});
