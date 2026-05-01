/**
 * Prism Calculator Result Renderers
 *
 * Kept in a separate .tsx file so prism-calculator-configs.ts stays pure
 * TypeScript (no JSX). Each renderer reuses the bespoke ResultPanel and
 * ResultRow components from the existing /calculators route — these are
 * shared UI chrome (not Prism-specific) and reusing them is the cleanest
 * way to hit visual parity with the bespoke baseline.
 */

import type { ReactNode } from "react";
import { ResultPanel } from "@/app/(dashboard)/calculators/elements/ResultPanel";
import { ResultRow } from "@/app/(dashboard)/calculators/elements/ResultRow";
import type {
  CpfResult,
  QuotaLevyResult,
  LeaveResult,
  NoticeResult,
  OvertimeResult,
  RetrenchmentResult,
  CostToCompanyResult,
} from "./prism-calculator-types";
import { fmtMoney, fmtPct } from "./prism-calculator-utils";

// ---------------------------------------------------------------------------
// CPF
// ---------------------------------------------------------------------------

export function renderCpfResult(result: CpfResult): ReactNode {
  const { response, prYearLabel } = result;
  const notes: string[] = [];
  if (!response.cpf_applicable) {
    notes.push(
      "Employment Pass holders are not required to make CPF contributions.",
    );
  }
  if (response.ow_capped) {
    notes.push(
      `Ordinary Wage ceiling of ${fmtMoney(response.breakdown.ceilings.ow_ceiling)} per month applies. Contributions are calculated on the capped amount.`,
    );
  }
  if (response.cpf_tier.startsWith("pr_year")) {
    notes.push(
      `PR Year ${prYearLabel} graduated employer/employee rates applied.`,
    );
  }
  notes.push("Based on CPF contribution rates effective 1 January 2026.");

  if (!response.cpf_applicable) {
    return (
      <ResultPanel
        title="CPF Contribution Breakdown"
        citations={[
          { label: "CPF Act, First Schedule", authority: "statutory" },
        ]}
        advisoryQuery="What are the current CPF contribution rates and obligations for employers?"
        notes={notes}
      >
        <div className="py-4 text-center text-sm text-[var(--color-gray-600)]">
          CPF contributions are not applicable for this employee category.
        </div>
      </ResultPanel>
    );
  }

  return (
    <ResultPanel
      title="CPF Contribution Breakdown"
      citations={[{ label: "CPF Act, First Schedule", authority: "statutory" }]}
      advisoryQuery="What are the current CPF contribution rates and obligations for employers?"
      notes={notes}
    >
      <ResultRow
        label="Employer Contribution"
        value={`${fmtMoney(response.employer_contribution)} (${fmtPct(response.employer_rate)})`}
      />
      <ResultRow
        label="Employee Contribution"
        value={`${fmtMoney(response.employee_contribution)} (${fmtPct(response.employee_rate)})`}
      />
      <ResultRow
        label="Total Contribution"
        value={fmtMoney(response.total_contribution)}
        bold
        highlight
      />
      <div className="pt-2">
        <p className="text-xs font-medium text-[var(--color-gray-500)] uppercase tracking-wider pb-1">
          Account Allocation
        </p>
      </div>
      <ResultRow
        label="Ordinary Account (OA)"
        value={fmtMoney(response.allocation_oa)}
      />
      <ResultRow
        label="Special Account (SA)"
        value={fmtMoney(response.allocation_sa)}
      />
      <ResultRow
        label="MediSave Account (MA)"
        value={fmtMoney(response.allocation_ma)}
      />
    </ResultPanel>
  );
}

// ---------------------------------------------------------------------------
// Quota & Levy
// ---------------------------------------------------------------------------

export function renderQuotaLevyResult(result: QuotaLevyResult): ReactNode {
  return (
    <ResultPanel
      title="Quota & Levy Results"
      citations={[
        { label: "Employment of Foreign Manpower Act", authority: "statutory" },
        { label: "MOM Levy Schedule", authority: "guideline" },
      ]}
      advisoryQuery="What are the current foreign worker quota limits and levy rates for my sector?"
      notes={result.notes}
    >
      <ResultRow label="Total Workforce" value={result.totalWorkers.toString()} />
      <ResultRow label="Local Core (SC + PR)" value={result.localCore.toString()} />
      <ResultRow
        label="Foreign Workers (SP + WP)"
        value={result.foreignWorkers.toString()}
      />
      <ResultRow
        label="Current DRC Ratio"
        value={`${(result.currentRatio * 100).toFixed(1)}%`}
      />
      <ResultRow
        label="DRC Limit"
        value={`${(result.drcLimit * 100).toFixed(1)}%`}
      />
      <ResultRow
        label="Within Quota"
        value={result.withinLimit ? "Yes" : "No -- over limit"}
        bold
        highlight
      />
      <ResultRow
        label="Max Foreign Workers Allowed"
        value={result.wpAllowed.toString()}
      />
      <ResultRow
        label="Estimated Monthly Levy"
        value={fmtMoney(result.levyEstimate)}
        bold
      />
    </ResultPanel>
  );
}

// ---------------------------------------------------------------------------
// Leave
// ---------------------------------------------------------------------------

