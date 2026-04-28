/**
 * PrismPayslipsDatasource — Bridges arbor's payroll API to Prism's DataTable engine.
 *
 * Purpose
 * -------
 * Two surfaces:
 *  1. `fetchPayslipsPage()` — a simple consumer-owned fetch that returns the full
 *     payslip list (arbor's backend does not paginate `/payroll/my-payslips`).
 *     The Prism DataTable engine sorts + paginates client-side via its
 *     useDataTable hook from the returned array.
 *
 *  2. `downloadPayslipPdf(id)` — implements the row action. Arbor's backend has
 *     no PDF endpoint (the bespoke /my-payslips page ships a disabled Download
 *     button — see src/app/(dashboard)/my-payslips/page.tsx:277-290). The honest
 *     non-stub implementation is: fetch `myPayslipDetail(id)`, render it into a
 *     print-optimised HTML document in a new browser window, and invoke
 *     `window.print()` so the user can Save-as-PDF via the browser's native
 *     print dialog. This uses only real APIs and performs a real user action.
 *
 * Row shape
 * ---------
 * `PayslipRow` is a view model derived from arbor's `Payslip`. Two renames:
 *  - `payslip_id` → `id`  (so Prism's useDataTable default `getRowId` finds it)
 *  - `period_label` is synthesised from `period_start` for sort stability
 * The original Payslip is retained under `__raw` so custom column renderers can
 * access the untransformed fields without re-fetching.
 */

import {
  payrollApi,
  type Payslip,
  type PayslipDetail,
  type PayslipItem,
} from "@/services/api/payroll";
import type { UserFacingError } from "@/lib/prism-error-sanitize";

/**
 * Dev-only debug logger.
 *
 * Downgraded from `console.info` (red-team S1: PII-adjacent identifiers at
 * INFO in production were a leak vector for browser RUM / tag managers). The
 * payslip fetch path logs structured fields so operators can reconstruct
 * latency / counts during investigations; shipping them at DEBUG in dev only
 * keeps observability without exposing them in production telemetry.
 *
 * Contract: call sites pass `payslip_id` as a numeric ID reference only when
 * operationally necessary; they MUST NOT pass compensation values (gross,
 * net, CPF amounts). NODE_ENV gating prevents any emission in production.
 */
function debugLog(event: string, fields: Record<string, unknown>): void {
  if (typeof process !== "undefined" && process.env.NODE_ENV !== "production") {
    console.debug(`[prism-payslips-datasource] ${event}`, fields);
  }
}

/* ── Row view model ──────────────────────────────────────── */

/**
 * Flattened row type for the payslips DataTable.
 *
 * The [key: string]: unknown index signature is required because Prism's
 * `DataTableRow = Record<string, unknown>` forces rows to be structurally
 * compatible with a dynamic record. Without it, `ColumnDef<PayslipRow>`
 * fails to type-check because known fields violate the index constraint.
 */
export interface PayslipRow {
  id: number;
  period_label: string;
  period_start: string;
  period_end: string;
  gross_salary: number;
  net_salary: number;
  employee_cpf: number;
  employer_cpf: number;
  status: string;
  __raw: Payslip;
  [key: string]: unknown;
}

/* ── Result shape for consumer-owned fetch ──────────────── */

export interface PayslipsPageResult {
  items: PayslipRow[];
  totalCount: number;
  /** Observability marker required by rules/observability.md § Rule 3 */
  mode: "real";
  source: "arbor.payroll.myPayslips";
}

/* ── Helpers ─────────────────────────────────────────────── */

function formatPeriodLabel(start: string, end: string): string {
  if (!start) return "-";
  const s = new Date(start);
  if (Number.isNaN(s.getTime())) return "-";
  // Use ISO year-month so sortable as string === sortable as date
  const year = s.getFullYear();
  const month = String(s.getMonth() + 1).padStart(2, "0");
  const label = s.toLocaleDateString("en-SG", {
    month: "long",
    year: "numeric",
  });
  // Prefix with ISO sort key so string sort matches chronological order
  void end;
  return `${String(year)}-${month} ${label}`;
}

