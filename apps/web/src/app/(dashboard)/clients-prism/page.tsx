"use client";

/**
 * Clients (Prism) — wave-4 migration.
 *
 * First arbor consumer to compose THREE Prism engines on one page:
 *  - DataTable with `display="card-grid" | "table"` toggle
 *  - Form engine for the inline "Add Client" form (wave-4 first arbor use)
 *  - LayoutProvider + VStack page shell
 *
 * Compare /clients for the bespoke implementation (582 LOC of consumer-
 * managed state) vs this page (single React Query + adapter + form).
 *
 * 0.5.0 G-1: numeric `ClientCompany.id` propagates through the typed
 * `DataTableAdapter<ClientRow, number>` callbacks — no String() coerce.
 */

import { useMemo, useState, type CSSProperties } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  ChevronRight,
  LayoutGrid,
  List as ListIcon,
  Plus,
  Search,
  Users,
} from "lucide-react";
import {
  DataTable,
  Form,
  LayoutProvider,
  VStack,
  type DataTableAdapter,
  type DataTableCapabilities,
  type DataTablePage,
  type DataTableQuery,
  type FieldDef,
} from "@kailash/prism-web";
import { AppButton, AppCard, RiskTierBadge, toast } from "@/components/design-system";
import type { RiskTierLevel } from "@/components/design-system";
import {
  ALL_SECTORS,
  applyClientFilters,
  createClient,
  deriveSectors,
  fetchAllClients,
  type ClientRow,
  type CreateClientInput,
} from "@/lib/prism-clients-datasource";
import { sanitizeErrorMessage } from "@/lib/prism-error-sanitize";
import { buildClientColumns } from "./elements/columns";

/* ── Add-client Form fields (Prism Form engine — first arbor use) ─── */

const SECTOR_OPTIONS = [
  "Technology",
  "Manufacturing",
  "Healthcare",
  "Finance",
  "Food & Beverage",
  "Retail",
  "Construction",
  "Logistics",
  "Services",
  "Other",
] as const;

function buildAddClientFields(): FieldDef[] {
  return [
    {
      name: "name",
      type: "text",
      label: "Company Name",
      placeholder: "ABC Pte Ltd",
      required: true,
      span: 1,
      validation: [{ rule: "required", message: "Company name is required" }],
    },
    {
      name: "uen",
      type: "text",
      label: "UEN",
      placeholder: "202301234A",
      required: true,
      span: 1,
      validation: [{ rule: "required", message: "UEN is required" }],
    },
    {
      name: "sector",
      type: "select",
      label: "Sector",
      defaultValue: "Technology",
      span: 1,
      options: SECTOR_OPTIONS.map((s) => ({ value: s, label: s })),
    },
    {
      name: "employee_count",
      type: "number",
      label: "Employee Count",
      placeholder: "50",
      defaultValue: 0,
      min: 0,
      span: 1,
    },
  ];
}

/* ── Adapter ─────────────────────────────────────────────── */

/**
 * Adapter rebuilt on (clients, search, sector) change. The engine detects
 * the new identity and re-runs `fetchPage`, which re-filters the cached
 * list — no network refetch.
 */
function makeClientsAdapter(
  clients: readonly ClientRow[],
  search: string,
  sector: string,
): DataTableAdapter<ClientRow, number> {
  return {
    getRowId: (row) => row.id,
    capabilities: (): DataTableCapabilities => ({}),
    fetchPage: async (
      query: DataTableQuery,
    ): Promise<DataTablePage<ClientRow>> => {
      try {
        const { items, totalCount } = applyClientFilters(clients, {
          search,
          sector,
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
        // Sanitize before re-throwing so the engine's error banner never
        // echoes raw backend messages (S2 wave-2 parity).
        throw new Error(sanitizeErrorMessage(err));
      }
    },
  };
}

/* ── Card render (display="card-grid") ───────────────────── */

const cardBodyStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
  padding: 16,
};
const cardHeadRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
};
const cardTitleGroupStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  minWidth: 0,
};
const cardIconBoxStyle: CSSProperties = {
  width: 40,
  height: 40,
  flexShrink: 0,
  borderRadius: "var(--prism-radius-md, 8px)",
  backgroundColor: "var(--prism-color-interactive-primary-subtle, #EFF6FF)",
  color: "var(--prism-color-interactive-primary, #1E3A5F)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};
const cardTitleStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: "var(--prism-color-text-primary, #0F172A)",
  margin: 0,
  lineHeight: 1.3,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};
const cardSubStyle: CSSProperties = {
  fontSize: 12,
  color: "var(--prism-color-text-tertiary, #94A3B8)",
  margin: 0,
};
const cardMetaRowStyle: CSSProperties = {
  display: "flex",
  gap: 16,
  fontSize: 12,
  color: "var(--prism-color-text-secondary, #64748B)",
};
const cardFooterStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  paddingTop: 8,
  borderTop: "1px solid var(--prism-color-border-subtle, #F1F5F9)",
};