export function renderLeaveResult(result: LeaveResult): ReactNode {
  const { leaveType } = result;
  return (
    <ResultPanel
      title="Leave Entitlement"
      citations={[
        { label: "Employment Act, Part IV", authority: "statutory" },
        { label: "Child Development Co-Savings Act", authority: "statutory" },
      ]}
      advisoryQuery="What are the statutory leave entitlements under Singapore employment law?"
      notes={result.notes}
    >
      {(leaveType === "all" || leaveType === "annual") && (
        <ResultRow
          label="Annual Leave"
          value={`${result.annualLeave} days`}
          bold={leaveType === "annual"}
          highlight={leaveType === "annual"}
        />
      )}
      {(leaveType === "all" || leaveType === "sick") && (
        <>
          <ResultRow
            label="Outpatient Sick Leave"
            value={`${result.sickLeave} days`}
          />
          <ResultRow
            label="Hospitalisation Leave"
            value={`${result.hospitalisationLeave} days`}
            bold={leaveType === "sick"}
            highlight={leaveType === "sick"}
          />
        </>
      )}
      {(leaveType === "all" || leaveType === "parental") && (
        <>
          <ResultRow
            label="Maternity Leave"
            value={`${result.maternityLeave} days (16 weeks)`}
          />
          <ResultRow
            label="Paternity Leave"
            value={`${result.paternityLeave} days (2 weeks)`}
          />
          <ResultRow
            label="Childcare Leave"
            value={`${result.childcareLeave} days/year`}
          />
        </>
      )}
      <ResultRow label="Calculation Basis" value={result.basis} bold />
    </ResultPanel>
  );
}

// ---------------------------------------------------------------------------
// Notice Period
// ---------------------------------------------------------------------------

export function renderNoticePeriodResult(result: NoticeResult): ReactNode {
  return (
    <ResultPanel
      title="Notice Period"
      citations={[
        { label: "Employment Act, Section 10", authority: "statutory" },
      ]}
      advisoryQuery="What are the notice period requirements for termination under Singapore employment law?"
      notes={result.notes}
    >
      <ResultRow
        label="Notice Period"
        value={`${result.noticeWeeks} week${result.noticeWeeks !== 1 ? "s" : ""}`}
        bold
        highlight
      />
      <ResultRow label="Source" value={result.source} />
      <ResultRow
        label="Salary-in-Lieu"
        value={fmtMoney(result.salaryInLieu)}
        bold
      />
    </ResultPanel>
  );
}

// ---------------------------------------------------------------------------
// Overtime
// ---------------------------------------------------------------------------

export function renderOvertimeResult(result: OvertimeResult): ReactNode {
  return (
    <ResultPanel
      title="Overtime Calculation"
      citations={[{ label: "Employment Act, Part IV", authority: "statutory" }]}
      advisoryQuery="What are the overtime pay rules and eligibility criteria under Singapore law?"
      notes={result.notes}
    >
      <ResultRow
        label="OT Eligible"
        value={result.eligible ? "Yes" : "No"}
        bold
        highlight
      />
      <ResultRow label="Reason" value={result.reason} />
      <ResultRow label="OT Hours" value={`${result.otHours} hrs`} />
      <ResultRow label="Hourly Rate" value={fmtMoney(result.hourlyRate)} />
      <ResultRow label="OT Multiplier" value={`${result.otMultiplier}x`} />
      <ResultRow
        label="OT Pay"
        value={result.eligible ? fmtMoney(result.otPay) : "N/A (not eligible)"}
        bold
        highlight
      />
    </ResultPanel>
  );
}

// ---------------------------------------------------------------------------
// Retrenchment
// ---------------------------------------------------------------------------

export function renderRetrenchmentResult(result: RetrenchmentResult): ReactNode {
  return (
    <ResultPanel
      title="Retrenchment Benefit Estimate"
      citations={[
        {
          label: "Tripartite Advisory on Managing Excess Manpower",
          authority: "guideline",
        },
        { label: "MOM Retrenchment Advisory", authority: "best-practice" },
      ]}
      advisoryQuery="What are the retrenchment benefit guidelines and employer obligations in Singapore?"
      notes={result.notes}
    >
      <ResultRow
        label="Statutory Minimum"
        value="None -- advisory norms only"
        bold
      />
      <ResultRow label="Sector" value={result.sectorLabel} />
      <ResultRow
        label="Market Norm"
        value={`${result.weeksPerYear} weeks per year of service`}
      />
      <ResultRow label="Total Weeks" value={`${result.totalWeeks} weeks`} />
      <ResultRow
        label="Benefit Per Year of Service"
        value={fmtMoney(result.benefitPerYear)}
      />
      <ResultRow
        label="Estimated Total Benefit"
        value={fmtMoney(result.totalBenefit)}
        bold
        highlight
      />
    </ResultPanel>
  );
}

// ---------------------------------------------------------------------------
// Cost-to-Company
// ---------------------------------------------------------------------------

export function renderCostToCompanyResult(
  result: CostToCompanyResult,
): ReactNode {
  return (
    <ResultPanel
      title="Cost-to-Company Breakdown"
      citations={[
        { label: "CPF Act", authority: "statutory" },
        { label: "Skills Development Levy Act", authority: "statutory" },
        { label: "Employment of Foreign Manpower Act", authority: "statutory" },
        { label: "WICA", authority: "statutory" },
      ]}
      advisoryQuery="What is the full cost breakdown for hiring an employee in Singapore?"
      notes={result.notes}
    >
      <ResultRow label="Base Monthly Salary" value={fmtMoney(result.baseSalary)} />
      <ResultRow label="CPF (Employer)" value={fmtMoney(result.cpfEmployer)} />
      <ResultRow label="Foreign Worker Levy" value={fmtMoney(result.levy)} />
      <ResultRow label="SDL" value={fmtMoney(result.sdl)} />
      <ResultRow
        label="WICA Insurance (est.)"
        value={fmtMoney(result.insurance)}
      />
      <ResultRow
        label="Total Monthly Cost"
        value={fmtMoney(result.totalCost)}
        bold
        highlight
      />
      <ResultRow
        label="Total Annual Cost"
        value={fmtMoney(result.totalCost * 12)}
        bold
      />
    </ResultPanel>
  );
}
