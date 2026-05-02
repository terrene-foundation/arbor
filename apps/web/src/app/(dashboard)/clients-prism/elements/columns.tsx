/**
 * Column definitions for the /clients-prism DataTable (wave-4).
 *
 * Matches the columns from the bespoke /clients table 1:1. Card-grid mode
 * is handled by `renderClientCard` in `../page.tsx`; columns here drive
 * the table-mode view AND the engine's sort surface (the engine reads
 * `sortable: true` on the column to enable sortable headers).
 */

import type { CSSProperties } from "react";
import { Building2 } from "lucide-react";
import { Badge, type ColumnDef } from "@kailash/prism-web";
import { RiskTierBadge } from "@/components/design-system";
import type { RiskTierLevel } from "@/components/design-system";
import type { ClientRow } from "@/lib/prism-clients-datasource";

const cellNameWrapStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  minWidth: 0,
};

const cellIconBoxStyle: CSSProperties = {
  width: 32,
  height: 32,
  flexShrink: 0,
  borderRadius: "var(--prism-radius-md, 8px)",
  backgroundColor: "var(--prism-color-interactive-primary-subtle, #EFF6FF)",
  color: "var(--prism-color-interactive-primary, #1E3A5F)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const cellNameTextStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  minWidth: 0,
};

const cellNamePrimaryStyle: CSSProperties = {
  fontWeight: 600,
  color: "var(--prism-color-text-primary, #0F172A)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const cellNameSecondaryStyle: CSSProperties = {
  fontSize: 12,
  color: "var(--prism-color-text-tertiary, #94A3B8)",
};

const dimStyle: CSSProperties = {
  color: "var(--prism-color-text-tertiary, #94A3B8)",
};

const complianceCellStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
};

const complianceScoreStyle: CSSProperties = {
  fontWeight: 500,
  color: "var(--prism-color-text-primary, #0F172A)",
};

const dateCellStyle: CSSProperties = {
  color: "var(--prism-color-text-secondary, #64748B)",
};

export function buildClientColumns(): ColumnDef<ClientRow>[] {
  return [
    {
      field: "name",
      header: "Company",
      sortable: true,
      render: (_value, row) => (
        <div style={cellNameWrapStyle}>
          <div style={cellIconBoxStyle} aria-hidden="true">
            <Building2 size={16} />
          </div>
          <div style={cellNameTextStyle}>
            <span style={cellNamePrimaryStyle}>{row.name}</span>
            <span style={cellNameSecondaryStyle}>{row.uen}</span>
          </div>
        </div>
      ),
    },
    {
      field: "sector",
      header: "Sector",
      sortable: true,
      width: 160,
      render: (_value, row) =>
        row.sector ? (
          <Badge variant="default" size="sm">
            {row.sector}
          </Badge>
        ) : (
          <span style={dimStyle}>—</span>
        ),
    },
    {
      field: "employee_count",
      header: "Employees",
      sortable: true,
      width: 110,
      align: "right",
    },
    {
      field: "compliance_score",
      header: "Compliance",
      sortable: true,
      width: 180,
      render: (_value, row) =>
        row.compliance_score != null && row.risk_tier ? (
          <span style={complianceCellStyle}>
            <span style={complianceScoreStyle}>{row.compliance_score}</span>
            <RiskTierBadge tier={row.risk_tier as RiskTierLevel} />
          </span>
        ) : (
          <span style={{ fontSize: 12, ...dimStyle }}>Not checked</span>
        ),
    },
    {
      field: "last_activity",
      header: "Last Activity",
      sortable: true,
      width: 150,
      render: (_value, row) => (
        <span style={dateCellStyle}>
          {row.last_activity
            ? new Date(row.last_activity).toLocaleDateString("en-SG", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })
            : "—"}
        </span>
      ),
    },
  ];
}
