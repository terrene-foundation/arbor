"use client";

/**
 * Employees (Prism) — wave-5 migration.
 *
 * First arbor consumer to compose TWO DataTable instances on one page:
 * an employees table (row-click navigation, search filter) and an
 * invitations table (predicate-gated rowActions with engine-managed
 * busy state via Promise-returning `onExecute`).
 *
 * Wave-5 scope deliberately excludes:
 *  - Invite Employee modal (needs Form-in-modal pattern; wave-6+)
 *  - Invite link success modal (chained-modal pattern; wave-6+)
 *  - Import CSV wizard (FormWizard composition; wave-6+)
 *  - Work-pass expiry filter (orthogonal arbor data-layer N+1 concern)
 *
 * The bespoke /employees route retains all four out-of-scope surfaces
 * untouched (side-by-side pilot pattern from waves 1-4).
 *
 * 0.5.0 G-1: numeric `Employee.id` AND numeric `Invitation.id` both
 * propagate through their respective `DataTableAdapter<X, number>`
 * callbacks — no `String(id)` coercion at any boundary.
 */

import { useMemo, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Mail, RefreshCw, Search, Trash2, Users } from "lucide-react";
import {
  DataTable,
  LayoutProvider,
  VStack,
  type DataTableAdapter,
  type DataTableCapabilities,
  type DataTablePage,
  type DataTableQuery,
  type DataTableRowAction,
} from "@kailash/prism-web";
import { toast } from "@/components/design-system";
import {
  applyEmployeeSearch,
  fetchAllEmployees,
  fetchAllInvitations,
  resendInvitation,
  revokeInvitation,
  type EmployeeRow,
  type InvitationRow,
} from "@/lib/prism-employees-datasource";
import { sanitizeErrorMessage } from "@/lib/prism-error-sanitize";
import { buildEmployeeColumns } from "./elements/employee-columns";
import { buildInvitationColumns } from "./elements/invitation-columns";

/* ── Adapters ────────────────────────────────────────────── */

/**
 * Employees adapter. Rebuilt on (employees, search) change so the
 * engine refetches when search-state changes — same pattern as wave-3
 * documents-prism + wave-4 clients-prism (adapter-rebuild-on-string-
 * delta workaround for G-2; tracked at terrene-foundation/kailash-prism#24
 * for promotion to a 0.6.0 FilterBar molecule).
 */
