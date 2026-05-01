/**
 * Presentation helpers for the Prism payslips pilot page.
 *
 * Split from page.tsx to keep the component file under the 200-line ceiling
 * from react-specialist rules.
 */

export function formatCurrency(amount: number): string {
  return `$${amount.toLocaleString("en-SG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Strip the ISO sort prefix from a `PayslipRow.period_label`.
 *
 * The datasource produces labels of the form "2024-01 January 2024" so that
 * string-lexicographic sort == chronological sort. The display strips the
 * prefix so the user only sees the human form.
 */
export function formatPeriodDisplay(value: unknown): string {
  if (typeof value !== "string" || !value) return "-";
  const space = value.indexOf(" ");
  return space >= 0 ? value.slice(space + 1) : value;
}
