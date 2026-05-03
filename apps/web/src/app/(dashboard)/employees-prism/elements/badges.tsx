/**
 * Wave-5 employees-prism domain badges.
 *
 * Recreated from the bespoke /employees route (private helpers) so the
 * new -prism route can render its own status/confirmation/invitation
 * badges without coupling back to /employees. Identical visual shape,
 * same Tailwind tokens — keeps the side-by-side pilot pattern clean.
 */

import type { ReactNode } from "react";

const STATUS_STYLES: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  invited: "bg-amber-50 text-amber-700 border-amber-200",
  inactive:
    "bg-[var(--color-gray-100)] text-[var(--color-gray-500)] border-[var(--color-gray-200)]",
};

export function StatusBadge({ status }: { status: string }): ReactNode {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_STYLES[status] || STATUS_STYLES.inactive}`}
    >
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

const CONFIRM_STYLES: Record<string, string> = {
  confirmed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  on_probation: "bg-amber-50 text-amber-700 border-amber-200",
  extended: "bg-orange-50 text-orange-700 border-orange-200",
};

export function ConfirmBadge({
  status,
}: {
  status: string | undefined;
}): ReactNode {
  if (!status) return null;
  const label = status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${CONFIRM_STYLES[status] || "bg-[var(--color-gray-100)] text-[var(--color-gray-600)] border-[var(--color-gray-200)]"}`}
    >
      {label}
    </span>
  );
}

const INVITATION_STATUS_STYLES: Record<string, string> = {
  pending: "bg-blue-50 text-blue-700 border-blue-200",
  expired: "bg-red-50 text-red-700 border-red-200",
  accepted: "bg-emerald-50 text-emerald-700 border-emerald-200",
  revoked:
    "bg-[var(--color-gray-100)] text-[var(--color-gray-500)] border-[var(--color-gray-200)]",
};

export function InvitationStatusBadge({
  status,
}: {
  status: string;
}): ReactNode {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${INVITATION_STATUS_STYLES[status] || INVITATION_STATUS_STYLES.revoked}`}
    >
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

/**
 * Profile completeness bar — sliced from /employees, uses the
 * `profileCompleteness` pure helper from the datasource module so the
 * row data stays a plain Employee with no derived fields.
 */
export function ProfileBar({ pct }: { pct: number }): ReactNode {
  return (
    <div
      className="inline-flex items-center gap-1.5"
      title={`${pct}% profile complete`}
    >
      <div className="w-14 h-1.5 bg-[var(--color-gray-100)] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${pct === 100 ? "bg-emerald-500" : "bg-[var(--color-primary)]"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-[var(--color-gray-400)]">{pct}%</span>
    </div>
  );
}
