/**
 * Prism Calculator Configs — declarative schema for the calculators-prism pilot.
 *
 * One entry per HR calculator. Each entry exposes:
 *   - title, description — page header text
 *   - fields: FieldDef[] — Prism Form schema
 *   - compute(values) — real calculation (HTTP call for CPF, local tables for the rest;
 *     the local-table calculators are authoritative because the bespoke /calculators
 *     route also computes them client-side — there is no backend for them)
 *   - renderResult(values, result) — how the result panel is drawn
 *
 * This file is the "declarative heart" of the M-01 migration: the -prism routes
 * read from here, look up the calculator by slug, render a Prism <Form>, run
 * compute, and render the result. See migration-m01-findings.md for gaps
 * discovered during authoring.
 *
 * Spec: docs/specs/05-engine-specifications.md § 5.2 (Form engine)
 */

import { calculatorsApi } from "@/services/api/calculators";
import type { CpfCalculationRequest } from "@/types/api";
import type {
  CalculatorConfig,
  CalculatorType,
  CpfResult,
  QuotaLevyResult,
  LeaveResult,
  NoticeResult,
  OvertimeResult,
  RetrenchmentResult,
  CostToCompanyResult,
} from "./prism-calculator-types";
import { isCalculatorType } from "./prism-calculator-types";
import { asNumber, asString } from "./prism-calculator-utils";
import {
  renderCpfResult,
  renderQuotaLevyResult,
  renderLeaveResult,
  renderNoticePeriodResult,
  renderOvertimeResult,
  renderRetrenchmentResult,
  renderCostToCompanyResult,
} from "./prism-calculator-results";

// Re-export types/constants for convenience of page consumers.
export type {
  CalculatorConfig,
  CalculatorType,
  CalculatorResult,
} from "./prism-calculator-types";
export {
  CALCULATOR_TYPES,
  isCalculatorType,
} from "./prism-calculator-types";

/** Require a number field; throw a typed error if missing so Form surfaces it. */
function requireNumber(
  values: Record<string, unknown>,
  name: string,
  label: string,
): number {
  const n = asNumber(values[name]);
  if (n === undefined || !Number.isFinite(n)) {
    throw new Error(`${label} is required and must be a number.`);
  }
  return n;
}

// ---------------------------------------------------------------------------
// CPF calculator — real HTTP API
// ---------------------------------------------------------------------------

const cpfConfig: CalculatorConfig<CpfResult> = {
  title: "CPF Contributions",
  description:
    "Calculate employer and employee CPF contributions by age and citizenship status.",
  submitLabel: "Calculate CPF",
  fields: [
    {
      name: "salary",
      type: "number",
      label: "Monthly Gross Salary ($)",
      placeholder: "e.g. 5000",
      required: true,
      min: 0,
      step: 100,
      validation: [
        { rule: "min", value: 1, message: "Salary must be greater than 0." },
      ],
    },
    {
      name: "age",
      type: "number",
      label: "Employee Age",
      placeholder: "e.g. 30",
      required: true,
      min: 16,
      max: 100,
      validation: [
        { rule: "min", value: 16, message: "Employee must be at least 16." },
        { rule: "max", value: 100, message: "Age must be 100 or less." },
      ],
    },
    {
      name: "citizenship",
      type: "select",
      label: "Citizenship Status",
      required: true,
      defaultValue: "sc",
      options: [
        { value: "sc", label: "Singapore Citizen" },
        { value: "pr", label: "Permanent Resident" },
        { value: "ep", label: "Employment Pass" },
      ],
    },
    {
      name: "prYear",
      type: "select",
      label: "PR Year",
      helpText: "Graduated rates apply in years 1-2",
      defaultValue: "1",
      options: [
        { value: "1", label: "1st Year" },
        { value: "2", label: "2nd Year" },
        { value: "3", label: "3rd Year onwards" },
      ],
      // CONDITION: only visible when citizenship === "pr"
      visible: { field: "citizenship", operator: "equals", value: "pr" },
    },
  ],
  async compute(values) {
    const salary = requireNumber(values, "salary", "Monthly Gross Salary");
    const age = requireNumber(values, "age", "Employee Age");
    const citizenship = asString(values["citizenship"]);
    const prYearStr = asString(values["prYear"]);
    const request: CpfCalculationRequest = {
      gross_salary: salary,
      employee_age: Math.floor(age),
      citizenship_status: citizenship,
      pr_year:
        citizenship === "pr" && prYearStr ? parseInt(prYearStr, 10) : null,
    };
    // Real backend call. Throws on HTTP error; Form's error banner surfaces it.
    const response = await calculatorsApi.cpf(request);
    const prYearLabels: Record<string, string> = {
      "1": "1",
      "2": "2",
      "3": "3+",
    };
    return {
      request,
      response,
      prYearLabel: prYearLabels[prYearStr] ?? prYearStr,
    };
  },
  renderResult(_values, result) {
    return renderCpfResult(result);
  },
};

