/* ── SkillsFuture Filters — Shard D S4 (b) restoration regression ──
   Pins the FUNDING_OPTIONS wiring restored by Shard D S4. The
   constant was declared in commit 7ea700c ("MCP integration layer")
   but never iterated; the funding `<select>` had its three options
   hardcoded inline, so any future change to the funding tiers had to
   edit two places that drifted independently.

   Now the select renders from FUNDING_OPTIONS.map(); the constant is
   the single source of truth.

   Test tier: Tier 2 (Vitest + RTL). Skillsfuture data hooks are
   mocked.
   ────────────────────────────────────────────────────────────── */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithQueryClient } from "./_helpers";

/* ── Mocks ────────────────────────────────────────────────── */

const useCourses = vi.fn();
const useGrant = vi.fn();
vi.mock("@/hooks/api", () => ({
  useSkillsFutureCourses: (...args: unknown[]) => useCourses(...args),
  useGrantCheck: (...args: unknown[]) => useGrant(...args),
}));

import SkillsFuturePage from "@/app/(dashboard)/training/skillsfuture/page";

beforeEach(() => {
  vi.clearAllMocks();
  useCourses.mockReturnValue({
    data: { courses: [] },
    isLoading: false,
    isError: false,
  });
  useGrant.mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
  });
});

describe("SkillsFuture filters — FUNDING_OPTIONS wired (S4 b)", () => {
  it("renders the three funding options driven by the FUNDING_OPTIONS constant", () => {
    renderWithQueryClient(<SkillsFuturePage />);

    /* Open the filter panel. */
    fireEvent.click(screen.getByRole("button", { name: /filters/i }));

    const fundingSelect = screen.getByLabelText(
      /funding/i,
    ) as HTMLSelectElement;
    const optionValues = Array.from(fundingSelect.options).map((o) => o.value);
    const optionLabels = Array.from(fundingSelect.options).map(
      (o) => o.textContent,
    );

    expect(optionValues).toEqual(["", "sfc-eligible", "grant-eligible"]);
    expect(optionLabels).toEqual([
      "Any Funding",
      "SFC Eligible",
      "Grant Eligible",
    ]);
  });
});
