/**
 * Prism Documents Datasource — Bridges arbor's documents API to Prism's DataTable.
 *
 * NOTE: The installed @kailash/prism-web 0.1.0 ships a `ServerDataSource<T>` type
 * but `useDataTable`'s internal state machine does not actually call `fetchData`
 * (see workspaces/fe-codegen-platform/04-validate/migration-m03-findings.md
 * § "View-mode decision" — the ServerDataSource branch is declared but dead).
 *
 * Until Prism wires server-side fetching, this module exposes a thin async
 * fetcher that the page component calls directly. The same cached array then
 * feeds BOTH the DataTable (list mode) and a custom card grid (grid mode) so a
 * view-mode toggle does not cause a refetch.
 *
 * When Prism gains real server-driven data, this file will also implement
 * ServerDataSource<DocumentTemplate> by adapting `fetchData(params)`.
 */

import { documentsApi } from "@/services/api/documents";
import type { DocumentTemplate } from "@/types/api";

/** Params accepted by the documents datasource fetch. */
export interface DocumentsFetchParams {
  /** Active category filter. "All" means no filter. */
  category: string;
  /** Global search query; matches name + description. */
  search: string;
}

/** Result from a documents datasource fetch. */
export interface DocumentsFetchResult {
  items: DocumentTemplate[];
  totalCount: number;
}

/**
 * Fetch the full (unfiltered) template set from the server.
 *
 * The arbor endpoint supports an optional `category` query parameter that
 * server-filters results, but global search is client-side only. To keep the
 * "same datasource drives both views" invariant and avoid refetching on every
 * keystroke, we fetch once unfiltered and filter in `applyClientFilters`.
 */
export async function fetchAllDocumentTemplates(): Promise<
  DocumentTemplate[]
> {
  const response = await documentsApi.listTemplates();
  return response.templates;
}

/**
 * Apply category + search filters to an already-fetched template array.
 * Pure function — no side effects, safe to call on every render.
 */
export function applyClientFilters(
  templates: DocumentTemplate[],
  params: DocumentsFetchParams,
): DocumentsFetchResult {
  let items = templates;

  if (params.category && params.category !== "All") {
    items = items.filter((t) => t.category === params.category);
  }

  const query = params.search.trim().toLowerCase();
  if (query) {
    // Parity with bespoke /documents (red-team M4): match name + description
    // only. Widening to `category` matched every Contracts row for the search
    // "contracts" even when the name/description didn't mention it — a silent
    // semantic drift from the bespoke implementation. Category filtering is
    // already exposed via the chip row.
    items = items.filter(
      (t) =>
        t.name.toLowerCase().includes(query) ||
        t.description.toLowerCase().includes(query),
    );
  }

  return { items, totalCount: items.length };
}

/**
 * Curated category order — mirrors bespoke /documents CATEGORIES constant
 * (src/app/(dashboard)/documents/page.tsx). Displayed before any categories
 * the server returns that aren't in this list (those are appended
 * alphabetically as a safety net).
 *
 * Red-team M5 fix: bespoke had a stable, curated display order; the initial
 * prism migration sorted alphabetically, silently drifting the filter-chip
 * sequence.
 */
const CURATED_CATEGORY_ORDER = [
  "Contracts",
  "Policies",
  "Letters",
  "Forms",
] as const;

/**
 * Derive the unique category set from a loaded template array. Used to build
 * the category filter chip row without hardcoding a list — categories come
 * from real API data. "All" is prepended as the "no filter" option.
 *
 * Ordering (M5 parity fix): known categories appear in `CURATED_CATEGORY_ORDER`
 * first; unknown categories (from future backend additions) are appended in
 * alphabetical order so the filter row remains stable across refreshes.
 */
export function deriveCategories(
  templates: readonly DocumentTemplate[],
): readonly string[] {
  const unique = new Set<string>();
  for (const t of templates) {
    if (t.category) unique.add(t.category);
  }
  const known: string[] = [];
  for (const c of CURATED_CATEGORY_ORDER) {
    if (unique.has(c)) {
      known.push(c);
      unique.delete(c);
    }
  }
  const unknown = Array.from(unique).sort((a, b) => a.localeCompare(b));
  return ["All", ...known, ...unknown];
}