// ---------------------------------------------------------------------------
// Quota & Levy calculator — real local computation (no backend exists)
// ---------------------------------------------------------------------------

interface QuotaLevySectorConfig {
  label: string;
  drcLimit: number;
  sPassSubDrc: number;
  levyTier1: number;
  levyTier2: number;
  levyTier1Threshold: number;
}

const QUOTA_LEVY_SECTORS: Record<string, QuotaLevySectorConfig> = {
  manufacturing: {
    label: "Manufacturing",
    drcLimit: 0.6,
    sPassSubDrc: 0.15,
    levyTier1: 300,
    levyTier2: 600,
    levyTier1Threshold: 0.25,
  },
  services: {
    label: "Services",
    drcLimit: 0.35,
    sPassSubDrc: 0.1,
    levyTier1: 300,
    levyTier2: 600,
    levyTier1Threshold: 0.15,
  },
  construction: {
    label: "Construction",
    drcLimit: 0.8338,
    sPassSubDrc: 0.15,
    levyTier1: 300,
    levyTier2: 700,
    levyTier1Threshold: 0.25,
  },
  marine: {
    label: "Marine Shipyard",
    drcLimit: 0.7778,
    sPassSubDrc: 0.15,
    levyTier1: 300,
    levyTier2: 400,
    levyTier1Threshold: 0.25,
  },
  process: {
    label: "Process",
    drcLimit: 0.8338,
    sPassSubDrc: 0.15,
    levyTier1: 300,
    levyTier2: 600,
    levyTier1Threshold: 0.25,
  },
};

