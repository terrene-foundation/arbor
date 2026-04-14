/**
 * Prism Calculator Utilities — formatting helpers shared between the
 * calculator config file and the result renderers. Lives in a separate
 * module so that prism-calculator-configs.ts can import the renderers
 * from prism-calculator-results.tsx without creating an import cycle.
 */

export const fmtMoney = (n: number): string =>
  `$${n.toLocaleString("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const fmtPct = (n: number): string => `${(n * 100).toFixed(1)}%`;

/** Coerce a Form value into a finite number, or undefined if not parseable. */
export function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

/** Coerce a Form value into a string, or "" if not present. */
export function asString(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return "";
}