function renderClientCard(row: ClientRow) {
  return (
    <div style={cardBodyStyle}>
      <div style={cardHeadRowStyle}>
        <div style={cardTitleGroupStyle}>
          <div style={cardIconBoxStyle} aria-hidden="true">
            <Building2 size={20} />
          </div>
          <div style={{ minWidth: 0 }}>
            <h3 style={cardTitleStyle}>{row.name}</h3>
            <p style={cardSubStyle}>{row.uen}</p>
          </div>
        </div>
        {row.risk_tier && (
          <RiskTierBadge tier={row.risk_tier as RiskTierLevel} />
        )}
      </div>
      <div style={cardMetaRowStyle}>
        <span>{row.sector || "No sector"}</span>
        <span>{row.employee_count} employees</span>
      </div>
      <div style={cardFooterStyle}>
        {row.compliance_score != null ? (
          <span style={{ fontSize: 14, fontWeight: 500 }}>
            Score: {row.compliance_score}/100
          </span>
        ) : (
          <span style={cardSubStyle}>No compliance check yet</span>
        )}
        <ChevronRight
          size={16}
          aria-hidden="true"
          style={{ color: "var(--prism-color-text-tertiary, #94A3B8)" }}
        />
      </div>
    </div>
  );
}

/* ── Metric card (plain JSX above DataTable) ─────────────── */

function MetricCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <AppCard variant="flat">
      <div style={{ textAlign: "center" }}>
        <p
          style={{
            fontSize: 12,
            color: "var(--prism-color-text-tertiary, #94A3B8)",
            margin: 0,
          }}
        >
          {label}
        </p>
        <p
          style={{
            fontSize: 24,
            fontWeight: 700,
            margin: 0,
            marginTop: 4,
            color: color ?? "var(--prism-color-text-primary, #0F172A)",
          }}
        >
          {value}
        </p>
      </div>
    </AppCard>
  );
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
const filterRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
};
const filterLeftStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
};
const searchBoxStyle: CSSProperties = {
  position: "relative",
  minWidth: 240,
  flex: "0 1 280px",
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
const sectorSelectStyle: CSSProperties = {
  height: 36,
  padding: "0 12px",
  borderRadius: "var(--prism-radius-md, 8px)",
  border: "1px solid var(--prism-color-border-default, #CBD5E1)",
  fontSize: 14,
  backgroundColor: "var(--prism-color-surface-page, #FFFFFF)",
  color: "var(--prism-color-text-primary, #0F172A)",
};
const viewToggleGroupStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  padding: 4,
  borderRadius: "var(--prism-radius-md, 8px)",
  backgroundColor: "var(--prism-color-surface-elevated, #F1F5F9)",
};
const viewToggleButtonStyle = (active: boolean): CSSProperties => ({
  width: 36,
  height: 32,
  border: "none",
  cursor: "pointer",
  borderRadius: "var(--prism-radius-sm, 6px)",
  backgroundColor: active
    ? "var(--prism-color-surface-page, #FFFFFF)"
    : "transparent",
  color: active
    ? "var(--prism-color-text-primary, #0F172A)"
    : "var(--prism-color-text-tertiary, #94A3B8)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  boxShadow: active ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
  transition: "background-color 150ms, color 150ms",
});
const metricsGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 12,
};
const addFormHeadingStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: "var(--prism-color-text-primary, #0F172A)",
  margin: 0,
  marginBottom: 12,
};

/* ── Content ─────────────────────────────────────────────── */

type ViewMode = "grid" | "table";

