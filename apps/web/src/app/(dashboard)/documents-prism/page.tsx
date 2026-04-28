"use client";

/**
 * Documents (Prism) — DataTableAdapter + card-grid mode migration (wave-3).
 *
 * One DataTable drives both list and card-grid views via `display` prop.
 * A single `DocumentsAdapter` feeds data, rowActions, and errors. The page
 * holds view-mode / category / search state and passes them into the
 * memoized adapter so the engine refetches on change.
 *
 * Compare with /documents for the bespoke implementation.
 */

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import {
  FileSignature,
  BookOpen,
  ClipboardList,
  FileText,
  Grid3X3,
  List as ListIcon,
  Mail,
  Search,
  Shield,
  type LucideIcon,
} from "lucide-react";
import {
  Badge,
  DataTable,
  LayoutProvider,
  Row,
  VStack,
  type ColumnDef,
  type DataTableAdapter,
  type DataTableCapabilities,
  type DataTablePage,
  type DataTableQuery,
  type DataTableRow,
  type DataTableRowAction,
} from "@kailash/prism-web";
import type { DocumentTemplate } from "@/types/api";
import {
  applyClientFilters,
  deriveCategories,
  fetchAllDocumentTemplates,
} from "@/lib/prism-documents-datasource";
import { sanitizeErrorMessage } from "@/lib/prism-error-sanitize";

/* ── Row type ────────────────────────────────────────────── */

type DocumentTemplateRow = DocumentTemplate & DataTableRow;

/* ── Category icon lookup ────────────────────────────────── */

const categoryIcon: Record<string, LucideIcon> = {
  Contracts: FileSignature,
  Policies: BookOpen,
  Letters: Mail,
  Forms: ClipboardList,
};

/* ── Styles (preserved from bespoke/pilot) ──────────────── */

const headerRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 16,
  flexWrap: "wrap",
};

const titleGroupStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
};

const titleIconBoxStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 44,
  height: 44,
  borderRadius: "var(--prism-radius-md, 8px)",
  backgroundColor: "var(--prism-color-interactive-primary-subtle, #EFF6FF)",
  color: "var(--prism-color-interactive-primary, #1E3A5F)",
};

const pageTitleStyle: CSSProperties = {
  fontSize: "var(--prism-font-size-h2, 1.5rem)",
  fontWeight: 700,
  color: "var(--prism-color-text-primary, #0F172A)",
  margin: 0,
  lineHeight: 1.2,
};

const pageSubtitleStyle: CSSProperties = {
  fontSize: "var(--prism-font-size-caption, 0.875rem)",
  color: "var(--prism-color-text-secondary, #64748B)",
  margin: 0,
  marginTop: 2,
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
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 36,
  height: 32,
  borderRadius: "var(--prism-radius-sm, 6px)",
  border: "none",
  cursor: "pointer",
  backgroundColor: active
    ? "var(--prism-color-surface-page, #FFFFFF)"
    : "transparent",
  color: active
    ? "var(--prism-color-text-primary, #0F172A)"
    : "var(--prism-color-text-secondary, #64748B)",
  boxShadow: active ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
  transition: "background-color 150ms, color 150ms",
});

const filterBarStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
};

const chipRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  overflowX: "auto",
  flex: "1 1 auto",
  minWidth: 0,
};

const chipStyle = (active: boolean): CSSProperties => ({
  padding: "6px 12px",
  borderRadius: 9999,
  border: "none",
  cursor: "pointer",
  fontSize: "var(--prism-font-size-caption, 12px)",
  fontWeight: 500,
  whiteSpace: "nowrap",
  backgroundColor: active
    ? "var(--prism-color-interactive-primary, #1E3A5F)"
    : "var(--prism-color-surface-elevated, #F1F5F9)",
  color: active
    ? "var(--prism-color-text-on-primary, #FFFFFF)"
    : "var(--prism-color-text-secondary, #64748B)",
  transition: "background-color 150ms, color 150ms",
});

const searchWrapperStyle: CSSProperties = {
  position: "relative",
  flex: "0 1 280px",
  minWidth: 200,
};