const quotaLevyConfig: CalculatorConfig<QuotaLevyResult> = {
  title: "Quota & Levy",
  description:
    "Check foreign worker quota ratios and estimate monthly levies by sector.",
  submitLabel: "Calculate Quota & Levy",
  sections: [{ name: "headcount", title: "Headcount Breakdown" }],
  fields: [
    {
      name: "sector",
      type: "select",
      label: "Sector",
      required: true,
      defaultValue: "services",
      span: 2,
      options: Object.entries(QUOTA_LEVY_SECTORS).map(([k, v]) => ({
        value: k,
        label: v.label,
      })),
    },
    {
      name: "localCount",
      type: "number",
      label: "Local (SC)",
      placeholder: "0",
      section: "headcount",
      min: 0,
      defaultValue: 0,
    },
    {
      name: "prCount",
      type: "number",
      label: "PR",
      placeholder: "0",
      section: "headcount",
      min: 0,
      defaultValue: 0,
    },
    {
      name: "epCount",
      type: "number",
      label: "EP",
      placeholder: "0",
      section: "headcount",
      min: 0,
      defaultValue: 0,
    },
    {
      name: "spCount",
      type: "number",
      label: "S Pass",
      placeholder: "0",
      section: "headcount",
      min: 0,
      defaultValue: 0,
    },
    {
      name: "wpCount",
      type: "number",
      label: "Work Permit",
      placeholder: "0",
      section: "headcount",
      min: 0,
      defaultValue: 0,
    },
  ],
  async compute(values) {
    const local = asNumber(values["localCount"]) ?? 0;
    const pr = asNumber(values["prCount"]) ?? 0;
    const ep = asNumber(values["epCount"]) ?? 0;
    const sp = asNumber(values["spCount"]) ?? 0;
    const wp = asNumber(values["wpCount"]) ?? 0;
    if (local + pr + ep + sp + wp === 0) {
      throw new Error("Enter at least one worker in any category.");
    }
    const sectorKey = asString(values["sector"]);
    const config = QUOTA_LEVY_SECTORS[sectorKey];
    if (!config) throw new Error(`Unknown sector: ${sectorKey}`);

    const localCore = local + pr;
    const foreignWorkers = sp + wp;
    const totalWorkers = localCore + ep + foreignWorkers;
    const currentRatio =
      localCore > 0
        ? foreignWorkers / localCore
        : foreignWorkers > 0
          ? Infinity
          : 0;
    const drcLimit = config.drcLimit;
    const maxForeign =
      drcLimit < 1 ? Math.floor(localCore * (drcLimit / (1 - drcLimit))) : 0;
    const withinLimit = foreignWorkers <= maxForeign;

    let levyEstimate = 0;
    const tier1Max = Math.floor(localCore * config.levyTier1Threshold);
    const wpInTier1 = Math.min(wp, tier1Max);
    const wpInTier2 = Math.max(0, wp - tier1Max);
    levyEstimate += wpInTier1 * config.levyTier1;
    levyEstimate += wpInTier2 * config.levyTier2;
    levyEstimate += sp * 450;

    const notes: string[] = [];
    notes.push(
      `${config.label} sector DRC limit: ${(drcLimit * 100).toFixed(1)}%. Maximum foreign workers for your local core: ${maxForeign}.`,
    );
    if (!withinLimit) {
      notes.push(
        "Your current foreign worker count exceeds the DRC limit. You may need to reduce foreign headcount or hire more local workers.",
      );
    }
    notes.push(
      "Levy estimates are approximate. Actual levy rates depend on worker qualifications and MOM assessment.",
    );

    return {
      totalWorkers,
      localCore,
      foreignWorkers,
      currentRatio: Number.isFinite(currentRatio) ? currentRatio : 0,
      drcLimit,
      withinLimit,
      wpAllowed: maxForeign,
      levyEstimate,
      sectorLabel: config.label,
      notes,
    };
  },
  renderResult(_values, result) {
    return renderQuotaLevyResult(result);
  },
};

// ---------------------------------------------------------------------------
// Leave Entitlement calculator — real local computation
// ---------------------------------------------------------------------------

function getAnnualLeave(yearsOfService: number): number {
  if (yearsOfService < 1) return 0;
  if (yearsOfService === 1) return 7;
  if (yearsOfService === 2) return 8;
  if (yearsOfService === 3) return 9;
  if (yearsOfService === 4) return 10;
  if (yearsOfService === 5) return 11;
  if (yearsOfService === 6) return 12;
  if (yearsOfService === 7) return 13;
  return 14;
}

const leaveConfig: CalculatorConfig<LeaveResult> = {
  title: "Leave Entitlement",
  description: "Find statutory leave entitlements based on years of service.",
  submitLabel: "Calculate Leave",
  fields: [
    {
      name: "years",
      type: "number",
      label: "Years of Service",
      placeholder: "e.g. 3",
      required: true,
      min: 0,
      step: 0.5,
      helpText: "Enter 0.5 for 6 months, etc.",
      validation: [
        {
          rule: "min",
          value: 0,
          message: "Years of service cannot be negative.",
        },
      ],
    },
    {
      name: "empType",
      type: "select",
      label: "Employment Type",
      required: true,
      defaultValue: "full-time",
      options: [
        { value: "full-time", label: "Full-Time" },
        { value: "part-time", label: "Part-Time" },
      ],
    },
    {
      name: "leaveType",
      type: "select",
      label: "Leave Category",
      required: true,
      defaultValue: "all",
      span: 2,
      options: [
        { value: "all", label: "All Leave Types" },
        { value: "annual", label: "Annual Leave Only" },
        { value: "sick", label: "Sick & Hospitalisation Leave" },
        { value: "parental", label: "Parental Leave" },
      ],
    },
  ],
  async compute(values) {
    const years = requireNumber(values, "years", "Years of Service");
    const empType = asString(values["empType"]);
    const leaveType = asString(values["leaveType"]);

    const annualLeave = getAnnualLeave(Math.floor(years));
    const sickLeave = years >= 0.5 ? 14 : Math.floor(years * 2 * 14);
    const hospitalisationLeave =
      years >= 0.5 ? 60 : Math.floor(years * 2 * 60);
    const maternityLeave = 16 * 7;
    const paternityLeave = 14;
    const childcareLeave = years >= 0.25 ? 6 : 0;

    const notes: string[] = [];
    let basis = "Employment Act, Part IV";
    if (empType === "part-time") {
      basis =
        "Employment Act, Part IV + Employment (Part-Time Employees) Regulations";
      notes.push(
        "Part-time employees receive pro-rated leave based on hours worked relative to a comparable full-time employee.",
      );
    }
    if (years < 0.25) {
      notes.push(
        "Employees with less than 3 months of service are not entitled to statutory leave benefits.",
      );
    } else if (years < 1) {
      notes.push(
        "Employees in their first year are entitled to pro-rated annual leave after completing 3 months.",
      );
    }
    notes.push(
      "Sick leave and hospitalisation leave entitlements require at least 6 months of service for full entitlement.",
    );
    notes.push(
      "Maternity leave of 16 weeks applies to female employees who have served at least 3 months. Government co-funds the last 8 weeks.",
    );

    return {
      annualLeave,
      sickLeave,
      hospitalisationLeave,
      maternityLeave,
      paternityLeave,
      childcareLeave,
      basis,
      notes,
      leaveType,
    };
  },
  renderResult(_values, result) {
    return renderLeaveResult(result);
  },
};