function makeEmployeesAdapter(
  employees: readonly EmployeeRow[],
  search: string,
): DataTableAdapter<EmployeeRow, number> {
  return {
    getRowId: (row) => row.id,
    capabilities: (): DataTableCapabilities => ({}),
    fetchPage: async (
      query: DataTableQuery,
    ): Promise<DataTablePage<EmployeeRow>> => {
      try {
        const { items, totalCount } = applyEmployeeSearch(employees, {
          search,
        });
        let rows = items;
        if (query.sort.length > 0) {
          rows = [...rows].sort((a, b) => {
            const ar = a as unknown as Record<string, unknown>;
            const br = b as unknown as Record<string, unknown>;
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
        return { rows, totalCount };
      } catch (err: unknown) {
        throw new Error(sanitizeErrorMessage(err));
      }
    },
  };
}

/**
 * Invitations adapter. Three rowActions with predicate-gated `visible`
 * (Prism 0.5.0 `DataTableRowAction.visible`); resend/revoke are async
 * with engine-managed busy state via Promise-returning `onExecute`.
 *
 * The adapter's `invalidate` callback ties into React Query: after any
 * row action resolves, the engine calls invalidate before refetching, so
 * we ask React Query to refetch invitations in the same lifecycle. The
 * useMemo dependency on `invitations` then produces a new adapter
 * identity, and the engine pulls fresh data via `fetchPage`.
 */
function makeInvitationsAdapter(
  invitations: readonly InvitationRow[],
  rowActions: ReadonlyArray<DataTableRowAction<InvitationRow, number>>,
  invalidate: () => Promise<void>,
): DataTableAdapter<InvitationRow, number> {
  return {
    getRowId: (row) => row.id,
    capabilities: (): DataTableCapabilities => ({}),
    fetchPage: async (
      query: DataTableQuery,
    ): Promise<DataTablePage<InvitationRow>> => {
      try {
        let rows = [...invitations];
        if (query.sort.length > 0) {
          rows = rows.sort((a, b) => {
            const ar = a as unknown as Record<string, unknown>;
            const br = b as unknown as Record<string, unknown>;
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
        return { rows, totalCount: invitations.length };
      } catch (err: unknown) {
        throw new Error(sanitizeErrorMessage(err));
      }
    },
    rowActions,
    invalidate,
  };
}

/* ── Clipboard helper (no per-row state needed at engine level) ──────── */

async function copyToClipboard(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

/* ── Page-level inline styles ────────────────────────────── */

const headerRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 16,
  flexWrap: "wrap",
};
const headerLeftStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
};
const headerIconBoxStyle: CSSProperties = {
  width: 44,
  height: 44,
  borderRadius: "var(--prism-radius-md, 8px)",
  backgroundColor: "var(--prism-color-interactive-primary-subtle, #EFF6FF)",
  color: "var(--prism-color-interactive-primary, #1E3A5F)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};
const titleStyle: CSSProperties = {
  fontSize: 24,
  fontWeight: 700,
  margin: 0,
  lineHeight: 1.2,
  color: "var(--prism-color-text-primary, #0F172A)",
};
const subtitleStyle: CSSProperties = {
  fontSize: 14,
  color: "var(--prism-color-text-secondary, #64748B)",
  margin: 0,
  marginTop: 2,
};
const searchBoxStyle: CSSProperties = {
  position: "relative",
  width: "100%",
  maxWidth: 480,
};
const searchIconStyle: CSSProperties = {
  position: "absolute",
  left: 12,
  top: "50%",
  transform: "translateY(-50%)",
  color: "var(--prism-color-text-tertiary, #94A3B8)",
  pointerEvents: "none",
};
const searchInputStyle: CSSProperties = {
  width: "100%",
  height: 36,
  padding: "0 12px 0 36px",
  borderRadius: "var(--prism-radius-md, 8px)",
  border: "1px solid var(--prism-color-border-default, #CBD5E1)",
  fontSize: 14,
  backgroundColor: "var(--prism-color-surface-page, #FFFFFF)",
  color: "var(--prism-color-text-primary, #0F172A)",
  boxSizing: "border-box",
};
const sectionTitleRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
};
const sectionTitleStyle: CSSProperties = {
  fontSize: 18,
  fontWeight: 600,
  color: "var(--prism-color-text-primary, #0F172A)",
  margin: 0,
};
const sectionCountChipStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 500,
  color: "var(--prism-color-text-secondary, #64748B)",
  backgroundColor: "var(--prism-color-surface-elevated, #F1F5F9)",
  borderRadius: 9999,
  padding: "2px 10px",
};

/* ── Content ─────────────────────────────────────────────── */

function EmployeesPrismContent() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState<string>("");

  const employeesQuery = useQuery<EmployeeRow[]>({
    queryKey: ["employees"],
    queryFn: fetchAllEmployees,
  });
  const invitationsQuery = useQuery<InvitationRow[]>({
    queryKey: ["invitations"],
    queryFn: fetchAllInvitations,
  });

  // Wrap `?? []` in useMemo so a missing `data` doesn't produce a fresh
  // array identity every render — keeps downstream useMemo deps stable
  // (R19 react-hooks/exhaustive-deps; fix matches the arbor#22 bug class).
  const employees = useMemo(
    () => employeesQuery.data ?? [],
    [employeesQuery.data],
  );
  const invitations = useMemo(
    () => invitationsQuery.data ?? [],
    [invitationsQuery.data],
  );

  const employeesError = employeesQuery.error
    ? sanitizeErrorMessage(employeesQuery.error)
    : null;
  const invitationsError = invitationsQuery.error
    ? sanitizeErrorMessage(invitationsQuery.error)
    : null;

  /* ── Employees adapter ── */

  const employeesAdapter = useMemo(
    () => makeEmployeesAdapter(employees, search),
    [employees, search],
  );

  const employeeColumns = useMemo(() => buildEmployeeColumns(), []);

  /* ── Invitations rowActions ── */

  const invalidateInvitations = useMemo(
    () => async (): Promise<void> => {
      await queryClient.invalidateQueries({ queryKey: ["invitations"] });
    },
    [queryClient],
  );

  const invitationRowActions = useMemo<
    ReadonlyArray<DataTableRowAction<InvitationRow, number>>
  >(
    () => [
      {
        id: "copy",
        label: "Copy invite link",
        variant: "ghost",
        icon: <Copy className="h-4 w-4" />,
        // Visible only on pending invitations that have a stored URL.
        visible: (row) =>
          row.status === "pending" && Boolean(row.invite_url),
        onExecute: async (row) => {
          if (!row.invite_url) return;
          try {
            await copyToClipboard(row.invite_url);
            toast.success("Invite link copied to clipboard");
          } catch (err: unknown) {
            throw new Error(sanitizeErrorMessage(err));
          }
        },
      },
      {
        id: "resend",
        label: "Resend invitation",
        variant: "secondary",
        icon: <RefreshCw className="h-4 w-4" />,
        // Resend covers pending OR expired (canResend predicate from /employees).
        visible: (row) =>
          row.status === "pending" || row.status === "expired",
        onExecute: async (row) => {
          try {
            const result = await resendInvitation(row.id);
            // Best-effort: copy the fresh link to the clipboard. The user
            // pattern from /employees pairs resend + copy as a single UX.
            try {
              await copyToClipboard(result.invite_url);
              toast.success("Invitation resent — link copied to clipboard");
            } catch {
              toast.success("Invitation resent");
            }
          } catch (err: unknown) {
            throw new Error(sanitizeErrorMessage(err));
          }
        },
      },
      {
        id: "revoke",
        label: "Revoke invitation",
        variant: "destructive",
        icon: <Trash2 className="h-4 w-4" />,
        // Revoke applies only to pending invitations.
        visible: (row) => row.status === "pending",
        onExecute: async (row) => {
          try {
            await revokeInvitation(row.id);
            toast.success("Invitation revoked");
          } catch (err: unknown) {
            throw new Error(sanitizeErrorMessage(err));
          }
        },
      },
    ],
    [],
  );

  /* ── Invitations adapter ── */

  const invitationsAdapter = useMemo(
    () =>
      makeInvitationsAdapter(
        invitations,
        invitationRowActions,
        invalidateInvitations,
      ),
    [invitations, invitationRowActions, invalidateInvitations],
  );

  const invitationColumns = useMemo(() => buildInvitationColumns(), []);

  return (
    <VStack gap={24}>
      {/* Header */}
      <div style={headerRowStyle}>
        <div style={headerLeftStyle}>
          <div style={headerIconBoxStyle} aria-hidden="true">
            <Users size={22} />
          </div>
          <div>
            <h1 style={titleStyle}>Employees (Prism pilot)</h1>
            <p style={subtitleStyle}>
              Manage your team members and pending invitations. Invite + CSV
              import remain on the bespoke /employees route until wave-6.
            </p>
          </div>
        </div>
      </div>

      {/* Search */}
      <label style={searchBoxStyle}>
        <Search size={16} aria-hidden="true" style={searchIconStyle} />
        <input
          type="search"
          placeholder="Search by name, email, or department..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
          }}
          aria-label="Search employees"
          style={searchInputStyle}
        />
      </label>

      {/* Employees table */}
      <DataTable<EmployeeRow, number>
        columns={employeeColumns}
        data={employeesAdapter}
        aria-label="Employees"
        sorting={{
          enabled: true,
          mode: "single",
          defaultSort: { field: "name", direction: "asc" },
        }}
        filtering={{ enabled: false, globalSearch: false }}
        pagination={{
          enabled: true,
          defaultPageSize: 25,
          pageSizeOptions: [10, 25, 50, 100],
        }}
        loading={employeesQuery.isLoading}
        error={employeesError}
        onRowClick={(_row, id) => {
          // 0.5.0 G-1: typed numeric id arrives directly — no String() coerce.
          router.push(`/employees/${id}`);
        }}
      />

      {/* Pending Invitations section */}
      <div>
        <div style={sectionTitleRowStyle}>
          <Mail
            size={20}
            aria-hidden="true"
            style={{ color: "var(--prism-color-text-secondary, #64748B)" }}
          />
          <h2 style={sectionTitleStyle}>Pending Invitations</h2>
          {invitations.length > 0 && (
            <span style={sectionCountChipStyle}>{invitations.length}</span>
          )}
        </div>
      </div>

      {/* Invitations table */}
      <DataTable<InvitationRow, number>
        columns={invitationColumns}
        data={invitationsAdapter}
        aria-label="Pending invitations"
        sorting={{
          enabled: true,
          mode: "single",
          defaultSort: { field: "created_at", direction: "desc" },
        }}
        filtering={{ enabled: false, globalSearch: false }}
        pagination={{
          enabled: true,
          defaultPageSize: 10,
          pageSizeOptions: [10, 25, 50],
        }}
        loading={invitationsQuery.isLoading}
        error={invitationsError}
      />
    </VStack>
  );
}

/* ── Page ────────────────────────────────────────────────── */

export default function EmployeesPrismPage() {
  return (
    <LayoutProvider>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 0" }}>
        <EmployeesPrismContent />
      </div>
    </LayoutProvider>
  );
}
