"use client";

/**
 * My Payslips (Prism) — Side-by-side pilot of Prism DataTable engine (M-02).
 *
 * Uses @kailash/prism-web's DataTable inside ListTemplate with a consumer-owned
 * fetch from `prism-payslips-datasource`. Compare with /my-payslips for the
 * bespoke card-expansion implementation.
 *
 * Findings: /Users/esperie/repos/loom/kailash-prism/workspaces/fe-codegen-platform/04-validate/migration-m02-findings.md
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DataTable,
  LayoutProvider,
  ListTemplate,
  type DataTableConfig,
} from "@kailash/prism-web";
import { Receipt, RefreshCw } from "lucide-react";
import { AppButton } from "@/components/design-system";
import {
  downloadPayslipPdf,
  fetchPayslipsPage,
  type PayslipRow,
} from "@/lib/prism-payslips-datasource";
import { sanitizeErrorMessage } from "@/lib/prism-error-sanitize";
import { buildPayslipColumns } from "./elements/columns";

/* ── Page content ─────────────────────────────────────────────────────────── */

function MyPayslipsPrismContent() {
  const [rows, setRows] = useState<PayslipRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  const fetchRows = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchPayslipsPage();
      setRows(result.items);
      setTotalCount(result.totalCount);
    } catch (err: unknown) {
      // Red-team S2 mitigation: sanitizeErrorMessage returns a user-safe
      // string and never echoes raw backend error bodies.
      setError(sanitizeErrorMessage(err));
      setRows([]);
      setTotalCount(0);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  const handleDownload = useCallback(async (payslipId: number) => {
    setDownloadingId(payslipId);
    try {
      await downloadPayslipPdf(payslipId);
    } catch (err: unknown) {
      // sanitizeErrorMessage honours PayslipDownloadBlockedError (it flags
      // isUserFacing=true) and falls back to a generic message otherwise.
      setError(sanitizeErrorMessage(err));
    } finally {
      setDownloadingId(null);
    }
  }, []);

  const handleDownloadSync = useCallback(
    (payslipId: number) => {
      void handleDownload(payslipId);
    },
    [handleDownload],
  );

  const handleRowClick = useCallback(
    (row: PayslipRow) => {
      handleDownloadSync(row.id);
    },
    [handleDownloadSync],
  );

  const columns = useMemo(
    () =>
      buildPayslipColumns({
        downloadingId,
        onDownload: handleDownloadSync,
      }),
    [downloadingId, handleDownloadSync],
  );

  const config: DataTableConfig<PayslipRow> = useMemo(
    () => ({
      columns,
      data: rows,
      sorting: {
        enabled: true,
        mode: "single",
        defaultSort: { field: "period_label", direction: "desc" },
      },
      pagination: {
        enabled: true,
        defaultPageSize: 10,
        pageSizeOptions: [10, 25, 50],
      },
      filtering: { enabled: false },
      loading: isLoading,
      error: error,
      onRetry: () => {
        void fetchRows();
      },
      onRowClick: handleRowClick,
      "aria-label": "My payslips",
      emptyState: (
        <div className="py-12 text-center">
          <Receipt
            className="h-12 w-12 mx-auto mb-3 text-[var(--color-gray-400)]"
            aria-hidden="true"
          />
          <p className="text-sm font-medium text-[var(--color-gray-900)]">
            No payslips yet
          </p>
          <p className="text-xs text-[var(--color-gray-500)] mt-1">
            Your payslips will appear here after payroll is processed.
          </p>
        </div>
      ),
    }),
    [columns, rows, isLoading, error, fetchRows, handleRowClick],
  );

  const headerActions = (
    <div className="flex items-center gap-2">
      <span className="text-xs text-[var(--color-gray-500)]">
        {isLoading
          ? "Loading…"
          : `${String(totalCount)} record${totalCount === 1 ? "" : "s"}`}
      </span>
      <AppButton
        variant="text"
        size="sm"
        onClick={() => {
          void fetchRows();
        }}
        disabled={isLoading}
      >
        <RefreshCw
          className={`h-4 w-4 mr-1 ${isLoading ? "animate-spin" : ""}`}
        />
        Refresh
      </AppButton>
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto pb-8">
      <ListTemplate
        title="My Payslips (Prism pilot)"
        subtitle="Sortable, paginated payslip history — rendered by the Prism DataTable engine."
        headerActions={headerActions}
        content={<DataTable {...config} />}
      />
    </div>
  );
}

/* ── Route export ─────────────────────────────────────────────────────────── */

export default function MyPayslipsPrismPage() {
  return (
    <LayoutProvider>
      <MyPayslipsPrismContent />
    </LayoutProvider>
  );
}