const searchIconStyle: CSSProperties = {
  position: "absolute",
  left: 10,
  top: "50%",
  transform: "translateY(-50%)",
  color: "var(--prism-color-text-tertiary, #94A3B8)",
  pointerEvents: "none",
};

const searchInputStyle: CSSProperties = {
  width: "100%",
  height: 36,
  padding: "0 12px 0 34px",
  borderRadius: "var(--prism-radius-md, 6px)",
  border: "1px solid var(--prism-color-border-default, #CBD5E1)",
  backgroundColor: "var(--prism-color-surface-page, #FFFFFF)",
  color: "var(--prism-color-text-primary, #0F172A)",
  fontSize: "var(--prism-font-size-caption, 14px)",
  outline: "none",
  boxSizing: "border-box",
};

const resultCountStyle: CSSProperties = {
  fontSize: "var(--prism-font-size-caption, 12px)",
  color: "var(--prism-color-text-secondary, #64748B)",
};

/* ── Row actions (shared by table + card-grid modes) ───── */

const rowActions: readonly DataTableRowAction<DocumentTemplateRow>[] = [
  {
    id: "preview",
    label: "Preview",
    variant: "ghost",
    href: (row) => `/documents/${String(row.id)}/preview`,
  },
  {
    id: "generate",
    label: "Generate",
    variant: "primary",
    href: (row) => `/documents/${String(row.id)}/generate`,
  },
];

/* ── Adapter ─────────────────────────────────────────────── */

/**
 * Build a DataTableAdapter<DocumentTemplateRow> that applies category and
 * search filters on the client. `templates` is expected to be the full list
 * (cached at the page level across adapter recreations). Filtering happens in
 * `fetchPage` so view-mode and filter-state changes trigger the engine's
 * internal refetch lifecycle without refetching the backend.
 *
 * Errors from the filter pipeline are sanitized via `sanitizeErrorMessage`
 * (S2 wave-2 parity) before being surfaced to the engine's errorState.
 */
function makeDocumentsAdapter(
  templates: readonly DocumentTemplate[],
  category: string,
  search: string,
): DataTableAdapter<DocumentTemplateRow> {
  return {
    getRowId: (row) => String(row.id),
    capabilities: (): DataTableCapabilities => ({}),
    fetchPage: async (
      query: DataTableQuery,
    ): Promise<DataTablePage<DocumentTemplateRow>> => {
      try {
        const { items, totalCount } = applyClientFilters(
          templates as DocumentTemplate[],
          { category, search },
        );

        let rows = items as DocumentTemplateRow[];

        // Apply DataTable sort state (list mode users can click column headers).
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

        return { rows, totalCount };
      } catch (err: unknown) {
        // Sanitize before re-throwing so the engine's error banner never
        // echoes raw backend messages (S2 wave-2 fix).
        throw new Error(sanitizeErrorMessage(err));
      }
    },
    rowActions,
  };
}

/* ── Column definitions ─────────────────────────────────── */

const columns: ColumnDef<DocumentTemplateRow>[] = [
  {
    field: "name",
    header: "Template",
    sortable: true,
    render: (_value, row) => (
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span
          style={{
            fontWeight: 600,
            color: "var(--prism-color-text-primary, #0F172A)",
          }}
        >
          {row.name}
        </span>
        <span
          style={{
            fontSize: 12,
            color: "var(--prism-color-text-secondary, #64748B)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            maxWidth: 420,
          }}
        >
          {row.description}
        </span>
      </div>
    ),
  },
  {
    field: "category",
    header: "Category",
    sortable: true,
    width: 140,
    render: (_value, row) => (
      <Badge variant="default" size="sm">
        {row.category}
      </Badge>
    ),
  },
  {
    field: "provisions_count",
    header: "Provisions",
    sortable: true,
    width: 120,
    align: "right",
    render: (_value, row) => (
      <span
        style={{
          fontSize: 12,
          color: "var(--prism-color-text-secondary, #64748B)",
        }}
      >
        {row.provisions_count} linked
      </span>
    ),
  },
];

