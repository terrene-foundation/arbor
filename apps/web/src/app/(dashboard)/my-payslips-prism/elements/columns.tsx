/**
 * Column definitions for the Prism payslips DataTable pilot.
 *
 * Split from page.tsx so the component file stays under the 200-line ceiling
 * from react-specialist rules. The factory receives the download callback and
 * the id of the row currently in-flight so the button can switch into a
 * disabled "Opening…" state.
 */

import type { ColumnDef } from "@kailash/prism-web";
import { Download } from "lucide-react";
import { AppButton } from "@/components/design-system";
import type { PayslipRow } from "@/lib/prism-payslips-datasource";
import { formatCurrency, formatPeriodDisplay } from "./format";
import { StatusBadge } from "./StatusBadge";

export interface PayslipColumnsOptions {
  downloadingId: number | null;
  onDownload: (id: number) => void;
}

export function buildPayslipColumns({
  downloadingId,
  onDownload,
}: PayslipColumnsOptions): ColumnDef<PayslipRow>[] {
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
    {
      field: "id",
      header: "Download",
      sortable: false,
      align: "center",
      width: 140,
      render: (_value: unknown, row: PayslipRow) => {
        const isBusy = downloadingId === row.id;
        return (
          <AppButton
            variant="outlined"
            size="sm"
            disabled={isBusy}
            onClick={(e) => {
              e.stopPropagation();
              onDownload(row.id);
            }}
          >
            <Download className="h-4 w-4 mr-1" />
            {isBusy ? "Opening…" : "Download"}
          </AppButton>
        );
      },
    },
  ];
}
