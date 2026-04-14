"use client";

/**
 * Documents (Prism) — Side-by-side pilot of Prism DataTable engine.
 *
 * Renders the same DocumentTemplate dataset two ways:
 *   - LIST: Prism DataTable with sortable columns, global search, row actions
 *   - GRID: Prism Grid layout primitive with local PrismDocumentCard components
 *
 * Both views are driven by a single client-side fetch. Toggling the view does
 * NOT refetch — the cached array feeds the filter pipeline, which feeds both
 * renderers. This is the "same datasource drives both views" invariant called
 * out in the M-03 migration brief.
 *
 * Compare with /documents for the bespoke implementation.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FileText,
  Grid3X3,
  List as ListIcon,
  Search,
  Shield,
} from "lucide-react";
import {
  Badge,
  Button,
  DataTable,
  Grid,
  LayoutProvider,
  Row,
  Spinner,
  VStack,
  type ColumnDef,
  type DataTableRow,
} from "@kailash/prism-web";
import type { DocumentTemplate } from "@/types/api";
import {
  applyClientFilters,
  deriveCategories,
  fetchAllDocumentTemplates,
} from "@/lib/prism-documents-datasource";
import { sanitizeErrorMessage } from "@/lib/prism-error-sanitize";
import { PrismDocumentCard } from "@/components/prism-document-card";

/* ── Row type ────────────────────────────────────────────── */

/**
 * DataTable requires rows to satisfy `Record<string, unknown>`. Our typed
 * `DocumentTemplate` interface does not have an index signature, so we define
 * an intersection type that carries both the concrete fields (for type-safe
 * cell renderers) and the index signature (for the generic constraint).
 */
type DocumentTemplateRow = DocumentTemplate & DataTableRow;

/* ── Styles ──────────────────────────────────────────────── */

const headerRowStyle = {
  display: "flex" as const,
  alignItems: "flex-start" as const,
  justifyContent: "space-between" as const,
  gap: 16,
  flexWrap: "wrap" as const,
};

const titleGroupStyle = {
  display: "flex" as const,
  alignItems: "center" as const,
  gap: 12,
};

const titleIconBoxStyle = {
  display: "flex" as const,
  alignItems: "center" as const,
  justifyContent: "center" as const,
  width: 44,
  height: 44,
  borderRadius: "var(--prism-radius-md, 8px)",
  backgroundColor: "var(--prism-color-interactive-primary-subtle, #EFF6FF)",
  color: "var(--prism-color-interactive-primary, #1E3A5F)",
};

const pageTitleStyle = {
  fontSize: "var(--prism-font-size-h2, 1.5rem)",
  fontWeight: 700,
  color: "var(--prism-color-text-primary, #0F172A)",
  margin: 0,
  lineHeight: 1.2,
};

const pageSubtitleStyle = {
  fontSize: "var(--prism-font-size-caption, 0.875rem)",
  color: "var(--prism-color-text-secondary, #64748B)",
  margin: 0,
  marginTop: 2,
};

const viewToggleGroupStyle = {
  display: "inline-flex" as const,
  alignItems: "center" as const,
  gap: 4,
  padding: 4,
  borderRadius: "var(--prism-radius-md, 8px)",
  backgroundColor: "var(--prism-color-surface-elevated, #F1F5F9)",
};

const viewToggleButtonStyle = (active: boolean) =>
  ({
    display: "inline-flex" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    width: 36,
    height: 32,
    borderRadius: "var(--prism-radius-sm, 6px)",
    border: "none",
    cursor: "pointer" as const,
    backgroundColor: active
      ? "var(--prism-color-surface-page, #FFFFFF)"
      : "transparent",
    color: active
      ? "var(--prism-color-text-primary, #0F172A)"
      : "var(--prism-color-text-secondary, #64748B)",
    boxShadow: active ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
    transition: "background-color 150ms, color 150ms",
  }) as const;

