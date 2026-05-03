/**
 * Invitations DataTable columns (wave-5).
 *
 * Mirrors the bespoke pending-invitations table 1:1, MINUS the per-row
 * action buttons. Actions migrate to engine-managed `rowActions` with
 * `visible: (row) => boolean` predicates on the page (Prism 0.5.0
 * `DataTableRowAction.visible`). Engine handles per-row busy state when
 * `onExecute` returns a Promise — replaces the consumer-managed
 * `actionLoading: string | null` cycle from the bespoke route.
 */

import type { CSSProperties } from "react";
import { type ColumnDef } from "@kailash/prism-web";
import { InvitationStatusBadge } from "./badges";
import type { InvitationRow } from "@/lib/prism-employees-datasource";

const emailStyle: CSSProperties = {
  fontWeight: 500,
  color: "var(--prism-color-text-primary, #0F172A)",
};

const dimStyle: CSSProperties = {
  color: "var(--prism-color-text-secondary, #64748B)",
};

const SG_DATE: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "short",
  year: "numeric",
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-SG", SG_DATE);
  } catch {
    return iso;
  }
}

export function buildInvitationColumns(): ColumnDef<InvitationRow>[] {
  return [
    {
      field: "email",
      header: "Email",
      sortable: true,
      render: (_value, row) => <span style={emailStyle}>{row.email}</span>,
    },
    {
      field: "role",
      header: "Role",
      sortable: true,
      width: 140,
      render: (_value, row) => (
        <span style={{ ...dimStyle, textTransform: "capitalize" }}>
          {row.role.replace(/_/g, " ")}
        </span>
      ),
    },
    {
      field: "status",
      header: "Status",
      sortable: true,
      width: 110,
      align: "center",
      render: (_value, row) => <InvitationStatusBadge status={row.status} />,
    },
    {
      field: "created_at",
      header: "Sent",
      sortable: true,
      width: 130,
      render: (_value, row) => (
        <span style={dimStyle}>{formatDate(row.created_at)}</span>
      ),
    },
    {
      field: "expires_at",
      header: "Expires",
      sortable: true,
      width: 130,
      render: (_value, row) => (
        <span style={dimStyle}>{formatDate(row.expires_at)}</span>
      ),
    },
  ];
}
