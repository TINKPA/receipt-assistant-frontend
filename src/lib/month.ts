/**
 * Calendar-month helpers shared by the Ledger's month switcher, the date
 * filter chip, and the period grouping. A "ym" is a `YYYY-MM` string; an
 * empty ym is treated by callers as "the current month".
 */

/** "May 2026" from a YYYY-MM string. */
export function monthLabelLong(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
  });
}

/** Step a YYYY-MM by `delta` months (negative = earlier), returning YYYY-MM. */
export function addMonths(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
