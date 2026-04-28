"use client";

/**
 * My Payslips (Prism) — DataTableAdapter migration (wave-3).
 *
 * The adapter encapsulates the fetch + download surface; the page shell
 * holds only the retry trigger and the total-count display. No more
 * consumer-owned useState/useEffect loop. Rows, sort, and pagination are
 * all engine-managed; download is an adapter `rowAction` whose async
 * handler puts the button into a busy state until the promise settles.
 */

import { useMemo, useState } from "react";
import {
  DataTable,
  LayoutProvider,
  ListTemplate,
  type DataTableAdapter,
  type DataTableCapabilities,
  type DataTablePage,
  type DataTableQuery,
  type DataTableRowAction,
} from "@kailash/prism-web";
import { Download, Receipt, RefreshCw } from "lucide-react";
import { AppButton } from "@/components/design-system";
import {
  downloadPayslipPdf,
  fetchPayslipsPage,
  type PayslipRow,
} from "@/lib/prism-payslips-datasource";
import { sanitizeErrorMessage } from "@/lib/prism-error-sanitize";
import { buildPayslipColumns } from "./elements/columns";

/* ── Adapter ─────────────────────────────────────────────── */

/**
 * Build a DataTableAdapter<PayslipRow> over arbor's /payroll/my-payslips
 * endpoint. The backend returns the full list unpaginated; the engine sorts
 * and paginates client-side from the adapter's single-page response.
 *
 * S2 wave-2 parity: fetch errors re-throw with sanitized messages so the
 * engine's error banner never echoes raw backend bodies.
 * S1 wave-2 parity: the underlying `fetchPayslipsPage` keeps payslip_id
 * identifiers in dev-only DEBUG logs; the adapter adds no new logging.
 *
 * Note: TId is stringified at the adapter boundary because Prism 0.3.1's
 * `DataSource<T>` fixes TId to `string`. See wave-3 findings.
 */
function makePayslipsAdapter(
  downloadAction: DataTableRowAction<PayslipRow>,
  onTotalChange: (total: number) => void,
): DataTableAdapter<PayslipRow> {
  return {
    getRowId: (row) => String(row.id),
    capabilities: (): DataTableCapabilities => ({}),
    fetchPage: async (
      query: DataTableQuery,
    ): Promise<DataTablePage<PayslipRow>> => {
      try {
        const result = await fetchPayslipsPage();
        let rows = result.items;

        if (query.sort.length > 0) {
          rows = [...rows].sort((a, b) => {
            const ar = a as Record<string, unknown>;
            const br = b as Record<string, unknown>;
            for (const s of query.sort) {
              const av = ar[s.field];
              const bv = br[s.field];
              if (av == null && bv == null) continue;
              if (av == null) return s.direction === "asc" ? -1 : 1;
              if (bv == null) return s.direction === "asc" ? 1 : -1;
              if (typeof av === "number" && typeof bv === "number") {
                const d = av - bv;
                if (d !== 0) return s.direction === "asc" ? d : -d;
                continue;
              }
              const cmp = String(av).localeCompare(String(bv));
              if (cmp !== 0) return s.direction === "asc" ? cmp : -cmp;
            }
            return 0;
          });
        }

        onTotalChange(result.totalCount);
        return { rows, totalCount: result.totalCount };
      } catch (err: unknown) {
        throw new Error(sanitizeErrorMessage(err));
      }
    },
    rowActions: [downloadAction],
    onRowActivate: (row) => downloadPayslipPdf(row.id),
  };
}

/* ── Page content ─────────────────────────────────────────────────────────── */

function MyPayslipsPrismContent() {
  const [totalCount, setTotalCount] = useState(0);
  const [retryTick, setRetryTick] = useState(0);

  const downloadAction = useMemo<DataTableRowAction<PayslipRow>>(
    () => ({
      id: "download",
      label: "Download",
      variant: "secondary",
      icon: <Download className="h-4 w-4 mr-1" />,
      // Returning the promise puts the button into a busy state until it
      // settles (engine-managed — replaces the wave-2 `downloadingId` state).
      onExecute: async (row) => {
        try {
          await downloadPayslipPdf(row.id);
        } catch (err: unknown) {
          // PayslipDownloadBlockedError flags isUserFacing=true so its
          // message passes through sanitizeErrorMessage unchanged.
          throw new Error(sanitizeErrorMessage(err));
        }
      },
    }),
    [],
  );

  // Retry by recreating the adapter (fresh identity → engine refetches).
  const adapter = useMemo(
    () => makePayslipsAdapter(downloadAction, setTotalCount),
    // retryTick included so a manual retry produces a new adapter instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [downloadAction, retryTick],
  );

  // Columns drop the bespoke Download column now that the adapter's rowAction
  // renders it in the engine-managed action slot.
  const columns = useMemo(() => buildPayslipColumns(), []);

  const headerActions = (
    <div className="flex items-center gap-2">
      <span className="text-xs text-[var(--color-gray-500)]">
        {`${String(totalCount)} record${totalCount === 1 ? "" : "s"}`}
      </span>
      <AppButton
        variant="text"
        size="sm"
        onClick={() => {
          setRetryTick((t) => t + 1);
        }}
      >
        <RefreshCw className="h-4 w-4 mr-1" />
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
        content={
          <DataTable<PayslipRow>
            columns={columns}
            data={adapter}
            aria-label="My payslips"
            sorting={{
              enabled: true,
              mode: "single",
              defaultSort: { field: "period_label", direction: "desc" },
            }}
            pagination={{
              enabled: true,
              defaultPageSize: 10,
              pageSizeOptions: [10, 25, 50],
            }}
            filtering={{ enabled: false }}
            emptyState={
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
            }
          />
        }
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