// ---------------------------------------------------------------------------
// Notice Period calculator
// ---------------------------------------------------------------------------

function getStatutoryNoticeWeeks(yearsOfService: number): number {
  if (yearsOfService < 0.5) return 1;
  if (yearsOfService < 2) return 1;
  if (yearsOfService < 5) return 2;
  return 4;
}

const noticePeriodConfig: CalculatorConfig<NoticeResult> = {
  title: "Notice Period",
  description: "Determine notice period and salary in lieu of notice.",
  submitLabel: "Calculate Notice Period",
  fields: [
    {
      name: "years",
      type: "number",
      label: "Years of Service",
      placeholder: "e.g. 3",
      required: true,
      min: 0,
      step: 0.5,
      validation: [
        {
          rule: "min",
          value: 0,
          message: "Years of service cannot be negative.",
        },
      ],
    },
    {
      name: "salary",
      type: "number",
      label: "Monthly Salary ($)",
      placeholder: "e.g. 4000",
      required: true,
      min: 0,
      validation: [
        { rule: "min", value: 1, message: "Salary must be greater than 0." },
      ],
    },
    {
      name: "contractualWeeks",
      type: "number",
      label: "Contractual Notice (weeks)",
      placeholder: "Leave blank if none",
      min: 0,
      helpText: "If your contract specifies a notice period",
    },
    {
      name: "terminator",
      type: "select",
      label: "Who is Terminating?",
      required: true,
      defaultValue: "employer",
      options: [
        { value: "employer", label: "Employer" },
        { value: "employee", label: "Employee" },
      ],
    },
  ],
  async compute(values) {
    const years = requireNumber(values, "years", "Years of Service");
    const salary = requireNumber(values, "salary", "Monthly Salary");
    const contractualRaw = asNumber(values["contractualWeeks"]);
    const contractWeeks =
      contractualRaw !== undefined && contractualRaw > 0
        ? Math.floor(contractualRaw)
        : 0;
    const terminator = asString(values["terminator"]);

    const statutoryWeeks = getStatutoryNoticeWeeks(years);
    const effectiveNoticeWeeks =
      contractWeeks > 0 && contractWeeks >= statutoryWeeks
        ? contractWeeks
        : statutoryWeeks;
    const source =
      contractWeeks > 0 && contractWeeks >= statutoryWeeks
        ? `Contract (${contractWeeks} weeks)`
        : `Employment Act, s10 (${statutoryWeeks} weeks)`;

    const weeklyRate = salary / 4;
    const salaryInLieu =
      Math.round(weeklyRate * effectiveNoticeWeeks * 100) / 100;

    const notes: string[] = [];
    if (contractWeeks > 0 && contractWeeks < statutoryWeeks) {
      notes.push(
        `Your contractual notice period (${contractWeeks} weeks) is shorter than the statutory minimum (${statutoryWeeks} weeks). The statutory minimum applies.`,
      );
    }
    if (terminator === "employer") {
      notes.push(
        "The employer must give the employee the required notice or pay salary-in-lieu. The employee may waive notice.",
      );
    } else {
      notes.push(
        "The employee must give the employer the required notice or pay salary-in-lieu. The employer may waive notice.",
      );
    }
    notes.push(
      "During probation, notice period is typically 1 week or as stated in the contract. Check your employment contract.",
    );
    notes.push(
      "Based on Employment Act, Section 10. Applies to employees covered under Part IV of the Employment Act.",
    );

    return {
      noticeWeeks: effectiveNoticeWeeks,
      source,
      salaryInLieu,
      notes,
    };
  },
  renderResult(_values, result) {
    return renderNoticePeriodResult(result);
  },
};

