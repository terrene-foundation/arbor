/* ── NavigationSidebar — Shard D S4 (b) restoration regression ──
   Pins the `collapsed` prop wiring on ExpandableNavLink. Before this
   shard, the parent's render path short-circuited
   `item.children && !collapsed` to a flat NavLink, so a collapsed
   sidebar lost the visual signal that a Management group existed —
   AND the `collapsed` param on ExpandableNavLink itself was dead.
   Now ExpandableNavLink renders an icon-only Link with tooltip when
   collapsed, matching NavLink's collapsed affordance.

   Test tier: Tier 2 (Vitest + RTL). next/link, next/navigation, and
   AuthContext are mocked.
   ────────────────────────────────────────────────────────────── */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithQueryClient } from "./_helpers";

/* ── Mocks ────────────────────────────────────────────────── */

const pathnameMock = vi.fn(() => "/dashboard");
vi.mock("next/navigation", () => ({
  usePathname: () => pathnameMock(),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...rest
  }: React.PropsWithChildren<{ href: string; [k: string]: unknown }>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { role: "owner" } }),
}));

import { NavigationSidebar } from "@/components/shell/NavigationSidebar";

beforeEach(() => {
  vi.clearAllMocks();
  pathnameMock.mockReturnValue("/dashboard");
});

describe("NavigationSidebar — collapsed render of expandable group (S4 b)", () => {
  it("renders an expandable group as a button with chevron when expanded", () => {
    renderWithQueryClient(
      <NavigationSidebar collapsed={false} onToggle={() => {}} />,
    );

    /* Payroll is the first item in adminManagementNavItems with children. */
    const payrollItem = screen.getByText("Payroll");
    expect(payrollItem).toBeInTheDocument();
    /* Its parent should be a <button> (the chevron toggle), not <a>. */
    const wrapper = payrollItem.closest("button");
    expect(wrapper).not.toBeNull();
    expect(wrapper).toHaveAttribute("aria-expanded");
  });

  it("renders an expandable group as an icon-only Link with tooltip when collapsed", () => {
    renderWithQueryClient(
      <NavigationSidebar collapsed={true} onToggle={() => {}} />,
    );

    /* The label still renders inside the tooltip span (role="tooltip"). */
    const tooltips = screen.getAllByRole("tooltip");
    const payrollTooltip = tooltips.find((t) => t.textContent === "Payroll");
    expect(payrollTooltip).toBeDefined();

    /* The whole group is an <a href="/payroll">, NOT a chevron button. */
    const link = (payrollTooltip as HTMLElement).closest("a");
    expect(link).not.toBeNull();
    expect(link).toHaveAttribute("href", "/payroll");

    /* No expand/collapse chevron button is present in this row. */
    const lis = screen.getAllByRole("listitem");
    const payrollLi = lis.find((li) => li.contains(payrollTooltip!));
    expect(payrollLi?.querySelector("button[aria-expanded]")).toBeNull();
  });
});