const filterBarStyle = {
  display: "flex" as const,
  alignItems: "center" as const,
  gap: 12,
  flexWrap: "wrap" as const,
};

const chipRowStyle = {
  display: "flex" as const,
  alignItems: "center" as const,
  gap: 8,
  overflowX: "auto" as const,
  flex: "1 1 auto" as const,
  minWidth: 0,
};

const chipStyle = (active: boolean) =>
  ({
    padding: "6px 12px",
    borderRadius: 9999,
    border: "none",
    cursor: "pointer" as const,
    fontSize: "var(--prism-font-size-caption, 12px)",
    fontWeight: 500,
    whiteSpace: "nowrap" as const,
    backgroundColor: active
      ? "var(--prism-color-interactive-primary, #1E3A5F)"
      : "var(--prism-color-surface-elevated, #F1F5F9)",
    color: active
      ? "var(--prism-color-text-on-primary, #FFFFFF)"
      : "var(--prism-color-text-secondary, #64748B)",
    transition: "background-color 150ms, color 150ms",
  }) as const;

const searchWrapperStyle = {
  position: "relative" as const,
  flex: "0 1 280px",
  minWidth: 200,
};

const searchIconStyle = {
  position: "absolute" as const,
  left: 10,
  top: "50%",
  transform: "translateY(-50%)",
  color: "var(--prism-color-text-tertiary, #94A3B8)",
  pointerEvents: "none" as const,
};

const searchInputStyle = {
  width: "100%",
  height: 36,
  padding: "0 12px 0 34px",
  borderRadius: "var(--prism-radius-md, 6px)",
  border: "1px solid var(--prism-color-border-default, #CBD5E1)",
  backgroundColor: "var(--prism-color-surface-page, #FFFFFF)",
  color: "var(--prism-color-text-primary, #0F172A)",
  fontSize: "var(--prism-font-size-caption, 14px)",
  outline: "none",
  boxSizing: "border-box" as const,
};

const resultCountStyle = {
  fontSize: "var(--prism-font-size-caption, 12px)",
  color: "var(--prism-color-text-secondary, #64748B)",
};

const stateBoxStyle = {
  display: "flex" as const,
  flexDirection: "column" as const,
  alignItems: "center" as const,
  justifyContent: "center" as const,
  padding: 48,
  gap: 12,
  borderRadius: "var(--prism-radius-md, 8px)",
  border: "1px dashed var(--prism-color-border-default, #E2E8F0)",
  backgroundColor: "var(--prism-color-surface-elevated, #F8FAFC)",
  textAlign: "center" as const,
};

const errorTextStyle = {
  fontSize: "var(--prism-font-size-body, 14px)",
  color: "var(--prism-color-status-error, #DC2626)",
  margin: 0,
};

const emptyTextStyle = {
  fontSize: "var(--prism-font-size-body, 14px)",
  color: "var(--prism-color-text-secondary, #64748B)",
  margin: 0,
};

/* ── Content ─────────────────────────────────────────────── */

type ViewMode = "grid" | "list";