// ---------------------------------------------------------------------------
// Overtime calculator
// ---------------------------------------------------------------------------

const OT_SALARY_CAP_WORKMAN = 4500;
const OT_SALARY_CAP_NON_WORKMAN = 2600;

const overtimeConfig: CalculatorConfig<OvertimeResult> = {
  title: "Overtime Pay",
  description: "Check Part IV eligibility and calculate overtime pay rates.",
  submitLabel: "Calculate Overtime",
  fields: [
    {
      name: "salary",
      type: "number",
      label: "Monthly Salary ($)",
      placeholder: "e.g. 2400",
      required: true,
      min: 0,
      validation: [
        { rule: "min", value: 1, message: "Salary must be greater than 0." },
      ],
    },
    {
      name: "isWorkman",
      type: "select",
      label: "Is the Employee a Workman?",
      required: true,
      defaultValue: "yes",
      options: [
        { value: "yes", label: "Yes (manual labour, driver, etc.)" },
        { value: "no", label: "No (PME / office worker)" },
      ],
    },
    {
      name: "hoursWorked",
      type: "number",
      label: "Total Hours Worked (week)",
      placeholder: "e.g. 50",
      required: true,
      min: 0,
      validation: [
        {
          rule: "min",
          value: 0,
          message: "Hours worked cannot be negative.",
        },
      ],
    },
    {
      name: "normalHours",
      type: "number",
      label: "Normal Weekly Hours",
      placeholder: "44",
      required: true,
      min: 1,
      defaultValue: 44,
      helpText: "Default is 44 hours",
    },
    {
      name: "dayType",
      type: "select",
      label: "Day Type",
      required: true,
      defaultValue: "normal",
      span: 2,
      options: [
        { value: "normal", label: "Normal Working Day" },
        { value: "rest-day", label: "Rest Day" },
        { value: "public-holiday", label: "Public Holiday" },
      ],
    },
  ],
  async compute(values) {
    const salary = requireNumber(values, "salary", "Monthly Salary");
    const hoursWorked = requireNumber(
      values,
      "hoursWorked",
      "Total Hours Worked",
    );
    const normalHours = requireNumber(
      values,
      "normalHours",
      "Normal Weekly Hours",
    );
    const isWorkman = asString(values["isWorkman"]) === "yes";
    const dayType = asString(values["dayType"]);

    const cap = isWorkman ? OT_SALARY_CAP_WORKMAN : OT_SALARY_CAP_NON_WORKMAN;
    const eligible = salary <= cap;

    const reason = eligible
      ? isWorkman
        ? `Workman earning $${salary.toLocaleString()} (cap: $${cap.toLocaleString()})`
        : `Non-workman earning $${salary.toLocaleString()} (cap: $${cap.toLocaleString()})`
      : isWorkman
        ? `Workman salary exceeds $${cap.toLocaleString()} cap`
        : `Non-workman salary exceeds $${cap.toLocaleString()} cap`;

    const otHours = Math.max(0, hoursWorked - normalHours);
    const computeSalary = eligible ? salary : Math.min(salary, cap);
    const hourlyRate = computeSalary / (normalHours * (52 / 12));

    let otMultiplier: number;
    switch (dayType) {
      case "rest-day":
        otMultiplier = 2.0;
        break;
      case "public-holiday":
        otMultiplier = 2.0;
        break;
      default:
        otMultiplier = 1.5;
    }

    const otPay = eligible
      ? Math.round(otHours * hourlyRate * otMultiplier * 100) / 100
      : 0;

    const notes: string[] = [];
    if (!eligible) {
      notes.push(
        `Employee salary ($${salary.toLocaleString()}) exceeds the overtime eligibility cap of $${cap.toLocaleString()}. OT pay is not mandatory under the Employment Act.`,
      );
    }
    if (isWorkman) {
      notes.push(
        "Workmen include manual labour workers, drivers, cleaners, and similar roles as defined under the Employment Act.",
      );
    }
    if (dayType === "rest-day") {
      notes.push(
        "Work on a rest day attracts 2x pay rate for overtime hours. The basic pay for the rest day itself may also apply.",
      );
    }
    if (dayType === "public-holiday") {
      notes.push(
        "Work on a public holiday attracts 2x pay rate for overtime hours, in addition to the basic holiday pay.",
      );
    }
    notes.push(
      "Maximum OT is 72 hours per month. Based on Employment Act, Part IV.",
    );

    return {
      eligible,
      reason,
      otHours,
      hourlyRate: Math.round(hourlyRate * 100) / 100,
      otMultiplier,
      otPay,
      notes,
    };
  },
  renderResult(_values, result) {
    return renderOvertimeResult(result);
  },
};

