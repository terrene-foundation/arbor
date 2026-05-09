/* ── EscalationDialog — Shard D S4 (b) restoration regression ──
   Pins the URGENCY_TIMEFRAMES wiring restored by Shard D S4. The map
   was declared in commit c7bf830 but never rendered; the user picked
   an urgency level with no indication of the SLA they would receive.

   Test tier: Tier 2 (Vitest + Testing Library). The dialog uses
   useAdvisoryEscalation() — we mock it to a stable inert return so
   the dialog renders synchronously.
   ────────────────────────────────────────────────────────────── */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithQueryClient } from "./_helpers";

/* ── Mocks ────────────────────────────────────────────────── */

vi.mock("@/hooks/api/useEmergency", () => ({
  useAdvisoryEscalation: () => ({
    mutate: vi.fn(),
    reset: vi.fn(),
    isPending: false,
    isError: false,
  }),
}));

import { EscalationDialog } from "@/components/advisory/EscalationDialog";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("EscalationDialog — URGENCY_TIMEFRAMES wired (S4 b-restoration)", () => {
  it("renders the urgent SLA helper text on initial render", () => {
    renderWithQueryClient(
      <EscalationDialog
        open={true}
        onClose={() => {}}
        defaultUrgency="urgent"
      />,
    );

    /* The default urgency is "urgent" → "2 business hours". */
    expect(
      screen.getByText(/Expected specialist response:.*2 business hours/i),
    ).toBeInTheDocument();
  });

  it("updates the SLA helper text when urgency changes to within-24h", () => {
    renderWithQueryClient(
      <EscalationDialog
        open={true}
        onClose={() => {}}
        defaultUrgency="urgent"
      />,
    );

    const urgencySelect = screen.getByLabelText(/how urgent is this/i);
    fireEvent.change(urgencySelect, { target: { value: "within-24h" } });

    expect(
      screen.getByText(/Expected specialist response:.*24 hours/i),
    ).toBeInTheDocument();
    /* Previous "2 business hours" copy is gone. */
    expect(
      screen.queryByText(/Expected specialist response:.*2 business hours/i),
    ).not.toBeInTheDocument();
  });

  it("renders the general-enquiry SLA when that urgency is selected", () => {
    renderWithQueryClient(
      <EscalationDialog
        open={true}
        onClose={() => {}}
        defaultUrgency="general-enquiry"
      />,
    );

    expect(
      screen.getByText(/Expected specialist response:.*3 business days/i),
    ).toBeInTheDocument();
  });
});
