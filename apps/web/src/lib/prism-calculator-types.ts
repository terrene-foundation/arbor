/**
 * Prism Calculator Types — shared type definitions between the config
 * file and the result renderers. Lives in a separate module so that
 * prism-calculator-configs.ts and prism-calculator-results.tsx can both
 * depend on these types without a circular import.
 */

import type { FieldDef, SectionDef } from "@kailash/prism-web";
import type {
  CpfCalculationRequest,
  CpfCalculationResponse,
} from "@/types/api";

// ---------------------------------------------------------------------------
// Slugs
// ---------------------------------------------------------------------------

export type CalculatorType =
  | "cpf"
  | "quota-levy"
  | "leave"
  | "notice-period"
  | "overtime"
  | "retrenchment"
  | "cost-to-company";

export const CALCULATOR_TYPES: readonly CalculatorType[] = [
  "cpf",
  "quota-levy",
  "leave",
  "notice-period",
  "overtime",
  "retrenchment",
  "cost-to-company",
] as const;

export function isCalculatorType(slug: string): slug is CalculatorType {
  return (CALCULATOR_TYPES as readonly string[]).includes(slug);
}

// ---------------------------------------------------------------------------
// Per-calculator result shapes
// ---------------------------------------------------------------------------

export interface CpfResult {
  request: CpfCalculationRequest;
  response: CpfCalculationResponse;
  prYearLabel: string;
}

export interface QuotaLevyResult {
  totalWorkers: number;
  localCore: number;
  foreignWorkers: number;
  currentRatio: number;
  drcLimit: number;
  withinLimit: boolean;
  wpAllowed: number;
  levyEstimate: number;
  sectorLabel: string;
  notes: string[];
}

export interface LeaveResult {
  annualLeave: number;
  sickLeave: number;
  hospitalisationLeave: number;
  maternityLeave: number;
  paternityLeave: number;
  childcareLeave: number;
  basis: string;
  notes: string[];
  leaveType: string;
}

export interface NoticeResult {
  noticeWeeks: number;
  source: string;
  salaryInLieu: number;
  notes: string[];
}

export interface OvertimeResult {
  eligible: boolean;
  reason: string;
  otHours: number;
  hourlyRate: number;
  otMultiplier: number;
  otPay: number;
  notes: string[];
}

export interface RetrenchmentResult {
  weeksPerYear: number;
  totalWeeks: number;
  benefitPerYear: number;
  totalBenefit: number;
  sectorLabel: string;
  notes: string[];
}

export interface CostToCompanyResult {
  baseSalary: number;
  cpfEmployer: number;
  levy: number;
  sdl: number;
  insurance: number;
  totalCost: number;
  notes: string[];
}

// ---------------------------------------------------------------------------
// Config contract (defined after the result shapes so the union resolves)
// ---------------------------------------------------------------------------

/**
 * Union of every concrete result shape. Using a union (rather than a
 * `Record<string, unknown>` constraint) lets the TypeScript compiler
 * verify that each calculator's renderResult is called with the matching
 * result type, while still allowing the configs to be stored in a single
 * Record<CalculatorType, CalculatorConfig> registry.
 */
export type CalculatorResult =
  | CpfResult
  | QuotaLevyResult
  | LeaveResult
  | NoticeResult
  | OvertimeResult
  | RetrenchmentResult
  | CostToCompanyResult;

export interface CalculatorConfig<TResult = CalculatorResult> {
  title: string;
  description: string;
  fields: FieldDef[];
  sections?: SectionDef[];
  submitLabel: string;
  compute: (values: Record<string, unknown>) => Promise<TResult>;
  renderResult: (
    values: Record<string, unknown>,
    result: TResult,
  ) => React.ReactNode;
}