/* ── Card renderer (for display="card-grid") ────────────── */

const cardBodyStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
  padding: 16,
};

const cardHeaderRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 12,
};

const cardIconBoxStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 36,
  height: 36,
  borderRadius: "var(--prism-radius-md, 6px)",
  backgroundColor: "var(--prism-color-interactive-primary-subtle, #EFF6FF)",
  color: "var(--prism-color-interactive-primary, #1E3A5F)",
  flexShrink: 0,
};

const cardTitleBlockStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  minWidth: 0,
  flex: 1,
};

const cardTitleStyle: CSSProperties = {
  fontSize: "var(--prism-font-size-body, 14px)",
  fontWeight: 600,
  color: "var(--prism-color-text-primary, #0F172A)",
  lineHeight: 1.3,
  margin: 0,
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical" as const,
  overflow: "hidden",
};

const cardDescStyle: CSSProperties = {
  fontSize: "var(--prism-font-size-caption, 12px)",
  color: "var(--prism-color-text-secondary, #64748B)",
  lineHeight: 1.5,
  margin: 0,
  display: "-webkit-box",
  WebkitLineClamp: 3,
  WebkitBoxOrient: "vertical" as const,
  overflow: "hidden",
};

const cardComplianceStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 6,
  padding: 8,
  borderRadius: "var(--prism-radius-sm, 4px)",
  backgroundColor: "var(--prism-color-surface-elevated, #F8FAFC)",
  fontSize: "var(--prism-font-size-caption, 11px)",
  color: "var(--prism-color-text-secondary, #64748B)",
};

const cardProvisionTextStyle: CSSProperties = {
  fontSize: "var(--prism-font-size-caption, 11px)",
  color: "var(--prism-color-text-tertiary, #94A3B8)",
};

function renderDocumentCard(row: DocumentTemplateRow) {
  const Icon = categoryIcon[row.category] ?? FileText;
  const firstComplianceNote = row.compliance_notes[0];
  return (
    <div style={cardBodyStyle}>
      <div style={cardHeaderRowStyle}>
        <div style={cardIconBoxStyle} aria-hidden="true">
          <Icon size={18} />
        </div>
        <div style={cardTitleBlockStyle}>
          <h3 style={cardTitleStyle}>{row.name}</h3>
          <Badge variant="default" size="sm">
            {row.category}
          </Badge>
        </div>
      </div>
      <p style={cardDescStyle}>{row.description}</p>
      {firstComplianceNote !== undefined && (
        <div style={cardComplianceStyle}>
          <Shield
            size={13}
            aria-hidden="true"
            style={{
              color: "var(--prism-color-interactive-primary, #1E3A5F)",
              flexShrink: 0,
              marginTop: 2,
            }}
          />
          <span>{firstComplianceNote}</span>
        </div>
      )}
      <span style={cardProvisionTextStyle}>
        {row.provisions_count} provision
        {row.provisions_count !== 1 ? "s" : ""} linked
      </span>
    </div>
  );
}

/* ── Content ─────────────────────────────────────────────── */

type ViewMode = "grid" | "list";

