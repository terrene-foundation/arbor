/**
 * Column definitions for the Prism payslips DataTable pilot.
 *
 * Download is an adapter `rowAction` (see page.tsx) and renders in the
 * engine-managed action slot, so this list holds only the data columns.
 */

import type { ColumnDef } from "@kailash/prism-web";
import type { PayslipRow } from "@/lib/prism-payslips-datasource";
import { formatCurrency, formatPeriodDisplay } from "./format";
import { StatusBadge } from "./StatusBadge";

export function buildPayslipColumns(): ColumnDef<PayslipRow>[] {
  return [
    {
      field: "period_label",
      header: "Period",
      sortable: true,
      width: "auto",
      render: (value: unknown) => (
        <span className="font-medium text-[var(--color-gray-900)]">
          {formatPeriodDisplay(value)}
        </span>
      ),
    },
    {
      field: "gross_salary",
      header: "Gross",
      sortable: true,
      align: "right",
      width: 140,
      render: (value: unknown) => (
        <span className="tabular-nums">{formatCurrency(Number(value))}</span>
      ),
    },
    {
      field: "net_salary",
      header: "Net",
      sortable: true,
      align: "right",
      width: 140,
      render: (value: unknown) => (
        <span className="font-semibold tabular-nums text-[var(--color-gray-900)]">
          {formatCurrency(Number(value))}
        </span>
      ),
    },
    {
      field: "status",
      header: "Status",
      sortable: true,
      width: 120,
      render: (value: unknown) => <StatusBadge status={String(value)} />,
    },
  ];
}