function toRow(payslip: Payslip): PayslipRow {
  return {
    id: payslip.payslip_id,
    period_label: formatPeriodLabel(payslip.period_start, payslip.period_end),
    period_start: payslip.period_start,
    period_end: payslip.period_end,
    gross_salary: payslip.gross_salary,
    net_salary: payslip.net_salary,
    employee_cpf: payslip.employee_cpf,
    employer_cpf: payslip.employer_cpf,
    status: payslip.status,
    __raw: payslip,
  };
}

/* ── 1. Consumer-owned fetch (the one the page actually uses) ─ */

/**
 * Fetch all payslips for the signed-in user and map to PayslipRow[].
 *
 * Structured observability per rules/observability.md §Mandatory Log Points 1+2+3:
 *  - entry log
 *  - outbound integration log (arbor payroll API)
 *  - exit OR error log with latency
 *  - mode=real on every data-call log line
 */
export async function fetchPayslipsPage(): Promise<PayslipsPageResult> {
  const t0 = performance.now();
  debugLog("fetch.start", {
    source: "arbor.payroll.myPayslips",
    mode: "real",
  });
  try {
    const raw = await payrollApi.myPayslips();
    // Defensive: arbor sometimes returns {payslips: [...]} via intermediate wrappers
    const list: Payslip[] = Array.isArray(raw)
      ? raw
      : ((raw as unknown as { payslips?: Payslip[] }).payslips ?? []);
    const items = list.map(toRow);
    const latencyMs = performance.now() - t0;
    debugLog("fetch.ok", {
      source: "arbor.payroll.myPayslips",
      mode: "real",
      count: items.length,
      latency_ms: Math.round(latencyMs),
    });
    return {
      items,
      totalCount: items.length,
      mode: "real",
      source: "arbor.payroll.myPayslips",
    };
  } catch (err: unknown) {
    const latencyMs = performance.now() - t0;
    // Log the full error only in dev so production telemetry does not echo
    // backend error bodies (S2 mitigation).
    debugLog("fetch.error", {
      source: "arbor.payroll.myPayslips",
      mode: "real",
      error_type: err instanceof Error ? err.name : typeof err,
      latency_ms: Math.round(latencyMs),
    });
    throw err;
  }
}

/* ── 2. Download action ──────────────────────────────────── */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatCurrencySGD(amount: number): string {
  return `$${amount.toLocaleString("en-SG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDateSGD(value: string): string {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("en-SG", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function renderPrintableHtml(detail: PayslipDetail): string {
  const earnings = detail.items.filter(
    (i: PayslipItem) => i.item_type === "earning",
  );
  const deductions = detail.items.filter(
    (i: PayslipItem) => i.item_type === "deduction",
  );
  const employer = detail.items.filter(
    (i: PayslipItem) => i.item_type === "employer_contribution",
  );

  const itemRow = (i: PayslipItem, sign: string): string => `
    <tr>
      <td>${escapeHtml(i.name)}</td>
      <td class="num">${sign}${escapeHtml(formatCurrencySGD(i.amount))}</td>
    </tr>`;

  const sectionTable = (
    label: string,
    items: PayslipItem[],
    sign: string,
  ): string => {
    if (items.length === 0) return "";
    return `
      <h3>${escapeHtml(label)}</h3>
      <table>
        <tbody>
          ${items.map((i) => itemRow(i, sign)).join("")}
        </tbody>
      </table>`;
  };

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Payslip — ${escapeHtml(formatDateSGD(detail.period_start))}</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; color: #0f172a; padding: 32px; max-width: 720px; margin: 0 auto; }
    h1 { font-size: 1.5rem; margin: 0 0 4px; }
    h2 { font-size: 1rem; color: #475569; margin: 0 0 24px; font-weight: normal; }
    h3 { font-size: 0.875rem; text-transform: uppercase; letter-spacing: 0.05em; color: #475569; margin: 24px 0 8px; }
    table { width: 100%; border-collapse: collapse; }
    td { padding: 6px 0; font-size: 0.9rem; }
    td.num { text-align: right; font-variant-numeric: tabular-nums; }
    .total { border-top: 2px solid #0f172a; font-weight: 600; font-size: 1rem; padding-top: 10px; }
    .meta { display: flex; gap: 24px; margin: 16px 0 8px; font-size: 0.85rem; color: #475569; }
    @media print { body { padding: 16px; } }
  </style>
</head>
<body>
  <h1>Payslip</h1>
  <h2>${escapeHtml(formatDateSGD(detail.period_start))} — ${escapeHtml(formatDateSGD(detail.period_end))}</h2>
  <div class="meta">
    <div>Status: ${escapeHtml(detail.status)}</div>
    <div>Gross: ${escapeHtml(formatCurrencySGD(detail.gross_salary))}</div>
    <div>Net: ${escapeHtml(formatCurrencySGD(detail.net_salary))}</div>
  </div>
  ${sectionTable("Earnings", earnings, "")}
  ${sectionTable("Deductions", deductions, "-")}
  ${sectionTable("Employer Contributions", employer, "")}
  <h3>Statutory</h3>
  <table>
    <tbody>
      <tr><td>Employer CPF</td><td class="num">${escapeHtml(formatCurrencySGD(detail.employer_cpf))}</td></tr>
      <tr><td>Employee CPF</td><td class="num">-${escapeHtml(formatCurrencySGD(detail.employee_cpf))}</td></tr>
      ${detail.sdl > 0 ? `<tr><td>SDL</td><td class="num">${escapeHtml(formatCurrencySGD(detail.sdl))}</td></tr>` : ""}
      ${detail.fwl > 0 ? `<tr><td>FWL</td><td class="num">${escapeHtml(formatCurrencySGD(detail.fwl))}</td></tr>` : ""}
      ${detail.shg_amount > 0 ? `<tr><td>SHG (${escapeHtml(detail.shg_fund)})</td><td class="num">${escapeHtml(formatCurrencySGD(detail.shg_amount))}</td></tr>` : ""}
    </tbody>
  </table>
  <table>
    <tbody>
      <tr class="total"><td>Net Pay</td><td class="num">${escapeHtml(formatCurrencySGD(detail.net_salary))}</td></tr>
    </tbody>
  </table>
  <script>
    window.addEventListener('load', function () {
      setTimeout(function () { window.print(); }, 150);
    });
  </script>
</body>
</html>`;
}