function DocumentsPrismContent() {
  const router = useRouter();
  const [view, setView] = useState<ViewMode>("grid");
  const [activeCategory, setActiveCategory] = useState<string>("All");
  const [search, setSearch] = useState<string>("");

  // Page owns the raw template fetch (cached once), so adapter recreations on
  // category/search change don't refetch the backend.
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    fetchAllDocumentTemplates()
      .then((data) => {
        if (!cancelled) setTemplates(data);
      })
      .catch((err: unknown) => {
        // S2 wave-2 parity: sanitize before showing to user.
        if (!cancelled) setLoadError(sanitizeErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const categories = useMemo(() => deriveCategories(templates), [templates]);

  // Reset category if the current one disappears from the data set.
  useEffect(() => {
    if (activeCategory === "All") return;
    if (!categories.includes(activeCategory)) {
      setActiveCategory("All");
    }
  }, [categories, activeCategory]);

  // Recreate the adapter on (templates, activeCategory, search) change. The
  // engine detects the new adapter identity and re-runs fetchPage, which in
  // turn re-filters the already-cached templates array — no network refetch.
  const adapter = useMemo(
    () => makeDocumentsAdapter(templates, activeCategory, search),
    [templates, activeCategory, search],
  );

  // Total count of filtered rows — used in the result-count label above the
  // DataTable. Keeps parity with the bespoke page's "N templates in Category".
  const filteredCount = useMemo(
    () =>
      applyClientFilters(templates, { category: activeCategory, search })
        .totalCount,
    [templates, activeCategory, search],
  );

  const resultLabel = `${String(filteredCount)} template${filteredCount !== 1 ? "s" : ""}${
    activeCategory !== "All" ? ` in ${activeCategory}` : ""
  }`;

  return (
    <VStack gap={20}>
      {/* Header */}
      <div style={headerRowStyle}>
        <div style={titleGroupStyle}>
          <div style={titleIconBoxStyle} aria-hidden="true">
            <FileText size={22} />
          </div>
          <div>
            <h1 style={pageTitleStyle}>Document Templates</h1>
            <p style={pageSubtitleStyle}>
              EA-compliant templates for employment contracts, policies,
              letters, and forms.
            </p>
          </div>
        </div>

        <div role="group" aria-label="View mode" style={viewToggleGroupStyle}>
          <button
            type="button"
            onClick={() => {
              setView("grid");
            }}
            aria-pressed={view === "grid"}
            aria-label="Grid view"
            style={viewToggleButtonStyle(view === "grid")}
          >
            <Grid3X3 size={16} />
          </button>
          <button
            type="button"
            onClick={() => {
              setView("list");
            }}
            aria-pressed={view === "list"}
            aria-label="List view"
            style={viewToggleButtonStyle(view === "list")}
          >
            <ListIcon size={16} />
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div style={filterBarStyle}>
        <div style={chipRowStyle} role="tablist" aria-label="Category filter">
          {categories.map((cat) => {
            const active = cat === activeCategory;
            return (
              <button
                key={cat}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setActiveCategory(cat);
                }}
                style={chipStyle(active)}
              >
                {cat}
              </button>
            );
          })}
        </div>

        <label style={searchWrapperStyle}>
          <Search size={14} aria-hidden="true" style={searchIconStyle} />
          <input
            type="search"
            placeholder="Search templates..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
            }}
            aria-label="Search templates"
            style={searchInputStyle}
          />
        </label>
      </div>

      {/* Result count */}
      {!loading && loadError === null && (
        <Row gap={0}>
          <span style={resultCountStyle}>{resultLabel}</span>
        </Row>
      )}

      {/* Single DataTable drives both modes. The engine surfaces its own
          loading/error/empty states inside card-grid and table modes. The
          initial load error is passed through `error` so the banner shows
          even before the adapter runs. */}
      <DataTable<DocumentTemplateRow>
        columns={columns}
        data={adapter}
        aria-label="Document templates"
        display={view === "grid" ? "card-grid" : "table"}
        renderCard={view === "grid" ? renderDocumentCard : undefined}
        cardGridColumns={{ mobile: 1, tablet: 2, desktop: 3 }}
        sorting={{ enabled: view === "list", mode: "single" }}
        filtering={{ enabled: false, globalSearch: false }}
        pagination={{
          enabled: true,
          defaultPageSize: 25,
          pageSizeOptions: [10, 25, 50, 100],
        }}
        loading={loading}
        error={loadError}
        onRowClick={(row) => {
          // H3 wave-2 parity: row-body click navigates to preview. Card-grid
          // mode wires the same handler to Card.onActivate via DataTable.
          router.push(`/documents/${String(row.id)}/preview`);
        }}
      />
    </VStack>
  );
}

/* ── Page ────────────────────────────────────────────────── */

export default function DocumentsPrismPage() {
  return (
    <LayoutProvider>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 0" }}>
        <DocumentsPrismContent />
      </div>
    </LayoutProvider>
  );
}
