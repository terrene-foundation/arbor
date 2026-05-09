/* ── ShadowMargin — Shard D S4 (b) restoration regression ──
   Pins the onOpenHistory wiring restored by Shard D S4. The
   `onOpenHistory` prop was declared in commit f163c11 ("frontend gap
   closure — ArborOverlay, ArborResult, ArborHistory") and threaded
   from the dashboard layout (apps/web/src/app/(dashboard)/layout.tsx
   line 91) but no in-component button ever invoked it. The
   ArborHistory panel was unreachable from the margin's expanded view.

   This shard adds a History icon button next to the "Ask Arbor..."
   command bar that fires onOpenHistory. The test pins the click flow.

   Test tier: Tier 2 (Vitest + RTL). ShadowMargin uses
   useShadowAgent() which we mock to provide an inert openCommand.
   The component is desktop-only (>=1024px) — we override innerWidth.
   ────────────────────────────────────────────────────────────── */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithQueryClient } from "./_helpers";

/* ── Mocks ────────────────────────────────────────────────── */

vi.mock("@/components/shadow-agent/ShadowAgentContext", () => ({
  useShadowAgent: () => ({
    openCommand: vi.fn(),
  }),
}));

import { ShadowMargin } from "@/components/shadow-agent/ShadowMargin";

const FIXTURE_INSIGHT = {
  id: "i-1",
  type: "compliance_gap" as const,
  severity: "high" as const,
  title: "MOM AR-1 due in 7 days",
  description: "Annual return filing approaching",
};

beforeEach(() => {
  /* Force desktop width — ShadowMargin no-renders below 1024px. */
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: 1280,
  });
  window.dispatchEvent(new Event("resize"));
});

describe("ShadowMargin — onOpenHistory button (S4 b-restoration)", () => {
  it("renders no history button when onOpenHistory is undefined", () => {
    renderWithQueryClient(
      <ShadowMargin insights={[FIXTURE_INSIGHT]} isLoading={false} />,
    );

    /* Expand to reveal the bottom command bar. */
    fireEvent.click(screen.getByLabelText(/expand shadow margin/i));

    expect(
      screen.queryByTestId("shadow-margin-open-history"),
    ).not.toBeInTheDocument();
  });

  it("renders the history button and fires onOpenHistory on click when provided", () => {
    const handleOpenHistory = vi.fn();
    renderWithQueryClient(
      <ShadowMargin
        insights={[FIXTURE_INSIGHT]}
        isLoading={false}
        onOpenHistory={handleOpenHistory}
      />,
    );

    /* Expand to reveal the bottom command bar. */
    fireEvent.click(screen.getByLabelText(/expand shadow margin/i));

    const historyBtn = screen.getByTestId("shadow-margin-open-history");
    expect(historyBtn).toBeInTheDocument();
    expect(historyBtn).toHaveAttribute("aria-label", "Open action history");

    fireEvent.click(historyBtn);

    expect(handleOpenHistory).toHaveBeenCalledTimes(1);
  });
});
