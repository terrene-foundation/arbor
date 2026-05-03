/**
 * Employees DataTable columns (wave-5).
 *
 * Mirrors the bespoke /employees columns 1:1: Name, Email, Department,
 * Designation, Confirmation (badge), Profile (completeness bar), Status
 * (badge). Row-click navigation is configured on the page (via
 * `<DataTable onRowClick={...} />`), not on the columns.
 */

import type { CSSProperties } from "react";
import { type ColumnDef } from "@kailash/prism-web";
import { ConfirmBadge, StatusBadge } from "./badges";
import type { EmployeeRow } from "@/lib/prism-employees-datasource";

const namePrimaryStyle: CSSProperties = {
  fontWeight: 600,
  color: "var(--prism-color-text-primary, #0F172A)",
};

const dimStyle: CSSProperties = {
  color: "var(--prism-color-text-secondary, #64748B)",
};

export function buildEmployeeColumns(): ColumnDef<EmployeeRow>[] {
  return [
    {
      field: "name",
      header: "Name",
      sortable: true,
      render: (_value, row) => <span style={namePrimaryStyle}>{row.name}</span>,
    },
    {
      field: "email",
      header: "Email",
      sortable: true,
      render: (_value, row) => <span style={dimStyle}>{row.email}</span>,
    },
    {
      field: "department",
      header: "Department",
      sortable: true,
      render: (_value, row) => (
        <span style={dimStyle}>{row.department}</span>
      ),
    },
    {
      field: "designation",
      header: "Designation",
      sortable: true,
      render: (_value, row) => (
        <span style={dimStyle}>{row.designation || "—"}</span>
      ),
    },
    {
      field: "confirmation_status",
      header: "Confirmation",
      sortable: true,
      width: 130,
      align: "center",
      render: (_value, row) => <ConfirmBadge status={row.confirmation_status} />,
    },
    // NOTE: Profile completeness column from the bespoke /employees deferred.
    // Prism 0.5.0 ColumnDef.field is typed `string & keyof T`, blocking
    // synthetic computed columns. Tracked at terrene-foundation/kailash-prism
    // issue (filed by wave-5).
    {
      field: "status",
      header: "Status",
      sortable: true,
      width: 110,
      align: "center",
      render: (_value, row) => <StatusBadge status={row.status} />,
    },
  ];
}