// ---------------------------------------------------------------------------
// Retrenchment calculator
// ---------------------------------------------------------------------------

interface RetrenchmentSectorNorm {
  label: string;
  weeksPerYear: number;
  note: string;
}

const RETRENCHMENT_SECTOR_NORMS: Record<string, RetrenchmentSectorNorm> = {
  services: {
    label: "Services",
    weeksPerYear: 2,
    note: "Services sector norm: 2 weeks of salary per year of service.",
  },
  manufacturing: {
    label: "Manufacturing",
    weeksPerYear: 2,
    note: "Manufacturing sector norm: 2 weeks of salary per year of service.",
  },
  construction: {
    label: "Construction",
    weeksPerYear: 1.5,
    note: "Construction sector norm: 1.5 weeks of salary per year of service.",
  },
  technology: {
    label: "Technology",
    weeksPerYear: 3,
    note: "Technology sector norm: 3 weeks of salary per year of service.",
  },
  finance: {
    label: "Finance",
    weeksPerYear: 3,
    note: "Finance sector norm: 3 weeks of salary per year of service.",
  },
  other: {
    label: "Other",
    weeksPerYear: 2,
    note: "Default market norm: 2 weeks of salary per year of service.",
  },
};

const retrenchmentConfig: CalculatorConfig<RetrenchmentResult> = {
  title: "Retrenchment Benefit",
  description: "Estimate retrenchment benefits based on market norms.",
  submitLabel: "Calculate Retrenchment",
  fields: [
    {
      name: "years",
      type: "number",
      label: "Years of Service",
      placeholder: "e.g. 5",
      required: true,
      min: 0,
      step: 0.5,
      validation: [
        {
          rule: "min",
          value: 0.1,
          message: "Years of service must be greater than 0.",
        },
      ],
    },
    {
      name: "salary",
      type: "number",
      label: "Monthly Salary ($)",
      placeholder: "e.g. 4000",
      required: true,
      min: 0,
      validation: [
        { rule: "min", value: 1, message: "Salary must be greater than 0." },
      ],
    },
    {
      name: "sector",
      type: "select",
      label: "Sector",
      required: true,
      defaultValue: "services",
      span: 2,
      helpText: "Sector norms affect the typical benefit rate",
      options: Object.entries(RETRENCHMENT_SECTOR_NORMS).map(([k, v]) => ({
        value: k,
        label: v.label,
      })),
    },
  ],
  async compute(values) {
    const years = requireNumber(values, "years", "Years of Service");
    const salary = requireNumber(values, "salary", "Monthly Salary");
    const sectorKey = asString(values["sector"]);
    const norm = RETRENCHMENT_SECTOR_NORMS[sectorKey];
    if (!norm) throw new Error(`Unknown sector: ${sectorKey}`);

    const weeksPerYear = norm.weeksPerYear;
    const totalWeeks = weeksPerYear * years;
    const weeklyRate = salary / 4;
    const benefitPerYear = Math.round(weeklyRate * weeksPerYear * 100) / 100;
    const totalBenefit = Math.round(weeklyRate * totalWeeks * 100) / 100;

    const notes: string[] = [];
    if (years < 2) {
      notes.push(
        "Employees with less than 2 years of service are generally not entitled to retrenchment benefits under tripartite guidelines, though some employers may still provide them.",
      );
    }
    notes.push(norm.note);
    notes.push(
      "Retrenchment benefits are not mandated by law in Singapore. The amounts shown are based on market norms and tripartite advisory guidelines.",
    );
    notes.push(
      "Employers must notify MOM of retrenchments if retrenching 5 or more employees within 6 months.",
    );

    return {
      weeksPerYear,
      totalWeeks,
      benefitPerYear,
      totalBenefit,
      sectorLabel: norm.label,
      notes,
    };
  },
  renderResult(_values, result) {
    return renderRetrenchmentResult(result);
  },
};

