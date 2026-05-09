/* ── EmployeePicker — migration regression (Tier 2) ────────────
   Pins behavioral parity for the TanStack Query migration of
   `src/components/design-system/EmployeePicker.tsx` per F9.

   Test tier: Tier 2 (Vitest + Testing Library + service-layer mock).
   The picker is a plain client component with no router/auth deps —
   wrapping with QueryClientProvider is sufficient.
   ────────────────────────────────────────────────────────────── */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithQueryClient, neverResolves } from "./_helpers";

/* ── Mocks ────────────────────────────────────────────────── */

const list = vi.fn();
vi.mock("@/services/api/employees", () => ({
  employeesApi: {
    list: (...args: unknown[]) => list(...args),
  },
}));

import { EmployeePicker } from "@/components/design-system/EmployeePicker";

const FIXTURE_LIST = {
  employees: [
    {
      id: 1,
      name: "Alice Tan",
      email: "alice@acme.test",
      department: "Engineering",
    },
    {
      id: 2,
      name: "Bob Lim",
      email: "bob@acme.test",
      department: "Operations",
    },
  ],
  count: 2,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("EmployeePicker — migration regression", () => {
  it("renders the loading placeholder while the list is in flight", () => {
    list.mockReturnValue(neverResolves());

    renderWithQueryClient(
      <EmployeePicker value={null} onChange={() => undefined} />,
    );

    expect(
      screen.getByPlaceholderText(/Loading employees\.\.\./),
    ).toBeInTheDocument();
  });

  it("hydrates the selected display when value matches a fetched employee", async () => {
    list.mockResolvedValueOnce(FIXTURE_LIST);

    renderWithQueryClient(
      <EmployeePicker value={2} onChange={() => undefined} />,
    );

    await waitFor(() => {
      expect(screen.getByText("Bob Lim")).toBeInTheDocument();
    });
    expect(screen.getByText("Operations")).toBeInTheDocument();
  });

  it("shows the picker dropdown with fetched employees on focus", async () => {
    list.mockResolvedValueOnce(FIXTURE_LIST);
    const user = userEvent.setup();

    renderWithQueryClient(
      <EmployeePicker value={null} onChange={() => undefined} />,
    );

    /* Wait for the list to load (input becomes enabled). */
    const input = await screen.findByPlaceholderText(/Search employees\.\.\./);
    await user.click(input);

    expect(screen.getByText("Alice Tan")).toBeInTheDocument();
    expect(screen.getByText("Bob Lim")).toBeInTheDocument();
  });

  it("falls back to an empty list when the request rejects (catch path)", async () => {
    list.mockRejectedValueOnce(new Error("backend down"));

    renderWithQueryClient(
      <EmployeePicker value={null} onChange={() => undefined} />,
    );

    await waitFor(() => {
      /* Input becomes enabled (loading flag flips off) even on error. */
      const input = screen.queryByPlaceholderText(/Search employees\.\.\./);
      expect(input).toBeInTheDocument();
    });
  });

  it("renders the empty list state when employees: []", async () => {
    list.mockResolvedValueOnce({ employees: [], count: 0 });
    const user = userEvent.setup();

    renderWithQueryClient(
      <EmployeePicker value={null} onChange={() => undefined} />,
    );

    const input = await screen.findByPlaceholderText(/Search employees\.\.\./);
    await user.click(input);

    expect(screen.getByText(/No employees found/)).toBeInTheDocument();
  });
});
