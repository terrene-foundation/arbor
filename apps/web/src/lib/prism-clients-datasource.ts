/**
 * Prism wave-4 datasource for /clients-prism.
 *
 * Mirrors the wave-3 documents/payslips datasource shape:
 *   - one fetch entry point that returns the full unpaginated list
 *   - a pure `applyClientFilters` that the page-level adapter calls
 *     during DataTable's `fetchPage` (engine sorts + paginates client-side)
 *   - small derive helpers (sectors) + the create entry point used by
 *     the inline add-client Form
 *
 * Lives in `lib/` so it can be unit-tested independently of the page
 * shell, and so wave-5+ can import the same shape if a CSV-import or
 * inline-edit surface is added later.
 */

import { clientsApi } from "@/services/api/clients";
import type { ClientCompany } from "@/types/api";

/** Row type alias — preserved at the datasource boundary so the page does
 *  not have to import @/types/api directly. */
export type ClientRow = ClientCompany;

export interface ClientsPage {
  items: ClientRow[];
  totalCount: number;
}

export interface ClientFilterOptions {
  search?: string;
  sector?: string; // "All Sectors" or specific sector name; default = "All Sectors"
}

export interface CreateClientInput {
  name: string;
  uen: string;
  sector: string;
  employee_count: number;
}

export const ALL_SECTORS = "All Sectors" as const;

/** Fetch the full clients list. Mirrors documents-prism's
 *  `fetchAllDocumentTemplates` — backend returns unpaginated; engine
 *  paginates from the in-memory cache the React Query layer holds. */
export async function fetchAllClients(): Promise<ClientRow[]> {
  const data = await clientsApi.list();
  return data.clients;
}

/** Apply page-level search + sector filters to the cached list. Pure
 *  function — the DataTable adapter calls it inside `fetchPage` so view
 *  / filter changes never touch the network. */
export function applyClientFilters(
  clients: readonly ClientRow[],
  options: ClientFilterOptions,
): ClientsPage {
  const { search = "", sector = ALL_SECTORS } = options;
  const lowered = search.trim().toLowerCase();
  const items = clients.filter((c) => {
    const matchSearch =
      !lowered ||
      c.name.toLowerCase().includes(lowered) ||
      c.uen.toLowerCase().includes(lowered);
    const matchSector = sector === ALL_SECTORS || c.sector === sector;
    return matchSearch && matchSector;
  });
  return { items: [...items], totalCount: items.length };
}

/** Derive the sector filter dropdown options from the actual data, with
 *  `All Sectors` always at the top. */
export function deriveSectors(clients: readonly ClientRow[]): string[] {
  const unique = new Set(
    clients
      .map((c) => c.sector)
      .filter((s): s is string => typeof s === "string" && s.length > 0),
  );
  return [ALL_SECTORS, ...Array.from(unique).sort()];
}

/** Create a new client. Thin pass-through over `clientsApi.create` so the
 *  Form engine's `onSubmit` can stay decoupled from the API service path. */
export async function createClient(input: CreateClientInput): Promise<ClientRow> {
  return clientsApi.create(input);
}