// ---------------------------------------------------------------------------
// Cost-to-Company calculator
// ---------------------------------------------------------------------------

function getCtcEmployerCpfRate(
  age: number,
  citizenship: string,
  prYear: number,
): number {
  if (citizenship === "ep" || citizenship === "sp" || citizenship === "wp") {
    return 0;
  }
  if (citizenship === "pr" && prYear === 1) return 0.04;
  if (citizenship === "pr" && prYear === 2) return 0.09;
  if (age <= 55) return 0.17;
  if (age <= 60) return 0.15;
  if (age <= 65) return 0.115;
  if (age <= 70) return 0.085;
  return 0.075;
}

interface CtcSectorLevy {
  label: string;
  wpLevy: number;
  spLevy: number;
}

const CTC_SECTOR_LEVIES: Record<string, CtcSectorLevy> = {
  services: { label: "Services", wpLevy: 450, spLevy: 550 },
  manufacturing: { label: "Manufacturing", wpLevy: 450, spLevy: 550 },
  construction: { label: "Construction", wpLevy: 450, spLevy: 550 },
  technology: { label: "Technology", wpLevy: 450, spLevy: 550 },
  finance: { label: "Finance", wpLevy: 450, spLevy: 550 },
};

const CTC_SDL_RATE = 0.0025;
const CTC_SDL_MIN = 2;
const CTC_SDL_MAX = 11.25;

function calculateCtcSdl(salary: number): number {
  const sdl = salary * CTC_SDL_RATE;
  if (sdl < CTC_SDL_MIN) return CTC_SDL_MIN;
  if (sdl > CTC_SDL_MAX) return CTC_SDL_MAX;
  return Math.round(sdl * 100) / 100;
}

