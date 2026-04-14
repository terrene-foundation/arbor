/**
 * Error message sanitisation for Prism-migrated pages.
 *
 * Purpose
 * -------
 * Red-team security finding S2 (wave-2): the `-prism` pages re-throw and
 * render raw `err.message` strings from arbor backend fetches. If a 4xx/5xx
 * body contains a stack trace, a SQL constraint message, or an internal
 * schema reference, it flows into the UI banner visible to the user. This is
 * a reflection / information-disclosure vector.
 *
 * Contract
 * --------
 * `sanitizeErrorMessage(err)` always returns a user-safe string.
 *
 * - Known typed errors (e.g. `PayslipDownloadBlockedError`) already carry a
 *   pre-composed user-safe message — that message is returned.
 * - Errors that expose an HTTP status (via `status` or `response.status`) get
 *   a status-tailored generic message.
 * - Everything else returns the generic "Something went wrong" message.
 *
 * In NO case is the raw `err.message` returned — even when the message is
 * apparently innocuous (e.g. "Network error"), we prefer the controlled
 * vocabulary so log-aggregator pivots or regex-based content sniffers don't
 * leak. The full error is still logged via `console.debug` in development
 * so operators can diagnose locally.
 *
 * Related rules
 * -------------
 * - rules/security.md § Output Encoding — user-generated content encoded before display.
 * - rules/observability.md MUST Rule 4 — never log secrets, tokens, or PII.
 */

const GENERIC_MESSAGE = "Something went wrong. Please try again.";
const AUTH_MESSAGE =
  "Your session has expired or you are not authorised. Please sign in again.";
const FORBIDDEN_MESSAGE = "You do not have permission to perform this action.";
const NOT_FOUND_MESSAGE = "We could not find what you were looking for.";
const RATE_LIMIT_MESSAGE =
  "Too many requests. Please wait a moment and try again.";
const SERVER_MESSAGE =
  "The server is having trouble right now. Please try again in a moment.";
const NETWORK_MESSAGE =
  "Could not reach the server. Check your connection and try again.";

/**
 * Marker interface for errors that have a pre-composed user-safe message.
 * Typed error classes in arbor (e.g. `PayslipDownloadBlockedError`) declare
 * this to opt into surfacing their own message verbatim.
 */
export interface UserFacingError extends Error {
  readonly isUserFacing: true;
}

function isUserFacingError(err: unknown): err is UserFacingError {
  return (
    err instanceof Error &&
    (err as Partial<UserFacingError>).isUserFacing === true
  );
}

/** Extract an HTTP status code if the error carries one. */
function extractStatus(err: unknown): number | null {
  if (typeof err !== "object" || err === null) return null;
  const anyErr = err as Record<string, unknown>;
  if (typeof anyErr.status === "number") return anyErr.status;
  const response = anyErr.response;
  if (
    typeof response === "object" &&
    response !== null &&
    typeof (response as Record<string, unknown>).status === "number"
  ) {
    return (response as Record<string, number>).status;
  }
  return null;
}

function statusToMessage(status: number): string {
  if (status === 401) return AUTH_MESSAGE;
  if (status === 403) return FORBIDDEN_MESSAGE;
  if (status === 404) return NOT_FOUND_MESSAGE;
  if (status === 408 || status === 429) return RATE_LIMIT_MESSAGE;
  if (status >= 500) return SERVER_MESSAGE;
  if (status >= 400) return GENERIC_MESSAGE;
  return GENERIC_MESSAGE;
}

/**
 * Return a user-facing message for any error.
 *
 * Also logs the original error at `console.debug` when
 * `process.env.NODE_ENV !== "production"` so developers can diagnose without
 * the full message being exposed to end users.
 */
export function sanitizeErrorMessage(err: unknown): string {
  // Dev-only diagnostic: only emit when explicitly not in production so
  // production bundles stay quiet and the full error is never shipped to
  // browser consoles in prod builds.
  if (typeof process !== "undefined" && process.env.NODE_ENV !== "production") {
    console.debug("[sanitizeErrorMessage] original error", err);
  }

  // 1. Pre-composed user-facing errors: trust them.
  if (isUserFacingError(err)) {
    return err.message;
  }

  // 2. Errors with an HTTP status: return a status-tailored generic.
  const status = extractStatus(err);
  if (status !== null) {
    return statusToMessage(status);
  }

  // 3. TypeError / network failure pattern — generic network message.
  //    `fetch` in the browser throws TypeError on connectivity failures
  //    without exposing a status.
  if (err instanceof TypeError) {
    return NETWORK_MESSAGE;
  }

  // 4. Fallback: generic message regardless of the underlying err.message.
  return GENERIC_MESSAGE;
}
