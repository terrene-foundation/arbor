/* ── Recruitment Kanban — Shard D S4 (b) restoration regression ──
   Pins the STAGE_STYLES wiring restored by Shard D S4. The constant
   was declared in commit 6b95704 ("Arbor v1.0") but never consumed.
   The Kanban column header showed the stage name in unstyled text;
   visually the seven stages were indistinguishable.

   Now each column header renders as a coloured badge driven by
   `STAGE_STYLES[stage]`. The test pins the per-stage class strings
   so a future "tweak the colours" refactor does not silently regress
   to plain text.

   Test tier: Tier 2 (Vitest + RTL). recruitmentApi is mocked.
   ────────────────────────────────────────────────────────────── */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithQueryClient } from "./_helpers";

/* ── Mocks ────────────────────────────────────────────────── */

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { role: "owner" } }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const listJobs = vi.fn();
const listCandidates = vi.fn();
const listInterviews = vi.fn();
vi.mock("@/services/api/recruitment", () => ({
  recruitmentApi: {
    listJobs: (...args: unknown[]) => listJobs(...args),
    listCandidates: (...args: unknown[]) => listCandidates(...args),
    listInterviews: (...args: unknown[]) => listInterviews(...args),
    createJob: vi.fn(),
    publishJob: vi.fn(),
    createCandidate: vi.fn(),
    moveStage: vi.fn(),
    hireCandidate: vi.fn(),
    scheduleInterview: vi.fn(),
  },
}));

import RecruitmentPage from "@/app/(dashboard)/recruitment/page";

const FIXTURE_CANDIDATES = [
  {
    id: 1,
    name: "Alice Tan",
    email: "alice@example.com",
    job_title: "Engineer",
    stage: "new",
    rating: 4,
  },
  {
    id: 2,
    name: "Bob Lee",
    email: "bob@example.com",
    job_title: "Engineer",
    stage: "screening",
    rating: 3,
  },
  {
    id: 3,
    name: "Carol Ng",
    email: "carol@example.com",
    job_title: "Engineer",
    stage: "offered",
    rating: 5,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  listJobs.mockResolvedValue({ jobs: [] });
  listInterviews.mockResolvedValue({ interviews: [] });
  listCandidates.mockResolvedValue({ candidates: FIXTURE_CANDIDATES });
});

describe("Recruitment Kanban — STAGE_STYLES wired (S4 b-restoration)", () => {
  it("renders each Kanban column header with its stage-specific class string", async () => {
    renderWithQueryClient(<RecruitmentPage />);

    /* Switch to the Candidates tab where the Kanban lives. */
    const candidatesTab = await screen.findByRole("button", {
      name: /candidates/i,
    });
    candidatesTab.click();

    /* Wait for the column headers (driven by data-testid). */
    await waitFor(() => {
      expect(screen.getByTestId("stage-header-new")).toBeInTheDocument();
    });

    /* Stage "new" gets blue. */
    const newHeader = screen.getByTestId("stage-header-new");
    expect(newHeader.className).toMatch(/bg-blue-50/);
    expect(newHeader.className).toMatch(/text-blue-700/);

    /* Stage "screening" gets violet. */
    const screeningHeader = screen.getByTestId("stage-header-screening");
    expect(screeningHeader.className).toMatch(/bg-violet-50/);
    expect(screeningHeader.className).toMatch(/text-violet-700/);

    /* Stage "offered" gets teal. */
    const offeredHeader = screen.getByTestId("stage-header-offered");
    expect(offeredHeader.className).toMatch(/bg-teal-50/);
    expect(offeredHeader.className).toMatch(/text-teal-700/);

    /* Stage "hired" gets emerald. */
    const hiredHeader = screen.getByTestId("stage-header-hired");
    expect(hiredHeader.className).toMatch(/bg-emerald-50/);
    expect(hiredHeader.className).toMatch(/text-emerald-700/);

    /* Stage "interview" gets amber. */
    const interviewHeader = screen.getByTestId("stage-header-interview");
    expect(interviewHeader.className).toMatch(/bg-amber-50/);
    expect(interviewHeader.className).toMatch(/text-amber-700/);
  });
});