const costToCompanyConfig: CalculatorConfig<CostToCompanyResult> = {
  title: "Cost-to-Company",
  description:
    "See the full employment cost breakdown including CPF, levies, and SDL.",
  submitLabel: "Calculate Total Cost",
  fields: [
    {
      name: "salary",
      type: "number",
      label: "Monthly Salary ($)",
      placeholder: "e.g. 5000",
      required: true,
      min: 0,
      validation: [
        { rule: "min", value: 1, message: "Salary must be greater than 0." },
      ],
    },
    {
      name: "citizenship",
      type: "select",
      label: "Citizenship Status",
      required: true,
      defaultValue: "sc",
      options: [
        { value: "sc", label: "Singapore Citizen" },
        { value: "pr", label: "Permanent Resident" },
        { value: "ep", label: "Employment Pass" },
        { value: "sp", label: "S Pass" },
        { value: "wp", label: "Work Permit" },
      ],
    },
    {
      name: "age",
      type: "number",
      label: "Employee Age",
      placeholder: "e.g. 30",
      required: true,
      min: 16,
      max: 100,
      defaultValue: 30,
      helpText: "Affects CPF employer contribution rate",
    },
    {
      name: "prYear",
      type: "select",
      label: "PR Year",
      defaultValue: "3",
      helpText: "Graduated CPF rates apply in years 1-2",
      options: [
        { value: "1", label: "1st Year" },
        { value: "2", label: "2nd Year" },
        { value: "3", label: "3rd Year onwards" },
      ],
      // CONDITION: only visible when citizenship === "pr"
      visible: { field: "citizenship", operator: "equals", value: "pr" },
    },
    {
      name: "sector",
      type: "select",
      label: "Sector",
      required: true,
      defaultValue: "services",
      span: 2,
      helpText: "Affects foreign worker levy rates",
      options: Object.entries(CTC_SECTOR_LEVIES).map(([k, v]) => ({
        value: k,
        label: v.label,
      })),
    },
  ],
  async compute(values) {
    const salary = requireNumber(values, "salary", "Monthly Salary");
    const age = requireNumber(values, "age", "Employee Age");
    const citizenship = asString(values["citizenship"]);
    const prYear = parseInt(asString(values["prYear"]) || "3", 10);
    const sectorKey = asString(values["sector"]);
    const sectorConfig = CTC_SECTOR_LEVIES[sectorKey];
    if (!sectorConfig) throw new Error(`Unknown sector: ${sectorKey}`);

    const cpfCeiling = 6800;
    const cappedSalary = Math.min(salary, cpfCeiling);
    const cpfRate = getCtcEmployerCpfRate(age, citizenship, prYear);
    const cpfEmployer = Math.round(cappedSalary * cpfRate * 100) / 100;

    let levy = 0;
    if (citizenship === "wp") levy = sectorConfig.wpLevy;
    else if (citizenship === "sp") levy = sectorConfig.spLevy;

    const sdl = calculateCtcSdl(salary);
    const isForeign = citizenship !== "sc" && citizenship !== "pr";
    const insurance = isForeign ? 15 : 0;

    const totalCost =
      Math.round((salary + cpfEmployer + levy + sdl + insurance) * 100) / 100;

    const notes: string[] = [];
    if (citizenship === "sc" || citizenship === "pr") {
      notes.push(
        `CPF employer contribution at ${(cpfRate * 100).toFixed(1)}% on salary capped at $${cpfCeiling.toLocaleString()}.`,
      );
    }
    if (citizenship === "pr") {
      notes.push(
        `PR Year ${prYear} graduated employer CPF rate of ${(cpfRate * 100).toFixed(1)}% applied.`,
      );
    }
    if (citizenship === "wp" || citizenship === "sp") {
      notes.push(
        `Foreign worker levy of $${levy}/month applies for ${citizenship.toUpperCase()} holders.`,
      );
    }
    notes.push(
      `Skills Development Levy (SDL) of $${sdl.toFixed(2)}/month (0.25% of salary, min $2, max $11.25).`,
    );
    if (isForeign) {
      notes.push(
        "WICA insurance estimate of $15/month included for foreign workers.",
      );
    }
    notes.push(
      "Does not include variable costs such as bonuses, benefits-in-kind, or training costs.",
    );

    return {
      baseSalary: salary,
      cpfEmployer,
      levy,
      sdl,
      insurance,
      totalCost,
      notes,
    };
  },
  renderResult(_values, result) {
    return renderCostToCompanyResult(result);
  },
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/**
 * Central registry of calculator configs. The -prism detail page looks up
 * by slug. Adding a new calculator is a one-file change here plus the
 * CalculatorType union.
 *
 * Typed as CalculatorConfig (the default CalculatorResult generic) because
 * Record<CalculatorType, CalculatorConfig<TSpecific>> cannot express
 * per-slot result types without a mapped-type dance. Each config carries
 * its own matching renderResult closure so TSpecific is preserved inside
 * the config object.
 */
export const CALCULATOR_CONFIGS: Record<CalculatorType, CalculatorConfig> = {
  cpf: cpfConfig as CalculatorConfig,
  "quota-levy": quotaLevyConfig as CalculatorConfig,
  leave: leaveConfig as CalculatorConfig,
  "notice-period": noticePeriodConfig as CalculatorConfig,
  overtime: overtimeConfig as CalculatorConfig,
  retrenchment: retrenchmentConfig as CalculatorConfig,
  "cost-to-company": costToCompanyConfig as CalculatorConfig,
};

/** Look up a config by slug, returning undefined for unknown slugs. */
export function getCalculatorConfig(
  slug: string,
): CalculatorConfig | undefined {
  return isCalculatorType(slug) ? CALCULATOR_CONFIGS[slug] : undefined;
}