function ClientsPrismContent() {
  const queryClient = useQueryClient();
  const [view, setView] = useState<ViewMode>("table");
  const [activeSector, setActiveSector] = useState<string>(ALL_SECTORS);
  const [search, setSearch] = useState<string>("");
  const [showAddForm, setShowAddForm] = useState<boolean>(false);

  const {
    data: clients = [],
    isLoading: loading,
    error: queryError,
  } = useQuery<ClientRow[]>({
    queryKey: ["clients"],
    queryFn: fetchAllClients,
  });

  const loadError = queryError ? sanitizeErrorMessage(queryError) : null;

  const sectors = useMemo(() => deriveSectors(clients), [clients]);

  // Derived during render — if the active sector disappears from the data
  // (e.g. last client in a sector deleted), fall back to "All Sectors"
  // without a setState cycle. Mirrors documents-prism's effectiveCategory.
  const effectiveSector = sectors.includes(activeSector)
    ? activeSector
    : ALL_SECTORS;

  const adapter = useMemo(
    () => makeClientsAdapter(clients, search, effectiveSector),
    [clients, search, effectiveSector],
  );

  const columns = useMemo(() => buildClientColumns(), []);

  const greenCount = clients.filter((c) => c.risk_tier === "green").length;
  const amberCount = clients.filter((c) => c.risk_tier === "amber").length;
  const redCount = clients.filter((c) => c.risk_tier === "red").length;

  const formFields = useMemo(() => buildAddClientFields(), []);

  const handleSubmitNewClient = async (
    values: Record<string, unknown>,
  ): Promise<void> => {
    const input: CreateClientInput = {
      name: String(values.name ?? "").trim(),
      uen: String(values.uen ?? "").trim(),
      sector: String(values.sector ?? "Technology"),
      employee_count: Number(values.employee_count ?? 0) || 0,
    };
    try {
      const created = await createClient(input);
      queryClient.setQueryData<ClientRow[]>(
        ["clients"],
        (prev = []) => [...prev, created],
      );
      setShowAddForm(false);
      toast.success("Client added successfully");
    } catch (err: unknown) {
      const msg = sanitizeErrorMessage(err);
      toast.error(msg);
      throw new Error(msg); // surface in Form's submitError banner
    }
  };

  return (
    <VStack gap={24}>
      {/* Header */}
      <div style={headerRowStyle}>
        <div style={headerLeftStyle}>
          <div style={headerIconBoxStyle} aria-hidden="true">
            <Users size={22} />
          </div>
          <div>
            <h1 style={titleStyle}>Clients (Prism pilot)</h1>
            <p style={subtitleStyle}>
              Manage and switch between your client companies.
            </p>
          </div>
        </div>
        <AppButton
          onClick={() => {
            setShowAddForm((s) => !s);
          }}
        >
          <Plus className="h-4 w-4 mr-1.5" /> Add Client
        </AppButton>
      </div>

      {/* Add-client form (Prism Form engine — first arbor use) */}
      {showAddForm && (
        <AppCard variant="elevated">
          <h3 style={addFormHeadingStyle}>Add New Client</h3>
          <Form
            fields={formFields}
            layout="two-column"
            onSubmit={handleSubmitNewClient}
            submitLabel="Add Client"
            showReset
            resetLabel="Cancel"
            onReset={() => {
              setShowAddForm(false);
            }}
            aria-label="Add new client"
          />
        </AppCard>
      )}

      {/* Filter bar */}
      <div style={filterRowStyle}>
        <div style={filterLeftStyle}>
          <label style={searchBoxStyle}>
            <Search
              size={16}
              aria-hidden="true"
              style={searchIconStyle}
            />
            <input
              type="search"
              placeholder="Search clients..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
              }}
              aria-label="Search clients"
              style={searchInputStyle}
            />
          </label>
          <select
            value={effectiveSector}
            onChange={(e) => {
              setActiveSector(e.target.value);
            }}
            aria-label="Filter by sector"
            style={sectorSelectStyle}
          >
            {sectors.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div role="group" aria-label="View mode" style={viewToggleGroupStyle}>
          <button
            type="button"
            aria-label="Table view"
            aria-pressed={view === "table"}
            onClick={() => {
              setView("table");
            }}
            style={viewToggleButtonStyle(view === "table")}
          >
            <ListIcon size={16} />
          </button>
          <button
            type="button"
            aria-label="Grid view"
            aria-pressed={view === "grid"}
            onClick={() => {
              setView("grid");
            }}
            style={viewToggleButtonStyle(view === "grid")}
          >
            <LayoutGrid size={16} />
          </button>
        </div>
      </div>

      {/* Metric cards above the DataTable (plain JSX organism) */}
      <div style={metricsGridStyle}>
        <MetricCard label="Total Clients" value={String(clients.length)} />
        <MetricCard
          label="Green"
          value={String(greenCount)}
          color="var(--color-risk-green, #16A34A)"
        />
        <MetricCard
          label="Amber"
          value={String(amberCount)}
          color="var(--color-risk-amber, #F59E0B)"
        />
        <MetricCard
          label="Red"
          value={String(redCount)}
          color="var(--color-risk-red, #DC2626)"
        />
      </div>

      {/* Single DataTable drives both list and card-grid modes */}
      <DataTable<ClientRow, number>
        columns={columns}
        data={adapter}
        aria-label="Clients"
        display={view === "grid" ? "card-grid" : "table"}
        renderCard={view === "grid" ? renderClientCard : undefined}
        cardGridColumns={{ mobile: 1, tablet: 2, desktop: 3 }}
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
        loading={loading}
        error={loadError}
      />
    </VStack>
  );
}

/* ── Page ────────────────────────────────────────────────── */

export default function ClientsPrismPage() {
  return (
    <LayoutProvider>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 0" }}>
        <ClientsPrismContent />
      </div>
    </LayoutProvider>
  );
}
