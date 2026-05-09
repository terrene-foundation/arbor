/* ── Auth / Invite Hooks ──────────────────────────────────── */

"use client";

import { useQuery } from "@tanstack/react-query";
import {
  validateInvite,
  type InviteValidation,
} from "@/services/api/employees";

/** Query keys for the invite-validation domain. */
export const authKeys = {
  all: ["auth"] as const,
  invite: (token: string | null) =>
    [...authKeys.all, "invite", token ?? "none"] as const,
};

/**
 * Validate an employee invitation token.
 *
 * staleTime=0 + refetchOnWindowFocus=false + retry=false (per F13): token
 * rotation is real (the admin can revoke a token at any time AND tokens are
 * single-use, so once validation has run successfully the next mount must
 * see the result fresh). `staleTime: Infinity` is unsafe across React
 * StrictMode + token rotation. retry=false because a failed validation is a
 * real failure — retrying against a 4xx wastes a network round trip and
 * worsens UX.
 *
 * The hook returns the raw `validateInvite` shape; the caller maps the
 * `error` shape (`{ status, message }` thrown by the service) to the
 * page-local `InviteState` discriminated union via the `error.message`
 * keyword sniff documented as a temporary bridge:
 *
 *   - `expired` → `InviteState.status = "expired"`
 *   - `already been used` / `already accepted` → `"already_used"`
 *   - `status === 404 || 400` → `"invalid"`
 *   - else → `"network_error"`
 *
 * The keyword sniff is brittle. The proper fix is for the backend to return
 * a structured `error.code` (`INVITE_EXPIRED`, `INVITE_USED`,
 * `INVITE_INVALID`) so the frontend can dispatch on a stable identifier.
 * Tracked at: https://github.com/terrene-foundation/arbor/issues/36 — once
 * the backend ships structured error codes, the keyword sniff in
 * `signup/page.tsx` (and any future caller) can be replaced by `error.code`
 * dispatch.
 */
export function useInviteValidation(token: string | null) {
  return useQuery<InviteValidation, Error>({
    queryKey: authKeys.invite(token),
    queryFn: () => validateInvite(token as string),
    enabled: !!token,
    staleTime: 0,
    refetchOnWindowFocus: false,
    retry: false,
  });
}
