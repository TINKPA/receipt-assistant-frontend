/**
 * Money formatting (#184).
 *
 * Before this module every amount in the app was rendered as
 * `` `$${n.toFixed(2)}` `` — a hard-coded dollar sign. That was fine while
 * every receipt was USD and actively wrong once one wasn't: a ¥13,948.80
 * receipt rendered as "$13,948.80", which reads as a real number rather
 * than a unit error, so nobody catches it.
 *
 * The rule the app follows now:
 *
 *   - **Arithmetic is always in the workspace base currency.** Totals,
 *     group subtotals, category rollups and trends all sum
 *     `postings.amount_base_minor`, which the backend converts at the
 *     receipt's own date. Adding a CNY amount to a USD amount is never
 *     correct and is now not expressible.
 *   - **Display shows the base amount first and the original alongside
 *     it.** The primary number is the one that adds up to the total you
 *     see above it; the original is what is printed on the receipt in
 *     your hand. Both matter, so both are shown, and only one of them is
 *     ever summed.
 *
 * #216 extended the same shape to loyalty points, which are a currency
 * here too (backend #206) — with one trap that FX does not have: points
 * are stored as WHOLE UNITS while cash is stored in hundredths, so the
 * `/ 100` below is wrong for them. `formatMoney` detects a points code
 * and delegates; the scale rule and the reasoning live in
 * `src/lib/points.ts`.
 */
import { formatPoints, isPointsCurrency } from './points';

/** Symbols for the currencies this ledger actually sees. Anything else
 *  renders as an ISO code prefix (`SEK 1,234.00`), which is unambiguous
 *  and needs no maintenance. */
const SYMBOLS: Record<string, string> = {
  USD: '$',
  CNY: '¥',
  JPY: '¥',
  EUR: '€',
  GBP: '£',
  HKD: 'HK$',
  TWD: 'NT$',
  KRW: '₩',
  CAD: 'CA$',
  AUD: 'A$',
};

// Deliberately NO zero-decimal currency table (JPY/KRW/…). This ledger
// stores every amount as hundredths regardless of currency — the ingest
// prompt says "money is ALWAYS integer minor units", `toReceiptView`
// computes `total = minor / 100` unconditionally, and the backend's FX
// conversion multiplies through that same scale. A formatter that
// divided JPY by 1 instead of 100 would disagree with every other number
// on the page. If real zero-decimal support is ever wanted it has to
// start at the schema, not here.

export function currencySymbol(currency: string): string {
  return SYMBOLS[currency] ?? '';
}

/**
 * Format a minor-unit integer in `currency`.
 *
 * @param minor     Amount in minor units (cents). Sign is preserved only
 *                  if `signed` is set — callers that render expenses as
 *                  positive numbers pass the absolute value themselves.
 * @param currency  ISO-4217 code, or a points code (see the delegation
 *                  note below).
 * @param opts.maximumFractionDigits  Override for compact displays that
 *                  want a whole-dollar figure (headline totals).
 */
export function formatMoney(
  minor: number,
  currency: string,
  opts: { maximumFractionDigits?: number; signed?: boolean } = {},
): string {
  // #216 — a points leg reaching here is NOT an error, so this delegates
  // rather than throwing (the backend's `getRate()` throws on a points
  // code, but it can afford to: a blank screen is worse than a wrong
  // symbol, and every one of this function's call sites renders user-
  // visible text).
  //
  // It has to be caught HERE rather than at each call site because points
  // and cash are indistinguishable at the point of call — both are an
  // integer in a field named `amount_minor`, and only the currency code
  // says which scale it is on. Twelve call sites each had to remember;
  // now none of them do. Do not "simplify" this away: without it a
  // 42,000-point stay renders as `HYATT_PT 420.00`.
  if (isPointsCurrency(currency)) {
    return formatPoints(minor, { signed: opts.signed });
  }
  const digits = opts.maximumFractionDigits ?? 2;
  const value = minor / 100;
  const abs = Math.abs(value).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  const sym = currencySymbol(currency);
  const body = sym ? `${sym}${abs}` : `${currency} ${abs}`;
  const sign = opts.signed && value < 0 ? '−' : '';
  return `${sign}${body}`;
}

/**
 * The "as printed on the receipt" line shown under a converted amount,
 * e.g. `¥13,948.80 · 0.14658 @ Apr 17`.
 *
 * Returns null when there is nothing to disclose — same currency as the
 * base, or no conversion recorded — so a caller can render it
 * unconditionally and USD receipts stay visually identical to before.
 */
export function formatOriginalAmount(
  originalMinor: number | null,
  originalCurrency: string | null,
  fx?: { rate: number; asOfActual: string } | null,
): string | null {
  if (originalMinor === null || originalCurrency === null) return null;
  const amount = formatMoney(Math.abs(originalMinor), originalCurrency);
  if (!fx) return amount;
  return `${amount} · ${fx.rate} @ ${shortDate(fx.asOfActual)}`;
}

/** `2026-04-17` → `Apr 17`. Parsed as parts, never `new Date(iso)`, which
 *  would shift the day backwards in negative-offset timezones. */
function shortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return iso;
  }
  return new Date(y, m - 1, d).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}
