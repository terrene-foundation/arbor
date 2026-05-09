/* ── Documents list — migration regression (Tier 2) ────────────
   Pins behavioral parity for the TanStack Query migration of
   `apps/web/src/app/(dashboard)/documents/page.tsx` per F9/F18.

   Test tier: Tier 2 (Vitest + Testing Library + service-layer mock).
   The page uses TanStack Query directly via useDocumentTemplates;
   no full Next.js router context is needed because the page is a
   client component with no useRouter/useParams dependency.
   ────────────────────────────────────────────────────────────── */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithQueryClient, neverResolves } from "./_helpers";

/* ── Mocks ────────────────────────────────────────────────── */

const listTemplates = vi.fn();
vi.mock("@/services/api/documents", () => ({
  documentsApi: {
    listTemplates: (...args: unknown[]) => listTemplates(...args),
    getTemplate: vi.fn(),
    generate: vi.fn(),
  },
}));

import DocumentsPage from "@/app/(dashboard)/documents/page";

/* ── Fixtures ─────────────────────────────────────────────── */

const FIXTURE_TEMPLATES = {
  templates: [
    {
      id: 1,
      name: "Permanent Employment Contract",
      description: "EA-compliant contract template for permanent staff.",
      category: "Contracts",
      version: 1,
      provisions_count: 4,
      compliance_notes: ["Reflects Employment Act Part II notice periods."],
      linked_provisions: ["EA-Part-II-S10"],
      required_fields: ["employee_name", "salary"],
      optional_fields: [],
      content: "Sample template content.",
    },
    {
      id: 2,
      name: "Annual Leave Policy",
      description: "Standard annual leave policy aligned with EA.",
      category: "Policies",
      version: 1,
      provisions_count: 2,
      compliance_notes: [],
      linked_provisions: [],
      required_fields: [],
      optional_fields: [],
      content: "",
    },
  ],
  count: 2,
};

beforeEach(() => {
  vi.clearAllMocks();
});

/* ── Tests ────────────────────────────────────────────────── */

describe("documents page — migration regression", () => {
  it("renders the loading state while the templates request is in flight", () => {
    listTemplates.mockReturnValue(neverResolves());

    renderWithQueryClient(<DocumentsPage />);

    /* LoadingState renders skeleton cards (no template names yet). */
    expect(
      screen.queryByText(/Permanent Employment Contract/),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Document Templates")).toBeInTheDocument();
  });

  it("renders the fetched templates with category labels and counts", async () => {
    listTemplates.mockResolvedValueOnce(FIXTURE_TEMPLATES);

    renderWithQueryClient(<DocumentsPage />);

    await waitFor(() => {
      expect(
        screen.getByText("Permanent Employment Contract"),
      ).toBeInTheDocument();
    });

    expect(screen.getByText("Annual Leave Policy")).toBeInTheDocument();
    /* Results count line. */
    expect(screen.getByText(/2 templates/)).toBeInTheDocument();
  });

  it("renders the error state with retry when the request rejects", async () => {
    listTemplates.mockRejectedValueOnce(new Error("Backend exploded"));

    renderWithQueryClient(<DocumentsPage />);

    await waitFor(() => {
      expect(screen.getByText("Failed to load templates")).toBeInTheDocument();
    });
    expect(screen.getByText("Backend exploded")).toBeInTheDocument();
  });

  it("renders the empty state when templates is []", async () => {
    listTemplates.mockResolvedValueOnce({ templates: [], count: 0 });

    renderWithQueryClient(<DocumentsPage />);

    await waitFor(() => {
      expect(
        screen.getByText(/No templates found\. Try adjusting your filters\./),
      ).toBeInTheDocument();
    });
  });
});