function DocumentsPrismContent() {
  const router = useRouter();
  const [view, setView] = useState<ViewMode>("grid");
  const [activeCategory, setActiveCategory] = useState<string>("All");
  const [search, setSearch] = useState<string>("");
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadTemplates = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchAllDocumentTemplates()
      .then((data) => {
        setTemplates(data);
      })
      .catch((err: unknown) => {
        // Red-team S2 mitigation: sanitizeErrorMessage prevents raw backend
        // error bodies from surfacing in the UI banner.
        setError(sanitizeErrorMessage(err));
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    // Load-on-mount fetch. Migrating to TanStack Query is the proper
    // long-term fix (tracked repo-wide); same pattern in 15+ sibling pages.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadTemplates();
  }, [loadTemplates]);

  const categories = useMemo(() => deriveCategories(templates), [templates]);

  const filtered = useMemo<DocumentTemplate[]>(
    () =>
      applyClientFilters(templates, {
        category: activeCategory,
        search,
      }).items,
    [templates, activeCategory, search],
  );

  // Cast to row type (intersection) once so downstream consumers are typed.
  const rows = useMemo<DocumentTemplateRow[]>(
    () => filtered.map((t) => t as DocumentTemplateRow),
    [filtered],
  );

  // Reset category if the current one disappears from the data set.
  useEffect(() => {
    if (activeCategory === "All") return;
    if (!categories.includes(activeCategory)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveCategory("All");
    }
  }, [categories, activeCategory]);

  /* ── DataTable column definitions ─────────────────────── */

  const columns = useMemo<ColumnDef<DocumentTemplateRow>[]>(
    () => [
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
      {
        field: "id",
        header: "Actions",
        sortable: false,
        width: 200,
        align: "right",
        render: (_value, row) => (
          <div
            style={{
              display: "inline-flex",
              gap: 8,
              justifyContent: "flex-end",
            }}
          >
            <Link
              href={`/documents/${String(row.id)}/preview`}
              aria-label={`Preview ${row.name}`}
            >
              <Button variant="ghost" size="sm">
                Preview
              </Button>
            </Link>
            <Link
              href={`/documents/${String(row.id)}/generate`}
              aria-label={`Generate ${row.name}`}
            >
              <Button variant="primary" size="sm">
                Generate
              </Button>
            </Link>
          </div>
        ),
      },
    ],
    [],
  );

  /* ── Renderers for each body state ─────────────────────── */

  const body: ReactNode = (() => {
    if (loading) {
      return (
        <div style={stateBoxStyle}>
          <Spinner size="md" />
          <p style={emptyTextStyle}>Loading document templates...</p>
        </div>
      );
    }

    if (error !== null) {
      return (
        <div style={stateBoxStyle}>
          <Shield
            size={24}
            aria-hidden="true"
            style={{
              color: "var(--prism-color-status-error, #DC2626)",
            }}
          />
          <p style={errorTextStyle}>{error}</p>
          <Button variant="secondary" size="sm" onClick={loadTemplates}>
            Retry
          </Button>
        </div>
      );
    }

    if (rows.length === 0) {
      return (
        <div style={stateBoxStyle}>
          <FileText
            size={28}
            aria-hidden="true"
            style={{
              color: "var(--prism-color-text-tertiary, #94A3B8)",
            }}
          />
          <p style={emptyTextStyle}>
            No templates found. Try adjusting your filters.
          </p>
        </div>
      );
    }

    if (view === "list") {
      return (
        <DataTable<DocumentTemplateRow>
          columns={columns}
          data={rows}
          aria-label="Document templates"
          sorting={{ enabled: true, mode: "single" }}
          filtering={{ enabled: false, globalSearch: false }}
          pagination={{
            enabled: true,
            defaultPageSize: 25,
            pageSizeOptions: [10, 25, 50, 100],
          }}
          // Red-team H3 parity restore: bespoke /documents wraps every row in
          // a <Link> to the preview page; restore row-level navigation here so
          // clicking the row body (not just the action buttons) navigates to
          // preview, matching the bespoke affordance.
          onRowClick={(row) => {
            router.push(`/documents/${String(row.id)}/preview`);
          }}
        />
      );
    }

    // Grid mode: Prism Grid primitive + local card molecule.
    return (
      <Grid columns={{ mobile: 1, tablet: 2, desktop: 3 }} gap={16}>
        {rows.map((row) => (
          <PrismDocumentCard key={row.id} template={row} />
        ))}
      </Grid>
    );
  })();

  /* ── Render ─────────────────────────────────────────────── */

  const resultLabel = `${String(rows.length)} template${rows.length !== 1 ? "s" : ""}${
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

      {/* Result count (only when we have real data to count) */}
      {!loading && error === null && (
        <Row gap={0}>
          <span style={resultCountStyle}>{resultLabel}</span>
        </Row>
      )}

      {/* Body */}
      {body}
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
