/**
 * Prism wave-5 datasource for /employees-prism.
 *
 * Mirrors the wave-3+wave-4 datasource shape:
 *   - two fetch entry points (employees + invitations) — each returns
 *     an unpaginated list; the engine paginates client-side from the
 *     React Query cache
 *   - pure `applyEmployeeSearch` for external search-state filtering
 *   - resend/revoke entry points used by the invitations table's
 *     predicate-gated rowActions
 *
 * Wave-5 is the first arbor consumer to compose TWO DataTable instances
 * on one page; both adapters consume their own React Query cache + their
 * own filter state, with no cross-table coupling.
 */

import {
  employeesApi,
  type Employee,
  type Invitation,
} from "@/services/api/employees";

/* ── Row aliases (preserved at the datasource boundary) ───────────────── */

export type EmployeeRow = Employee;
export type InvitationRow = Invitation;

export interface EmployeesPage {
  items: EmployeeRow[];
  totalCount: number;
}

export interface InvitationsPage {
  items: InvitationRow[];
  totalCount: number;
}

/* ── Fetch entry points ───────────────────────────────────────────────── */

export async function fetchAllEmployees(): Promise<EmployeeRow[]> {
  const data = await employeesApi.list();
  return data.employees ?? [];
}

export async function fetchAllInvitations(): Promise<InvitationRow[]> {
  // The legacy API can return either Invitation[] or
  // { invitations: Invitation[] }. Normalize at the datasource boundary so
  // the page-level adapter never has to defend against shape drift.
  const data = await employeesApi.listInvitations();
  if (Array.isArray(data)) return data;
  const wrapped = data as unknown as { invitations?: Invitation[] };
  return wrapped.invitations ?? [];
}

/* ── External search filter (pure, replaces consumer-managed filter) ──── */

export interface EmployeeFilterOptions {
  search?: string;
}

export function applyEmployeeSearch(
  employees: readonly EmployeeRow[],
  options: EmployeeFilterOptions,
): EmployeesPage {
  const lowered = (options.search ?? "").trim().toLowerCase();
  if (!lowered) {
    return { items: [...employees], totalCount: employees.length };
  }
  const items = employees.filter(
    (e) =>
      e.name.toLowerCase().includes(lowered) ||
      e.email.toLowerCase().includes(lowered) ||
      e.department.toLowerCase().includes(lowered),
  );
  return { items, totalCount: items.length };
}

/* ── Invitation actions (predicate-gated rowActions in the page) ──────── */

export async function resendInvitation(
  id: number,
): Promise<{ invite_url: string }> {
  return employeesApi.resendInvitation(id);
}

export async function revokeInvitation(id: number): Promise<void> {
  await employeesApi.revokeInvitation(id);
}

/* ── Profile completeness (pure helper, used by the Profile column) ───── */

const PROFILE_FIELDS: (keyof Employee)[] = [
  "name",
  "email",
  "department",
  "designation",
  "employment_type",
  "start_date",
];

export function profileCompleteness(employee: Employee): number {
  let filled = 0;
  for (const key of PROFILE_FIELDS) {
    const val = employee[key];
    if (val !== null && val !== undefined && val !== "") filled++;
  }
  return Math.round((filled / PROFILE_FIELDS.length) * 100);
}