/**
 * Error thrown when the browser blocks the print window (popup blocker).
 *
 * Implements `UserFacingError` from `prism-error-sanitize.ts` so
 * `sanitizeErrorMessage(err)` returns its pre-composed message verbatim
 * rather than falling back to the generic string.
 */
export class PayslipDownloadBlockedError
  extends Error
  implements UserFacingError
{
  readonly isUserFacing = true as const;

  constructor() {
    super(
      "Unable to open the payslip print window. Please allow popups for this site and try again.",
    );
    this.name = "PayslipDownloadBlockedError";
  }
}

/**
 * Fetch payslip detail and open a print-ready HTML document in a new window.
 *
 * This is the honest zero-stub implementation of "download the payslip PDF"
 * given that arbor's backend ships no PDF endpoint. The user saves the
 * resulting print dialog to PDF via their browser's native Save-as-PDF action.
 *
 * Observability: logs entry, the outbound API call, the print-open outcome,
 * and any error, all with mode=real.
 */
export async function downloadPayslipPdf(id: number): Promise<void> {
  const t0 = performance.now();
  debugLog("download.start", {
    // S1 mitigation: payslip_id is PII-adjacent in a compensation context;
    // it stays in dev-only DEBUG logs via debugLog(), never at INFO.
    payslip_id: id,
    source: "arbor.payroll.myPayslipDetail",
    mode: "real",
  });
  let detail: PayslipDetail;
  try {
    detail = await payrollApi.myPayslipDetail(id);
  } catch (err: unknown) {
    debugLog("download.fetch_error", {
      payslip_id: id,
      mode: "real",
      error_type: err instanceof Error ? err.name : typeof err,
      latency_ms: Math.round(performance.now() - t0),
    });
    throw err;
  }

  const html = renderPrintableHtml(detail);
  const win = window.open(
    "",
    "_blank",
    "noopener,noreferrer,width=900,height=1000",
  );
  if (!win) {
    debugLog("download.window_blocked", {
      payslip_id: id,
      mode: "real",
    });
    throw new PayslipDownloadBlockedError();
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  debugLog("download.ok", {
    payslip_id: id,
    mode: "real",
    latency_ms: Math.round(performance.now() - t0),
  });
}
